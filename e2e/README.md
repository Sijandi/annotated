# Annotated E2E Clip Harness

Drives the real Annotated Chrome extension end-to-end with Playwright and
publishes **real clips**: it loads the unpacked extension into Chromium, opens a
YouTube video, sets the clip range in the actual side-panel UI, records through
the extension's capture pipeline (`chrome.tabCapture` → offscreen recorder),
publishes with commentary, and then verifies the worker transcoded the upload
into a served mp4 in Supabase storage.

Nothing is mocked — every clip produced by this harness is a production
annotation at `https://annotated-app.vercel.app/a/<slug>`.

## Prerequisites

1. **Extension build** — `extension/dist` must exist:
   ```sh
   cd extension && npm install && npm run build
   ```
2. **A logged-in session** — sign in to the Annotated extension once in regular
   Chrome (default profile). The harness copies the extension's
   `chrome.storage.local` LevelDB (which holds the Supabase session) from
   `~/Library/Application Support/Google/Chrome/Default/Local Extension Settings/`
   into its own persistent profile on first run; supabase-js refreshes the
   token from there.
3. **Harness deps**:
   ```sh
   cd e2e && npm install && npx playwright install chromium
   ```

The run is **headful by design** — a Chromium window appears and plays the
video while the extension records the tab. Don't minimize it mid-run.

## Usage

Single clip (times are seconds or `mm:ss` / `h:mm:ss`):

```sh
node e2e/generate-clips.js "https://www.youtube.com/watch?v=5S5TorQ49Tg" 27:00 27:30 --comment "Your take on the moment"
```

Batch mode (reads `e2e/clips.json` by default, or pass a path):

```sh
node e2e/generate-clips.js --batch
node e2e/generate-clips.js --batch my-clips.json
```

Each batch entry: `{ "url", "start", "end", "commentary" }`.

Flags:

- `--fresh-profile` — wipe `e2e/.profile` and re-transplant the Chrome session
  (use when the panel reports a login screen).
- `--no-verify` — skip waiting for the transcoder + mp4 download check.

## What a run does

1. Launches persistent Chromium from `e2e/.profile` with
   `--load-extension=extension/dist`. The unpacked-extension ID
   (`jnocnjmabcleljofoefidfnndccmgief`) is derived from the dist path, so the
   transplanted session and `--allowlisted-extension-id` line up.
2. Opens the YouTube watch page, dismisses consent/dialogs, lets any pre-roll
   ad finish, and seeks the player to the clip start.
3. Opens the side panel page as a tab with `?e2eTabId=<youtube tab id>`
   (see hook note below) and confirms it shows the logged-in clipper UI.
4. Clicks **Set start** / **Set end** (seeking the video between clicks), then
   **Record clip**. The extension records via tabCapture (video + tab audio);
   if Chrome denies tabCapture the extension's own silent canvas fallback
   engages — the harness reports which path ran.
5. Fills the commentary textarea, clicks **Publish** → **Confirm**, and reads
   the published slug from the landing-page tab the extension opens.
6. Polls Supabase REST until the worker flips the row to `published` with a
   `.../storage/.../clips/<id>.mp4` media URL, downloads the mp4 to
   `e2e/.artifacts/<slug>.mp4`, and asserts it's a real nonzero file.

## The one extension hook

Chrome's side-panel UI can't be scripted, so the panel page is opened as a
normal tab. Opened that way, "the active tab" would be the panel itself. The
sidepanel source therefore supports an explicit, guarded override:
`?e2eTabId=<tabId>` (implemented in `extension/src/lib/targetTab.ts`, used by
`Capture.tsx` and `YouTubeClipper.tsx`). Without the param — every real user
session — target-tab resolution is the same active-tab query as before.

## tabCapture in automation

Two automation-only obstacles stand between Playwright and the extension's
preferred capture path, and the harness clears both:

1. **Invocation requirement** — `chrome.tabCapture.getMediaStreamId` normally
   requires the extension to have been *invoked* on the tab (toolbar-icon
   click), which automation can't do. The launch args include the Chromium
   test switch `--allowlisted-extension-id=<extension id>`, which grants
   capture access without invocation.
2. **Offscreen storage bus** (`src/captureBridge.js`) — the extension's side
   panel and offscreen recorder talk over `chrome.storage.local`
   (`captureCmd` / `captureStatus` / `captureResult`). Playwright's Chromium
   build brings up offscreen documents *without* `chrome.storage` bindings
   (real Chrome provides them), so the recorder would never see the start
   command. The bridge pre-creates the offscreen document, injects a small
   `chrome.storage.local` polyfill that queues writes in-page, relays those
   writes into real storage via the service worker (where change events reach
   the panel normally), and invokes the extension's own `startTabCapture` /
   `stopTabCapture` when the panel issues a command. All recorder logic that
   runs is the extension's own `offscreen.js`; only the broken transport is
   bridged. Media capture itself (streamId consumption, MediaRecorder) works
   natively in that build — verified by probing.

If the bridge or the switch ever regress, the extension's canvas fallback
still produces (silent) clips and the harness labels them `canvas-fallback`
and prints the extension's own console diagnostics explaining why.

The bridge also retries a capture command once after reattaching when the
offscreen document was reaped and recreated mid-run — a lost `start` there was
what used to intermittently degrade runs to silent canvas clips. Full strategy
log and probe evidence: `CAPTURE-NOTES.md` (probes: `probe-capture.js`,
`probe-offscreen.js`).

## Troubleshooting

- **"Opening in existing browser session" at launch** — a previous run's
  Chrome for Testing still holds `e2e/.profile`. Kill it and re-run:
  ```sh
  pkill -9 -f "user-data-dir=.*/e2e/.profile"
  ```
- **Login screen in the panel** — session transplant failed or is stale. Sign
  in via regular Chrome, quit Chrome (releases the LevelDB lock), then re-run
  with `--fresh-profile`.
- **"Panel never detected the YouTube page"** — the content script wasn't
  ready; the harness reloads the panel twice before giving up. Usually a slow
  YouTube load; just re-run.
- **Stuck at `status=processing`** — the transcoding worker (separate machine)
  isn't running; the raw webm upload and annotation row are still real, and the
  row flips to `published` whenever the worker catches up.
