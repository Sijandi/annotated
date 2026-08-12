"""Keyless transcode poller for Annotated.

Holds NO Supabase credentials. Polls the `worker-api` edge function for
pending jobs, transcodes locally with ffmpeg, and posts results back. All
privileged operations (storage writes, status updates) happen inside the
edge function, which authenticates this worker by the SHA-256 hash of a
shared secret. Complements the webhook worker (main.py): the webhook gives
low latency, this poller gives self-healing — any job the webhook misses
(worker down, delivery failure) is picked up on the next poll.

Runs anywhere with python3 (3.9+, stdlib only) and ffmpeg.

Env:
  SUPABASE_URL         e.g. https://xxxx.supabase.co        (required)
  SUPABASE_ANON_KEY    the project's public anon key         (required)
  WORKER_SECRET        shared secret, or
  WORKER_SECRET_FILE   path to a file containing it
  POLL_INTERVAL        seconds between polls (default 20)
  FFMPEG_BIN / FFPROBE_BIN  binary paths (default: on PATH)
"""
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from transcode import transcode_podcast, transcode_youtube

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "20"))
API = f"{SUPABASE_URL}/functions/v1/worker-api"


def _load_secret() -> str:
    if os.environ.get("WORKER_SECRET"):
        return os.environ["WORKER_SECRET"].strip()
    path = os.environ.get("WORKER_SECRET_FILE")
    if path and Path(path).exists():
        return Path(path).read_text().strip()
    sys.exit("poller: set WORKER_SECRET or WORKER_SECRET_FILE")


SECRET = _load_secret()
HEADERS = {"Authorization": f"Bearer {ANON_KEY}", "x-worker-secret": SECRET}


def api(op: str, method: str = "GET", params: str = "", body: bytes = None,
        content_type: str = "application/octet-stream") -> dict:
    req = urllib.request.Request(
        f"{API}?op={op}{params}", data=body, method=method,
        headers={**HEADERS, "Content-Type": content_type},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            f.write(chunk)


def fetch_crop_info(raw_url: str) -> dict:
    """Sidecar crop JSON uploaded next to the raw clip; absent for canvas
    fallbacks and legacy clips."""
    if ".webm" not in raw_url:
        return None
    try:
        req = urllib.request.Request(raw_url.split(".webm", 1)[0] + ".crop.json")
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def process(job: dict) -> None:
    jid = job["id"]
    source_type = job["source_type"]
    start = float(job.get("clip_start_seconds") or 0)
    end = float(job.get("clip_end_seconds") or 0)
    print(f"[poller] processing {jid} ({source_type})")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        if source_type == "youtube":
            raw_url = job.get("media_url")
            if not raw_url:
                raise RuntimeError("youtube job has no raw media_url")
            raw_path = tmppath / "raw.webm"
            download(raw_url, raw_path)
            out = tmppath / f"{jid}.mp4"
            transcode_youtube(raw_path, fetch_crop_info(raw_url), out)
            ext = "mp4"
        elif source_type == "podcast":
            audio_url = job.get("media_url")
            if not audio_url:
                raise RuntimeError("podcast job has no source media_url")
            out = tmppath / f"{jid}.mp3"
            transcode_podcast(audio_url, start, max(end - start, 1), out)
            ext = "mp3"
        else:
            raise RuntimeError(f"unsupported source_type: {source_type}")

        result = api("complete", "POST", f"&id={jid}&ext={ext}", out.read_bytes(),
                     "video/mp4" if ext == "mp4" else "audio/mpeg")
        print(f"[poller] published {jid} -> {result.get('media_url', '?')}")


def main() -> None:
    print(f"[poller] watching {API} every {POLL_INTERVAL}s")
    while True:
        try:
            jobs = api("pending").get("jobs") or []
            for job in jobs:
                try:
                    process(job)
                except Exception as e:
                    print(f"[poller] job {job.get('id')} failed: {e}")
                    try:
                        api("fail", "POST", f"&id={job['id']}",
                            json.dumps({"error": str(e)[:500]}).encode(),
                            "application/json")
                    except Exception as e2:
                        print(f"[poller] could not report failure: {e2}")
        except urllib.error.HTTPError as e:
            print(f"[poller] api error {e.code}: {e.read().decode()[:200]}")
        except Exception as e:
            print(f"[poller] poll error: {e}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
