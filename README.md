# Annotated

A Chrome sidebar extension for clipping and annotating media (YouTube, news articles, podcasts) with a public social feed. Built for the [$5K J-Cal bounty](https://annotated.lovable.app/).

## What this is

Three-tier app:

1. **Chrome sidebar extension** (`extension/`) — capture surface. Manifest V3, `sidePanel` API, React + Vite.
2. **Web app** (`web/`) — public landing pages, social feed, file-a-claim flow. Built in Lovable, exported here.
3. **Backend** (`supabase/`, `worker/`) — Supabase for auth/Postgres/storage. A separate Python worker on Railway runs `yt-dlp` + `ffmpeg` for video transcoding, since Supabase Edge Functions can't shell out to system binaries.

## Submission target

- Live extension (loaded unpacked + GitHub link)
- Live web app URL
- 90-second demo video (see `docs/storyboard.md`)
- Submitted to https://annotated.lovable.app/enter

## Spec compliance

Every checkbox on Jason's spec maps to a file in this repo. See `docs/spec-compliance.md`.

## Quick start

```bash
# 1. Backend
cd supabase && supabase start && supabase db push

# 2. Extension (dev mode)
cd extension && npm install && npm run dev
# Then load /extension/dist as unpacked extension in chrome://extensions

# 3. Web app
cd web && npm install && npm run dev

# 4. Worker (transcoding)
cd worker && docker build -t annotated-worker . && docker run -p 8000:8000 annotated-worker
```

See `docs/build-plan.md` for the full 5-day plan.

## Repo layout

```
annotated/
├── docs/                    storyboard, build plan, spec compliance, demo script
├── extension/               Chrome MV3 sidebar extension (Vite + React)
├── web/                     public web app (Lovable-generated, exported)
├── supabase/                migrations, RLS policies, edge functions
├── worker/                  Python yt-dlp + ffmpeg transcoder (Railway)
└── .github/workflows/       CI for extension build
```

## Status

Day 0 — repo scaffold complete. Build starts now.
