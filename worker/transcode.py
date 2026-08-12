"""Pure ffmpeg transcode logic for Annotated clips.

Shared by both deployment modes:
  - main.py   — FastAPI webhook worker (Railway, service-role credentials)
  - poller.py — keyless poller (any box with ffmpeg, no Supabase credentials)

No Supabase or third-party dependencies. Python 3.9+ compatible.
"""
import os
import subprocess
from pathlib import Path
from typing import Optional, Tuple

FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE_BIN", "ffprobe")

MAX_CLIP_SECONDS = 90
TARGET_HEIGHT = 240  # spec: 240p, must be < 480p


def probe_dimensions(video_path: Path) -> Tuple[int, int]:
    """Return (width, height) of the first video stream via ffprobe."""
    out = subprocess.run(
        [
            FFPROBE, "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0",
            str(video_path),
        ],
        check=True, capture_output=True, text=True, timeout=30,
    )
    width, height = out.stdout.strip().splitlines()[0].split(",")[:2]
    return int(width), int(height)


def build_video_filter(crop_info: Optional[dict], raw_path: Path) -> str:
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
        frame_w, frame_h = probe_dimensions(raw_path)

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
            print(f"[transcode] crop region too small ({w}x{h}), skipping crop")
            return scale

        print(f"[transcode] applying crop={w}:{h}:{x}:{y} (frame {frame_w}x{frame_h})")
        return f"crop={w}:{h}:{x}:{y},{scale}"
    except Exception as e:
        print(f"[transcode] invalid crop metadata, skipping crop: {e}")
        return scale


def transcode_youtube(raw_path: Path, crop_info: Optional[dict], output_path: Path,
                      duration: Optional[float] = None) -> None:
    """Raw tab-capture webm → cropped, 240p H.264 mp4 with AAC audio.

    The recording runs ~0.5s past the marked clip end (tail tolerance), so the
    output is clamped to the exact requested duration — a user who marks 90s
    gets 90.0s, never 90.5s."""
    vf = build_video_filter(crop_info, raw_path)
    cmd = [FFMPEG, "-y", "-i", str(raw_path)]
    if duration and duration > 0:
        cmd += ["-t", f"{min(duration, MAX_CLIP_SECONDS):.3f}"]
    cmd += [
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "28",
        "-c:a", "aac", "-b:a", "96k",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120)


def transcode_podcast(audio_url: str, start: float, duration: float, output_path: Path) -> None:
    """Clip a segment straight from the source audio URL as 128k mp3."""
    duration = min(duration, MAX_CLIP_SECONDS)
    cmd = [
        FFMPEG, "-y",
        "-ss", str(start),
        "-t", str(duration),
        "-i", audio_url,
        "-acodec", "libmp3lame",
        "-b:a", "128k",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120)
