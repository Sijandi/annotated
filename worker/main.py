"""
Annotated transcoding worker.

Receives webhook from Supabase Edge Function on new annotations,
downloads source media via yt-dlp, clips and downscales via ffmpeg,
uploads to Supabase Storage, updates the annotation row.

Deploy on Railway. Required env vars:
  SUPABASE_URL
  SUPABASE_SERVICE_KEY  (service role, bypasses RLS)
  WORKER_SECRET         (shared with edge function)
"""
import os
import subprocess
import tempfile
from pathlib import Path

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
    """Download, clip, downscale, upload, update DB row."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)

            if source_type == "youtube":
                output_path = tmppath / f"{annotation_id}.mp4"
                _process_youtube(source_url, start, duration, output_path)
                storage_path = f"{annotation_id}.mp4"
                content_type = "video/mp4"
            elif source_type == "podcast":
                output_path = tmppath / f"{annotation_id}.mp3"
                _process_podcast(source_url, start, duration, output_path)
                storage_path = f"{annotation_id}.mp3"
                content_type = "audio/mpeg"
            else:
                raise ValueError(f"unsupported source_type: {source_type}")

            # Upload to Supabase Storage
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
        print(f"[worker] subprocess failed for {annotation_id}: {e.stderr}")
        sb.table("annotations").update({
            "status": "failed",
            "error_message": f"transcode failed: {str(e)[:500]}",
        }).eq("id", annotation_id).execute()
    except Exception as e:
        print(f"[worker] error processing {annotation_id}: {e}")
        sb.table("annotations").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", annotation_id).execute()


def _process_youtube(url: str, start: float, duration: float, output_path: Path):
    """Download YouTube clip and downscale to 240p in one yt-dlp invocation."""
    end = start + duration
    cmd = [
        "yt-dlp",
        "--download-sections", f"*{start}-{end}",
        "--force-keyframes-at-cuts",
        "-f", "bv*[height<=480]+ba/b[height<=480]/b",
        "--postprocessor-args",
        f"ffmpeg:-vf scale=-2:{TARGET_HEIGHT} -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 96k",
        "--merge-output-format", "mp4",
        "-o", str(output_path),
        url,
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=300)


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
