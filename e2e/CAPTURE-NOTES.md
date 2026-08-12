# tabCapture in automation — strategy log

Goal: make the e2e rig record clips through the extension's REAL
`chrome.tabCapture` path (video + tab audio) under Playwright, instead of the
silent canvas fallback. Success = published mp4 with an AAC audio stream.

**Status: SOLVED.** Winner = launch-flag route (strategy 3,
`--allowlisted-extension-id`) + the offscreen storage bridge, **plus a bridge
reliability fix** (reattach-and-retry of lost capture commands) that was the
actual cause of the remaining silent-canvas runs. Verified end-to-end
2026-08-11: slug `how-ai-splits-startups-into-winners-and--kct2`, published mp4
probes `aac,audio` with mean volume −18.8 dB (real program audio, not silence).

Environment: Playwright 1.62 / Google Chrome for Testing **151.0.7922.34**
(`chromium-1234`), extension id `mjcafpknomkgfmipbpogkgicbepalddh`, macOS arm64.

## Strategies attempted (probe scripts: `probe-capture.js`, `probe-offscreen.js`)

Each probe calls `chrome.tabCapture.getMediaStreamId({ targetTabId })` against a
live YouTube tab and reports `streamId` / `chrome.runtime.lastError`.

| # | Strategy | Result |
|---|----------|--------|
| A | Plain `serviceWorker.evaluate` (Playwright, **no gesture, no invocation**) | **SUCCESS** — `{"id":"gINH2n3g0f2…","err":null}`. Proves `--allowlisted-extension-id` (already in `src/browser.js` launch args) fully lifts the invocation gate in CfT 151. |
| B | Browser-level CDP → attach to the extension SW target (`type: service_worker`) → `Runtime.evaluate` with `userGesture: true` | **SUCCESS** — `{"id":"lsemndlmvt1…","err":null}`. Works, but redundant given A. |
| C | Mark the extension "invoked" first: `chrome.sidePanel.open({tabId})` and `chrome.action.openPopup()` from the SW with CDP `userGesture: true` | **Invocation calls FAIL**: `sidePanel.open` → `` `sidePanel.open()` may only be called in response to a user gesture `` (CDP `userGesture` does **not** propagate to the extension-API gesture check in SW contexts); `action.openPopup` → `Extension does not have a popup on the active tab`. The getMediaStreamId retry afterwards still succeeded — but only because of the allowlist flag, not invocation. |
| D | Extension page opened as a tab + **real trusted Playwright click** on an injected button that calls `getMediaStreamId` in the click handler | **SUCCESS** — trusted-gesture route works too. |
| E | Same as D but with `consumerTabId` set (panel tab) | **SUCCESS**. |
| — | `probe-offscreen.js`: mint streamId in SW, consume it in the offscreen document via `getUserMedia({audio/video: {mandatory: {chromeMediaSource:'tab', chromeMediaSourceId}}})`, record 2 s with MediaRecorder | **SUCCESS** — `{"ok":true,"kinds":["audio:live","video:live"],"recordedBytes":801870}`. Media consumption is not gated at all in this build. |

Toolbar-icon clicking (real invocation) was not attempted — the browser toolbar
is not scriptable from Playwright/CDP; that's exactly what the allowlist switch
substitutes for.

## So why were runs still degrading to canvas?

The streamId mint and consumption both work, and two of the four pre-existing
`.artifacts/*.mp4` already had AAC audio — the degradation was **intermittent**,
not structural. Root cause found in `src/captureBridge.js`:

- Chrome reaps idle offscreen documents, and the extension's own
  `ENSURE_OFFSCREEN` recreates them. A recreated document has a **dead CDP
  session** and **no storage polyfill**.
- The bridge's relay loop marked a `captureCmd` as consumed (`lastCmdTs`)
  *before* evaluating `startTabCapture(...)` in the offscreen document. If the
  eval hit a dead session, the loop's catch reattached + re-polyfilled — but the
  `start` command was never re-run. The side panel's 5 s `captureStatus` wait
  timed out, `recordViaTabCapture` returned null, and the extension silently
  fell back to canvas (no audio).

**Fix (in `src/captureBridge.js`)**: on eval failure of a capture command,
reattach (recreate doc + re-inject polyfill + new CDP session) and **retry the
same command once**. Freshly minted streamIds are still valid inside this
sub-second window. A second failure falls through to the outer catch (previous
behavior), so there's no retry loop.

No changes to `generate-clips.js` were needed: tabCapture already is the
default path and canvas remains the extension's own fallback. No extension
source was modified.

## Verification (2026-08-11)

```
$ node generate-clips.js "https://www.youtube.com/watch?v=jpM6ABnwy3I" 25:30 26:00 --comment "…"
[e2e]   published slug=how-ai-splits-startups-into-winners-and--kct2 via tabCapture
[e2e]   verified: https://gmcafbvfglbdlzzabihx.supabase.co/storage/v1/object/public/clips/6216fc27-11bd-4e54-afac-38fdfbde8e5d.mp4 (531 KB)

$ ffprobe -v error -show_entries stream=codec_type,codec_name -of csv=p=0 .artifacts/how-ai-splits-startups-into-winners-and--kct2.mp4
h264,video
aac,audio

$ ffmpeg -i … -af volumedetect -f null -
mean_volume: -18.8 dB   max_volume: -0.6 dB     # real audio, not a silent track
```

## Gotchas for future runs

- **"Opening in existing browser session"** at launch means a previous run's
  Chrome for Testing is still holding `e2e/.profile` (persistent contexts can
  outlive `context.close()` when raw CDP sockets were involved). Fix:
  `pkill -9 -f "user-data-dir=.*/e2e/.profile"` and re-run.
- The allowlist switch behavior is Chromium-version-dependent. If a future
  Playwright bump breaks it, re-run `node probe-capture.js` — probes B/D/E are
  independent fallback routes (CDP `userGesture` eval in the SW, or a trusted
  click inside an extension page) that also produced valid streamIds on 151.
