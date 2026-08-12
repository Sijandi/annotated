"""
Annotated transcoding worker.

Receives webhook from Supabase Edge Function on new annotations.
For YouTube: downloads raw client-captured clip from Supabase Storage,
downscales to 240p with ffmpeg, re-uploads processed version.
For podcasts: downloads from audio URL, clips with ffmpeg.

Deploy on Railway. Required env vars:
  SUPABASE_URL
  SUPABASE_SERVICE_KEY  (service role, bypasses RLS)
  WORKER_SECRET         (shared with edge function)
"""
import os
import subprocess
import tempfile
from pathlib import Path

import httpx
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel
from supabase import Client, create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
WORKER_SECRET = os.environ["WORKER_SECRET"]

MAX_CLIP_SECONDS = 90
TARGET_HEIGHT = 240  # spec: 240px, must be < 480p

app = FastAPI(title="annotated-worker")
sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


class TranscodeRequest(BaseModel):
    annotation_id: str
    source_url: str
    source_type: str  # 'youtube' or 'podcast'
    start: float
    end: float


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/transcode")
async def transcode(
    req: TranscodeRequest,
    bg: BackgroundTasks,
    authorization: str = Header(None),
):
    if authorization != f"Bearer {WORKER_SECRET}":
        raise HTTPException(status_code=401, detail="invalid auth")

    if req.source_type not in {"youtube", "podcast"}:
        raise HTTPException(status_code=400, detail="unsupported source_type")

    duration = min(req.end - req.start, MAX_CLIP_SECONDS)
    if duration <= 0:
        raise HTTPException(status_code=400, detail="invalid clip bounds")

    bg.add_task(
        process_clip,
        annotation_id=req.annotation_id,
        source_url=req.source_url,
        source_type=req.source_type,
        start=req.start,
        duration=duration,
    )
    return {"queued": req.annotation_id, "duration": duration}


