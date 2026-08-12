// Post-publish verification against Supabase: the annotation row must reach
// status 'published' with media_url pointing at a real transcoded mp4 in
// storage (the worker on another machine flips it within ~60s), and the mp4
// must actually download with a nonzero size.

import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR } from './config.js';

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

async function fetchAnnotation({ supabaseUrl, supabaseAnonKey }, slug) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/annotations?slug=eq.${encodeURIComponent(slug)}` +
      '&select=id,slug,status,media_url,clip_start_seconds,clip_end_seconds,commentary_text,source_url',
    { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` } }
  );
  if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

/**
 * Poll until the worker publishes the transcoded clip. Resolves with the row;
 * throws if it never flips or the media_url is the embed fallback rather than
 * a storage mp4.
 */
export async function waitForPublished(env, slug) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastStatus = null;
  for (;;) {
    const row = await fetchAnnotation(env, slug);
    if (!row) throw new Error(`No annotation row found for slug ${slug}`);
    if (row.status !== lastStatus) {
      console.log(`[e2e]   ${slug}: status=${row.status}`);
      lastStatus = row.status;
    }
    if (row.status === 'published') {
      const mediaUrl = row.media_url || '';
      if (!(mediaUrl.includes('/storage/') && mediaUrl.endsWith('.mp4'))) {
        throw new Error(
          `Annotation ${slug} published but media_url is not a transcoded storage mp4: ${mediaUrl}`
        );
      }
      return row;
    }
    if (row.status === 'failed') throw new Error(`Worker marked annotation ${slug} as failed`);
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${slug} to publish (last status: ${row.status})`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/** Download the published mp4 and confirm it is a real, nonzero media file. */
export async function verifyMedia(row) {
  const res = await fetch(row.media_url);
  if (!res.ok) throw new Error(`Downloading ${row.media_url} failed: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 10 * 1024) {
    throw new Error(`Published mp4 for ${row.slug} is suspiciously small (${bytes.length} bytes)`);
  }
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const file = path.join(ARTIFACTS_DIR, `${row.slug}.mp4`);
  fs.writeFileSync(file, bytes);
  return { file, sizeBytes: bytes.length };
}
