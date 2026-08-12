// Browser lifecycle: persistent Chromium context with the unpacked extension
// loaded, plus a one-time transplant of Phil's logged-in extension session
// from his real Chrome profile.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  CHROME_SESSION_LEVELDB,
  EXTENSION_DIST,
  EXTENSION_ID,
  PROFILE_DIR,
} from './config.js';

/**
 * Copy the extension's chrome.storage.local LevelDB (which contains the
 * Supabase session) from the real Chrome profile into the automation profile.
 * Must happen BEFORE the profile's first launch; skipped when the automation
 * profile already has one (it may hold a fresher, auto-refreshed token).
 */
function transplantSession() {
  const dest = path.join(PROFILE_DIR, 'Default', 'Local Extension Settings', EXTENSION_ID);
  if (fs.existsSync(dest)) return { transplanted: false, reason: 'profile already has a session' };
  if (!fs.existsSync(CHROME_SESSION_LEVELDB)) {
    throw new Error(
      `No extension session found at ${CHROME_SESSION_LEVELDB}. ` +
        'Sign in to the Annotated extension in Chrome once, then re-run.'
    );
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(CHROME_SESSION_LEVELDB, dest, { recursive: true });
  // Chrome holds a LOCK file; a copied lock is stale and harmless, but drop it
  // anyway so the fresh profile starts clean.
  const lock = path.join(dest, 'LOCK');
  if (fs.existsSync(lock)) fs.rmSync(lock);
  return { transplanted: true };
}

export function resetProfile() {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
}

/**
 * Launch a headful persistent context with the extension loaded and return
 * { context, serviceWorker }. `--allowlisted-extension-id` lets
 * chrome.tabCapture.getMediaStreamId work without a toolbar-icon invocation
 * (automation cannot click the real toolbar icon).
 */
export async function launchBrowser() {
  if (!fs.existsSync(path.join(EXTENSION_DIST, 'manifest.json'))) {
    throw new Error(`Extension dist not found at ${EXTENSION_DIST}. Run \`npm run build\` in extension/.`);
  }
  const session = transplantSession();
  if (session.transplanted) console.log('[e2e] transplanted Supabase session from Chrome profile');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: [
      `--disable-extensions-except=${EXTENSION_DIST}`,
      `--load-extension=${EXTENSION_DIST}`,
      // tabCapture without user invocation (Chromium test switch; the older
      // spelling is included for compatibility with earlier builds).
      `--allowlisted-extension-id=${EXTENSION_ID}`,
      `--whitelisted-extension-id=${EXTENSION_ID}`,
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
      // Browser-level CDP endpoint (port written to <profile>/DevToolsActivePort)
      // for the capture bridge — see captureBridge.js.
      '--remote-debugging-port=0',
    ],
  });

  // The extension's MV3 service worker may take a moment to spin up.
  let serviceWorker = context
    .serviceWorkers()
    .find((w) => w.url().startsWith(`chrome-extension://${EXTENSION_ID}`));
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', {
      predicate: (w) => w.url().startsWith(`chrome-extension://${EXTENSION_ID}`),
      timeout: 15000,
    });
  }

  return { context, serviceWorker };
}

/**
 * Resolve the Chrome tab ID whose URL contains `urlSubstring` (e.g. a YouTube
 * video ID), via the extension service worker.
 */
export async function chromeTabId(serviceWorker, urlSubstring) {
  const tabId = await serviceWorker.evaluate(async (needle) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => (t.url || t.pendingUrl || '').includes(needle));
    return tab ? tab.id : null;
  }, urlSubstring);
  if (tabId === null) throw new Error(`Could not resolve Chrome tab ID matching "${urlSubstring}"`);
  return tabId;
}