def process_clip(annotation_id: str, source_url: str, source_type: str, start: float, duration: float):
    """Download, transcode, upload, update DB row."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)

            if source_type == "youtube":
                output_path = tmppath / f"{annotation_id}.mp4"
                _process_youtube(annotation_id, output_path)
                storage_path = f"{annotation_id}.mp4"
                content_type = "video/mp4"
            elif source_type == "podcast":
                output_path = tmppath / f"{annotation_id}.mp3"
                # Get the actual audio URL from the annotation's media_url field
                result = sb.table("annotations").select("media_url").eq("id", annotation_id).single().execute()
                audio_url = result.data.get("media_url") or source_url
                _process_podcast(audio_url, start, duration, output_path)
                storage_path = f"{annotation_id}.mp3"
                content_type = "audio/mpeg"
            else:
                raise ValueError(f"unsupported source_type: {source_type}")

            # Upload processed clip to Supabase Storage
            with open(output_path, "rb") as f:
                sb.storage.from_("clips").upload(
                    storage_path,
                    f.read(),
                    {"content-type": content_type, "upsert": "true"},
                )

            media_url = sb.storage.from_("clips").get_public_url(storage_path)

            sb.table("annotations").update({
                "media_url": media_url,
                "status": "published",
            }).eq("id", annotation_id).execute()

            print(f"[worker] published annotation {annotation_id}")

    except subprocess.CalledProcessError as e:
        stderr = e.stderr or ""
        print(f"[worker] subprocess failed for {annotation_id}: {stderr}")
        sb.table("annotations").update({
            "status": "failed",
            "error_message": f"transcode failed: {stderr[:500]}",
        }).eq("id", annotation_id).execute()
    except Exception as e:
        print(f"[worker] error processing {annotation_id}: {e}")
        sb.table("annotations").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", annotation_id).execute()


def _process_youtube(annotation_id: str, output_path: Path):
    """Download raw clip from Supabase Storage, crop to the player (if crop
    metadata was uploaded alongside it), downscale to 240p mp4."""
    tmpdir = output_path.parent

    # Get the annotation to find the raw clip URL
    result = sb.table("annotations").select("media_url").eq("id", annotation_id).single().execute()
    raw_url = result.data.get("media_url")
    if not raw_url:
        raise RuntimeError("No raw clip URL found on annotation")

    # Download the raw webm from Storage
    raw_path = tmpdir / "raw.webm"
    with httpx.stream("GET", raw_url, timeout=120, follow_redirects=True) as resp:
        resp.raise_for_status()
        with open(raw_path, "wb") as f:
            for chunk in resp.iter_bytes(8192):
                f.write(chunk)

    print(f"[worker] downloaded raw clip: {raw_path.stat().st_size} bytes")

    # Crop to player (when the extension uploaded crop metadata), then downscale
    vf = _build_video_filter(_fetch_crop_info(raw_url), raw_path)
    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(raw_path),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "28",
        "-c:a", "aac", "-b:a", "96k",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120)


def _fetch_crop_info(raw_url: str) -> dict | None:
    """Fetch the sidecar crop JSON uploaded next to the raw clip
    (clips/raw/<user>/<slug>.crop.json). Absent for canvas-fallback captures
    and legacy clips — returns None and the clip is processed uncropped."""
    if ".webm" not in raw_url:
        return None
    crop_url = raw_url.split(".webm", 1)[0] + ".crop.json"
    try:
        resp = httpx.get(crop_url, timeout=30, follow_redirects=True)
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception as e:
        print(f"[worker] crop metadata fetch failed ({crop_url}): {e}")
        return None


def _probe_dimensions(video_path: Path) -> tuple[int, int]:
    """Return (width, height) of the first video stream via ffprobe."""
    out = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0",
            str(video_path),
        ],
        check=True, capture_output=True, text=True, timeout=30,
    )
    width, height = out.stdout.strip().splitlines()[0].split(",")[:2]
    return int(width), int(height)


def _build_video_filter(crop_info: dict | None, raw_path: Path) -> str:
    """ffmpeg -vf chain: crop the tab recording to the player rect (if crop
    metadata is present and sane), then downscale. Any problem with the crop
    data degrades gracefully to plain downscaling."""
    scale = f"scale=-2:{TARGET_HEIGHT}"
    if not crop_info:
        return scale
    try:
        rect = crop_info["rect"]
        viewport = crop_info.get("viewport") or {}
        dpr = float(crop_info.get("dpr", 1)) or 1.0
        frame_w, frame_h = _probe_dimensions(raw_path)

        # The captured frame is nominally viewport * devicePixelRatio, but
        # Chrome may cap the capture resolution — derive the actual CSS-px →
        # frame-px scale from the frame itself when the viewport is known.
        sx = frame_w / viewport["width"] if viewport.get("width") else dpr
        sy = frame_h / viewport["height"] if viewport.get("height") else dpr

        x = max(0, min(int(rect["x"] * sx), frame_w - 2))
        y = max(0, min(int(rect["y"] * sy), frame_h - 2))
        w = min(int(rect["width"] * sx), frame_w - x)
        h = min(int(rect["height"] * sy), frame_h - y)
        if w < 16 or h < 16:
            print(f"[worker] crop region too small ({w}x{h}), skipping crop")
            return scale

        print(f"[worker] applying crop={w}:{h}:{x}:{y} (frame {frame_w}x{frame_h})")
        return f"crop={w}:{h}:{x}:{y},{scale}"
    except Exception as e:
        print(f"[worker] invalid crop metadata, skipping crop: {e}")
        return scale


def _process_podcast(audio_url: str, start: float, duration: float, output_path: Path):
    """ffmpeg direct on audio URL — clip a 90s segment as mp3."""
    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(start),
        "-t", str(duration),
        "-i", audio_url,
        "-acodec", "libmp3lame",
        "-b:a", "128k",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120)
