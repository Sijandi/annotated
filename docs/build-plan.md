# Build Plan — 5 Days

Hard ceiling: 60 hours total. Target: 44 hours.

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│  Chrome Ext     │    │  Web App     │    │  Worker         │
│  (sidepanel)    │    │  (Lovable)   │    │  (Railway)      │
│                 │    │              │    │                 │
│  Capture UI     │    │  Landing pgs │    │  yt-dlp         │
│  Clip start/end │    │  Social feed │    │  ffmpeg         │
│  Audio recorder │    │  Comments    │    │  Transcode 240p │
│  OAuth handoff  │    │  Claim form  │    │                 │
└────────┬────────┘    └──────┬───────┘    └────────┬────────┘
         │                    │                     │
         │                    │                     │
         └────────────┬───────┴─────────────────────┘
                      │
              ┌───────▼────────┐
              │  Supabase      │
              │  Auth (X+Goog) │
              │  Postgres      │
              │  Storage       │
              │  Edge Function │ → triggers Worker on annotation insert
              └────────────────┘
```

## Day 1 — Foundation (8h)

**Morning (4h)**
- [ ] Create Supabase project
- [ ] Configure X (Twitter) OAuth provider — get client ID/secret from X dev portal
- [ ] Configure Google OAuth provider — get client ID/secret from Google Cloud Console
- [ ] Run base migration (`supabase/migrations/0001_init.sql`)
- [ ] Set up RLS policies (`supabase/migrations/0002_rls.sql`)
- [ ] Create storage buckets: `clips` (public), `commentary` (public), `avatars` (public)

**Afternoon (4h)**
- [ ] Email LAUNCH team to confirm: extension + Lovable web app submission format is acceptable, no deadline-related concerns
- [ ] Create Lovable project from the spec — auth pages, annotation route `/a/[slug]`, feed page, claim form, profile page stub
- [ ] Wire Lovable to Supabase
- [ ] Deploy Lovable web app, get production URL
- [ ] Buy domain (optional, Lovable subdomain is fine for v1)

**End of day:** Backend live. Web app skeleton deployed. OAuth providers configured.

## Day 2 — Extension Scaffold (10h)

**Morning (5h)**
- [ ] `cd extension && npm init` — Vite + React + TypeScript template
- [ ] Install: `@crxjs/vite-plugin`, `@supabase/supabase-js`, `tailwindcss`, `lucide-react`
- [ ] Configure `manifest.json` (see `extension/public/manifest.json`)
- [ ] Build sidepanel scaffold: routing (capture / feed / profile), Tailwind setup
- [ ] Service worker (`background.ts`) — handles `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`

**Afternoon (5h)**
- [ ] OAuth flow: `chrome.identity.launchWebAuthFlow` → Supabase session → store in `chrome.storage.local`
- [ ] Configure Supabase OAuth redirect to extension's `https://<extension-id>.chromiumapp.org/`
- [ ] Login screen with two buttons (X / Google)
- [ ] Auth state hook, protected routes
- [ ] Test: sign in works, session persists across sidebar reopens

**End of day:** Extension loads, sidebar opens, user can sign in via X or Google.

## Day 3 — Capture Mechanics (10h)

**Morning (5h)**
- [ ] Active tab detection — read URL, classify as `youtube` / `article` / `podcast`
- [ ] Source metadata fetcher — Open Graph parser for articles, YouTube oEmbed for videos
- [ ] YouTube clip UI: read current player time via injected content script, "Set start" / "Set end" buttons, validate ≤90s
- [ ] Article highlight UI: `chrome.scripting.executeScript` to grab `window.getSelection()`, display in sidebar with edit option
- [ ] Podcast detection: detect `<audio>` element on page, get current time + src URL

**Afternoon (5h)**
- [ ] Audio commentary recorder: `MediaRecorder` API, waveform visualization, upload to Supabase Storage
- [ ] Text commentary editor: simple textarea with character count
- [ ] Publish button: creates annotation row in DB with `status='processing'`, returns slug, opens landing page in new tab
- [ ] Loading states everywhere

**End of day:** Capture flow works end-to-end (without transcoding). Annotation rows get created.

## Day 4 — Transcoding + Publish (8h)

**Morning (4h)**
- [ ] `worker/Dockerfile` — Python 3.11 + yt-dlp + ffmpeg + FastAPI
- [ ] `worker/main.py` — POST `/transcode` endpoint, processes annotation, uploads result to Supabase Storage, updates annotation row
- [ ] Deploy worker to Railway, get webhook URL
- [ ] Set worker env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `WORKER_SECRET`

**Afternoon (4h)**
- [ ] Supabase Edge Function `on-annotation-insert` — listens for new rows with `status='processing'`, calls worker webhook with annotation data
- [ ] Database trigger to invoke edge function on insert
- [ ] Wire web app annotation page (`/a/[slug]`) to:
  - Show clip player when `media_url` is set
  - Show "Processing..." spinner when `status='processing'`
  - Render audio commentary with waveform
  - Display source link prominently
  - Show "File a claim" button bottom-right
- [ ] Test full path: sidebar publish → edge function → worker → storage → landing page renders

**End of day:** End-to-end publish works. Real transcoded YouTube clips at 240p. Landing pages live.

## Day 5 — Social Feed + Claims + Polish (8h)

**Morning (4h)**
- [ ] Web app: feed query (latest annotations, optionally filter by follow graph)
- [ ] Follow / unfollow buttons (web app + extension feed view)
- [ ] Comments: list + post form on annotation page
- [ ] File-a-claim: form posts to `claims` table, sends email via Resend (Supabase trigger)
- [ ] Seed database with 5–6 fake annotations for demo (see `docs/seed-data.md`)

**Afternoon (4h)**
- [ ] End-to-end test of demo storyboard
- [ ] Record screen capture of demo (multiple takes)
- [ ] Record voiceover narration
- [ ] Edit in DaVinci Resolve / CapCut: trim dead time, burn captions, add closing card
- [ ] Upload to YouTube unlisted, get URL
- [ ] Submit at https://annotated.lovable.app/enter

**End of day:** Submitted.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| YouTube extraction breaks (yt-dlp/YT cat-and-mouse) | Pin yt-dlp version in Dockerfile. Add graceful error: "Couldn't process this video, try another." |
| OAuth in extension is fiddly | Configure Supabase redirect URL to `chromiumapp.org` on day 1. Test before building anything else. |
| Supabase Edge Function → worker timing | Use a webhook with retry. Worker is idempotent (checks if `media_url` is already set). |
| Lovable can't generate exactly what we need | Use Lovable for scaffolding, then export and edit by hand for the annotation page + claim form. |
| ffmpeg/yt-dlp on Railway free tier too slow | Upgrade to Hobby plan ($5/mo). Each transcode takes <60s for 90s clip at 240p. |
| Submission format ambiguity | Email LAUNCH team day 1. |

## Out of scope (v2)

- Profile pages with annotation history
- Search / discovery
- Notifications
- Mobile-responsive web app
- Multi-clip threads
- Annotations on annotations
- Browsers other than Chrome
- Markdown/rich text in commentary
- Embed support (Twitter/X embeds, etc.)

## Definition of done

Submitted at https://annotated.lovable.app/enter with:
- Working extension (loaded unpacked, GitHub repo public)
- Working web app at production URL
- 90-second demo video on YouTube unlisted
- All 9 spec items demonstrably working in the demo
- Twitter/X handle in submission for follow-up
