# Demo Storyboard — 90 seconds

The submission is judged on the demo video. Everything we build serves this storyboard.

## Source material

- **Episode:** TWiST E~2280 — "An AI 'holding company' rebuilt dozens of YC Winter '26 startups in one weekend" (late April 2026)
- **Channel:** This Week in Startups, YouTube
- **Clip target:** 60–90 second solo Jason monologue making his strongest point about AI rebuild speed
- **Exact timestamps:** TBD when we watch the episode and pick the cleanest moment. Aim for the 12:00–14:00 range or wherever his most quotable take lands.

## Pre-production checklist

- [ ] Seed database with 5–6 fake annotations (mix: TWiST clips, news article highlights, podcast snippet) with believable usernames and varied commentary lengths
- [ ] Pre-create user account `@philv` with avatar
- [ ] TWiST episode loaded in Chrome tab, paused near clip start
- [ ] OBS configured: 1080p, 30fps, single monitor capture
- [ ] Voiceover script printed/visible off-screen
- [ ] Run the entire flow end-to-end before recording

## Beat-by-beat (90 seconds total)

### 0:00–0:05 — Cold open (5s)
- **Screen:** Tight zoom on Annotated extension icon in Chrome toolbar. Single click. Sidebar slides open.
- **VO:** "Annotated is a Chrome sidebar extension for clipping and annotating media from anywhere on the web."
- **Spec:** Sidebar Chrome extension as primary surface (hard requirement #1)

### 0:05–0:12 — Sign in (7s)
- **Screen:** Sidebar shows "Continue with X" / "Continue with Google." Click X. Auth flashes. Sidebar shows profile avatar + username.
- **VO:** "Sign in with X or Google. No email, no password."
- **Spec:** OAuth via X/Google

### 0:12–0:25 — Source detection (13s)
- **Screen:** Cut to TWiST episode loaded on YouTube. Sidebar auto-detects: "YouTube video detected. *[episode title]*. Clip up to 90s." Source type, title, channel pulled from page.
- **VO:** "It detects what's on the page automatically — YouTube videos, news articles, or podcasts."
- **Spec:** Source detection, supported source types

### 0:25–0:40 — Clip selection (15s)
- **Screen:** User scrubs YouTube to Jason's point. Clicks "Set start." Plays forward ~75s. Clicks "Set end." Sidebar: "Clip: 12:43 → 13:58 (1:15)." Preview thumbnail loads.
- **VO:** "Pick where the clip starts and ends. Max 90 seconds, downscaled to 240p — keeps things fair-use friendly."
- **Spec:** Clip start/end selection, 90s max, 240p downgrade

### 0:40–1:00 — Add commentary (20s)
- **Screen:** Sidebar shows "Text" / "Audio" tabs. Click Audio. Big red record button. Click. Recording indicator pulses.
- **VO (this is the audio commentary, recorded LIVE on-screen):**
  > "Jason's right that AI collapses build time, but the bottleneck moves from coding to taste. If 50 builders can rebuild a YC startup in a weekend, the winner isn't whoever ships first — it's whoever made the best product decisions before writing a line of code. Speed without taste is just faster mediocrity."
- Stop recording. Waveform appears. Click "Publish."
- **Spec:** Audio commentary recording, text-or-audio support

### 1:00–1:15 — Landing page generates (15s)
- **Screen:** "Processing clip…" (2s). Cut to new tab at `annotated.com/a/[slug]`. Page shows: clipped 240p video player, audio commentary with waveform, your username + avatar, "Source: youtube.com/watch?v=… [TWiST episode title]" link, "File a claim" button in footer.
- **VO:** "Every annotation gets its own landing page. Always links back to the source. Always has a claim button for fair use disputes."
- **Spec:** Landing page, source link (hard requirement #3), file-a-claim button (hard requirement #2)

### 1:15–1:25 — Social feed (10s)
- **Screen:** Click "Feed" tab. Feed loads with new annotation at top + 5–6 seeded below. Scroll past one. Click follow on a "user." Click into a seeded annotation, scroll to comments, type quick reply, hit send.
- **VO:** "Public feed. Follow other annotators. Comment on theirs. The web becomes a conversation."
- **Spec:** Public social feed, follow, comment

### 1:25–1:30 — Closing card (5s)
- **Screen:** Title card, white text on dark:
  > **Annotated**
  > Built in 5 days for the $5K bounty.
  > [your URL] · [@your handle]
- **VO:** "Annotated. Built to spec. Built in 5 days."
- Hold last frame 2s.

## Spec coverage check

All 9 spec items hit:

1. ✅ Sidebar Chrome extension primary surface — 0:00–0:05
2. ✅ Source detection — 0:12–0:25
3. ✅ OAuth X/Google — 0:05–0:12
4. ✅ Clip start/end — 0:25–0:40
5. ✅ 90s max + 240p — 0:40 callout, 1:00 visual
6. ✅ Source link — 1:00–1:15
7. ✅ File a claim — 1:00–1:15
8. ✅ Text/audio commentary — 0:40–1:00
9. ✅ Public feed + follow + comment — 1:15–1:25

## Production notes

- **Record voiceover separately** from screen capture, sync in post. Cleaner audio.
- **Audio commentary at 0:40–1:00 is the exception** — record live in the screen capture so the recording feature is shown working. Layer narrator VO around it (silent during the live recording moment).
- **Cut dead time aggressively in post.** Speed up auth flows / processing states 2–4x or hard cut.
- **Burn-in captions.** Jason watches submissions on mute.
- **Upload to YouTube as unlisted.** Stable URL for submission form. Not Loom or Vimeo.

## Out of scope for the demo

Profile pages, search, notifications, mobile responsiveness on web, multi-clip threads. All v2.
