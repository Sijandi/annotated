# Spec Compliance Matrix

Every requirement from https://annotated.lovable.app/ mapped to where it lives in this repo.

## Hard requirements (3, non-negotiable)

| # | Requirement | Implementation | File(s) |
|---|---|---|---|
| 1 | Sidebar Chrome extension as primary surface | MV3 extension with `sidePanel` API | `extension/public/manifest.json`, `extension/src/sidepanel/` |
| 2 | "File a claim" button on every annotation | Button in landing page footer, modal form posts to `claims` table | `web/app/a/[slug]/page.tsx`, `web/components/ClaimForm.tsx` |
| 3 | All clipped content links to source | `source_url` stored on every annotation, displayed prominently with `<a>` tag | `web/app/a/[slug]/page.tsx`, `supabase/migrations/0001_init.sql` |

## Spec checklist (8 items)

| # | Item | Implementation | File(s) |
|---|---|---|---|
| 1 | Max clip size: 90 seconds | Validated in extension UI before publish, enforced by worker (`min(end-start, 90)`) | `extension/src/sidepanel/components/VideoClipper.tsx`, `worker/main.py` |
| 2 | Video clips downgraded to 240p (<480p) | ffmpeg `-vf scale=-2:240` in worker | `worker/main.py` |
| 3 | Every clip links to original source URL | Stored in `annotations.source_url`, rendered on landing page | `supabase/migrations/0001_init.sql`, `web/app/a/[slug]/page.tsx` |
| 4 | Visible "File a claim" button | In landing page footer | `web/app/a/[slug]/page.tsx` |
| 5 | Account creation via X or Google only | Supabase Auth providers configured for X + Google only | `supabase/config.toml`, `extension/src/lib/auth.ts` |
| 6 | Public-facing social feed with follow + comment | Feed at `/feed`, follow via `follows` table, comments via `comments` table | `web/app/feed/page.tsx`, `supabase/migrations/0001_init.sql` |
| 7 | Commentary supports text and recorded audio | `commentary_text` and `commentary_audio_url` columns; recorder in extension | `extension/src/sidepanel/components/AudioRecorder.tsx`, `supabase/migrations/0001_init.sql` |
| 8 | Sidebar Chrome extension is primary surface | Extension is the capture interface; web app is for consumption | All of `extension/` |

## Source types supported

| Type | Detection | Capture method | Worker action |
|---|---|---|---|
| YouTube | URL match `youtube.com/watch` or `youtu.be` | Inject script to read player.currentTime | yt-dlp download + ffmpeg clip + scale to 240p |
| News article | `<article>` tag or OG type=article | `window.getSelection()` for highlights | Store text + metadata, no media processing |
| Podcast | `<audio>` element on page OR `og:type=podcast` | Read audio element's currentTime + src | ffmpeg clip to 90s mp3 |

## User journey (6 steps from spec)

| Step | Where it happens |
|---|---|
| 1. Sign up via X or Google | Extension login screen → Supabase Auth |
| 2. Pick a source (URL or current page) | Extension auto-detects active tab |
| 3. Choose what to clip | Extension capture UI per source type |
| 4. Generate clip + landing page | Extension creates annotation row → worker transcodes → web app renders |
| 5. Add commentary (text or audio) | Extension commentary editor |
| 6. Browse social feed | Web app feed + extension feed tab |

## Verification before submission

Run through this checklist as a final pass:

- [ ] Can a fresh user install the extension and sign in via X?
- [ ] Can a fresh user install the extension and sign in via Google?
- [ ] Does the sidebar detect a YouTube video correctly?
- [ ] Does the sidebar detect an article correctly?
- [ ] Does the sidebar detect a podcast (audio element) correctly?
- [ ] Can a user clip a 90-second YouTube segment and see it transcoded to 240p?
- [ ] Can a user clip a 91-second segment? (Should be rejected.)
- [ ] Can a user record audio commentary and play it back on the landing page?
- [ ] Can a user write text commentary?
- [ ] Does the landing page show the source URL as a clickable link?
- [ ] Does the landing page show a "File a claim" button?
- [ ] Does clicking "File a claim" open a working form?
- [ ] Does submitting a claim insert a row in the `claims` table?
- [ ] Can a user follow another user from the feed?
- [ ] Can a user comment on an annotation?
- [ ] Does the feed show seeded annotations + the user's own?
