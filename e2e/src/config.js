// Central configuration for the e2e clip-generation harness.
// Everything is derived from the repo layout and extension/.env — no secrets
// are duplicated here.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.dirname(E2E_DIR);

// Loading an unpacked extension derives its ID from the absolute dist path,
// so this ID is stable for this checkout (same path Phil loaded manually).
export const EXTENSION_ID = 'mjcafpknomkgfmipbpogkgicbepalddh';

export const EXTENSION_DIST = path.join(REPO_ROOT, 'extension', 'dist');
export const PROFILE_DIR = path.join(E2E_DIR, '.profile');
export const ARTIFACTS_DIR = path.join(E2E_DIR, '.artifacts');

// Phil's real Chrome profile holds the logged-in Supabase session for the
// extension (chrome.storage.local lives in this LevelDB directory). The
// Supabase session is not bound to the extension ID, so SESSION_SOURCE_ID lets
// a session captured under a prior ID seed a freshly-pinned build.
export const CHROME_SESSION_LEVELDB = path.join(
  os.homedir(),
  'Library/Application Support/Google/Chrome/Default/Local Extension Settings',
  process.env.SESSION_SOURCE_ID || EXTENSION_ID
);

export const SIDEPANEL_URL = `chrome-extension://${EXTENSION_ID}/src/sidepanel/index.html`;

/** Parse extension/.env for Supabase credentials + web app URL. */
export function loadEnv() {
  const envPath = path.join(REPO_ROOT, 'extension', '.env');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    if (!env[key]) throw new Error(`${key} missing from extension/.env`);
  }
  return {
    supabaseUrl: env.VITE_SUPABASE_URL,
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
    webAppUrl: env.VITE_WEB_APP_URL || 'https://annotated-app.vercel.app',
  };
}
