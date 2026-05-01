# Worker

Python service that downloads source media via `yt-dlp`, clips and downscales via `ffmpeg`, and uploads to Supabase Storage.

Why a separate worker instead of Supabase Edge Functions: Supabase Edge runs Deno without system binaries, so no `ffmpeg` or `yt-dlp`. Railway gives us a real Linux container with both for ~$5/month.

## Deploy on Railway

```bash
railway login
railway init
railway up
railway variables set \
  SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_SERVICE_KEY=<service-role-key> \
  WORKER_SECRET=<generate-a-strong-secret>
```

Get the public URL from the Railway dashboard. Set it on the Supabase edge function:

```bash
supabase secrets set WORKER_URL=https://your-worker.up.railway.app
supabase secrets set WORKER_SECRET=<same-secret-as-above>
```

## Local dev

```bash
cd worker
docker build -t annotated-worker .
docker run -p 8000:8000 \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_KEY=... \
  -e WORKER_SECRET=test \
  annotated-worker
```

Test:

```bash
curl -X POST http://localhost:8000/transcode \
  -H "Authorization: Bearer test" \
  -H "Content-Type: application/json" \
  -d '{
    "annotation_id": "00000000-0000-0000-0000-000000000001",
    "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "source_type": "youtube",
    "start": 30,
    "end": 120
  }'
```

## Notes

- yt-dlp version pinned in `requirements.txt`. YouTube changes their player periodically; if extraction breaks, bump to the latest yt-dlp release.
- `--force-keyframes-at-cuts` makes the clip boundaries clean instead of relying on the nearest keyframe (slightly slower but produces frame-accurate cuts).
- Output is always `<= 240px` height per spec ("downgrade to 240 pixels (< 480p)").
- Worker is idempotent: rerunning the same `annotation_id` overwrites the storage object via `upsert: true`.
