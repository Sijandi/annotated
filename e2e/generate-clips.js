#!/usr/bin/env node
// End-to-end clip generation through the real Annotated extension UI.
//
// Drives Playwright Chromium with the unpacked extension loaded, opens a
// YouTube video, sets a clip range in the actual side-panel UI, records via
// the extension's capture pipeline (tabCapture → offscreen recorder, with the
// extension's own canvas fallback), publishes with commentary, then verifies
// the worker transcoded the clip to a real mp4 in Supabase storage.
//
// Usage:
//   node e2e/generate-clips.js "https://www.youtube.com/watch?v=..." <start> <end> [--comment "..."]
//   node e2e/generate-clips.js --batch [clips.json]
//
// Times accept seconds (330) or mm:ss / h:mm:ss (5:30, 1:02:15).
// Flags: --fresh-profile  wipe e2e/.profile and re-transplant the session
//        --no-verify      skip the Supabase publish/media verification

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './src/config.js';
import { launchBrowser, chromeTabId, resetProfile } from './src/browser.js';
import { openVideo, seekTo, videoIdFromUrl, videoTitle } from './src/youtube.js';
import { openPanel, setClipRange, recordAndPublish } from './src/panel.js';
import { CaptureBridge } from './src/captureBridge.js';
import { waitForPublished, verifyMedia } from './src/verify.js';

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseTime(value) {
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN) || parts.length > 3) {
    throw new Error(`Cannot parse time "${value}" (use seconds or mm:ss)`);
  }
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function parseArgs(argv) {
  const flags = { freshProfile: false, verify: true, batch: false, comment: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fresh-profile') flags.freshProfile = true;
    else if (arg === '--no-verify') flags.verify = false;
    else if (arg === '--batch') flags.batch = true;
    else if (arg === '--comment') flags.comment = argv[++i];
    else positional.push(arg);
  }
  return { flags, positional };
}

function loadClipSpecs({ flags, positional }) {
  if (flags.batch) {
    const file = positional[0] || path.join(E2E_DIR, 'clips.json');
    const specs = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(specs) || specs.length === 0) throw new Error(`${file} must be a non-empty array`);
    return specs.map((s, i) => {
      for (const key of ['url', 'start', 'end', 'commentary']) {
        if (s[key] === undefined) throw new Error(`clips[${i}] is missing "${key}"`);
      }
      return { url: s.url, start: parseTime(String(s.start)), end: parseTime(String(s.end)), commentary: s.commentary };
    });
  }
  if (positional.length < 3) {
    console.error(
      'Usage: node e2e/generate-clips.js <youtube-url> <start> <end> [--comment "..."]\n' +
        '       node e2e/generate-clips.js --batch [clips.json]'
    );
    process.exit(1);
  }
  return [
    {
      url: positional[0],
      start: parseTime(positional[1]),
      end: parseTime(positional[2]),
      commentary: flags.comment || 'Clipped with Annotated.',
    },
  ];
}

async function generateClip(context, serviceWorker, env, spec) {
  const { url, start, end, commentary } = spec;
  const duration = end - start;
  if (duration <= 0 || duration > 90) throw new Error(`Clip duration must be 1-90s, got ${duration}s`);

  const videoId = videoIdFromUrl(url);
  console.log(`[e2e] opening ${url} (clip ${start}s → ${end}s)`);
  const ytPage = await openVideo(context, url, start);
  console.log(`[e2e]   video: ${await videoTitle(ytPage)}`);

  const tabId = await chromeTabId(serviceWorker, videoId);
  const { page: panelPage, consoleLog } = await openPanel(context, tabId);
  console.log('[e2e]   panel attached, session OK');

  await setClipRange(panelPage, { seekTo: (t) => seekTo(ytPage, t) }, start, end);

  // tabCapture targets the tab, but keep it front-most and visible while
  // recording — matches real usage and keeps the compositor rendering it.
  await ytPage.bringToFront();

  console.log(`[e2e]   recording ${duration}s through the extension...`);
  const result = await recordAndPublish(context, panelPage, consoleLog, {
    durationSeconds: duration,
    commentary,
    webAppUrl: env.webAppUrl,
  });
  console.log(`[e2e]   published slug=${result.slug} via ${result.capturePath}`);
  for (const line of result.diagnostics ?? []) console.log(`[e2e]   capture diag: ${line}`);

  await panelPage.close().catch(() => {});
  await ytPage.close().catch(() => {});
  return result;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const specs = loadClipSpecs(parsed);
  const env = loadEnv();

  if (parsed.flags.freshProfile) resetProfile();

  const { context, serviceWorker } = await launchBrowser();
  const results = [];
  const failures = [];
  let bridge = null;

  try {
    // Playwright's Chromium ships offscreen documents without chrome.storage
    // bindings; the bridge restores the panel↔offscreen capture transport so
    // the extension's real tabCapture recorder runs (see captureBridge.js).
    bridge = await CaptureBridge.install(serviceWorker);
    console.log('[e2e] offscreen capture bridge installed');

    for (const spec of specs) {
      try {
        const result = await generateClip(context, serviceWorker, env, spec);

        if (parsed.flags.verify) {
          console.log('[e2e]   waiting for worker transcode...');
          const row = await waitForPublished(env, result.slug);
          const media = await verifyMedia(row);
          result.mediaUrl = row.media_url;
          result.mediaSizeBytes = media.sizeBytes;
          console.log(
            `[e2e]   verified: ${row.media_url} (${(media.sizeBytes / 1024).toFixed(0)} KB, saved to ${media.file})`
          );
        }
        results.push(result);
      } catch (err) {
        console.error(`[e2e] FAILED for ${spec.url}: ${err.message}`);
        failures.push({ url: spec.url, error: err.message });
      }
    }
  } finally {
    if (bridge) await bridge.close().catch(() => {});
    await context.close().catch(() => {});
  }

  console.log('\n=== Results ===');
  for (const r of results) {
    console.log(`${r.url}  [${r.capturePath}]${r.mediaUrl ? `\n  media: ${r.mediaUrl}` : ''}`);
  }
  if (failures.length) {
    console.log('\n=== Failures ===');
    for (const f of failures) console.log(`${f.url}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[e2e] fatal:', err);
  process.exit(1);
});
