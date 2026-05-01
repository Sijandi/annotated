# Annotated

A Chrome sidebar extension for clipping and annotating media (YouTube, news articles, podcasts) with a public social feed. Built for the [$5K J-Cal bounty](https://annotated.lovable.app/).

**Live:** [annotated-app.vercel.app](https://annotated-app.vercel.app)

## What it does

1. Open the Chrome sidebar on any YouTube video, news article, or podcast page
2. Set start/end to clip a video segment (max 90s), or highlight text from an article
3. Add text or recorded audio commentary
4. Publish — generates a shareable landing page with the clip, your commentary, source link, and a fair-use claim button
5. Browse the public feed, follow other annotators, comment on clips

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│  Chrome Ext     │    │  Web App     │    │  Worker         │
│  (sidebar)      │    │  (Next.js)   │    │  (Railway)      │
│                 │    │              │    │                 │
│  Capture UI     │    │  Landing pgs │    │  ffmpeg         │
│  Clip start/end │    │  Social feed │    │  Downscale 240p │
│  Audio recorder │    │  Comments    │    │                 │
│  OAuth          │    │  Claim form  │    │                 │
└────────┬────────┘    └──────┬───────┘    └────────┬────────┘
         │                    │                     │
         └────────────┬───────┴─────────────────────┘
                      │
              ┌───────▼────────┐
              │  Supabase      │
              │  Auth (X+Goog) │
              │  Postgres      │
              │  Storage       │
              │  Edge Function │
              └────────────────┘
```

## Install the extension

```bash
git clone https://github.com/Sijandi/annotated.git
cd annotated/extension
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/dist` folder
4. Click the Annotated icon → sidebar opens

## Tech stack

- **Extension:** React, Vite, Tailwind, Manifest V3 sidePanel API, `captureStream` for video+audio capture
- **Web app:** Next.js 16, Tailwind, Supabase SSR
- **Backend:** Supabase (Auth, Postgres, Storage, Edge Functions), Railway (Python + ffmpeg worker)
- **Auth:** OAuth via X (Twitter) and Google

## Spec compliance

All 3 hard requirements and 8 spec items implemented. See [`docs/spec-compliance.md`](docs/spec-compliance.md).

| Requirement | Status |
|---|---|
| Chrome sidebar extension as primary surface | ✅ |
| File a claim button on every annotation | ✅ |
| All content links to source URL | ✅ |
| Max 90-second clips | ✅ |
| Video downscaled to 240p | ✅ |
| OAuth via X or Google only | ✅ |
| Public feed with follow + comment | ✅ |
| Text + audio commentary | ✅ |

## Repo layout

```
annotated/
├── extension/     Chrome MV3 sidebar extension (React + Vite)
├── web/           Next.js 16 web app (landing, feed, annotation pages)
├── worker/        Python transcoding worker (ffmpeg, deployed on Railway)
├── supabase/      Migrations, RLS policies, edge functions
└── docs/          Storyboard, build plan, spec compliance
```
