// Drives the extension side panel UI. Chrome's side-panel chrome is not
// scriptable, so the panel page is opened as a regular tab with the
// ?e2eTabId=<id> affordance (see extension/src/lib/targetTab.ts) pointing it
// at the YouTube tab being clipped.

import { SIDEPANEL_URL } from './config.js';

const PUBLISH_TIMEOUT_MS = 120000;

/**
 * Open the side panel pinned to `tabId` and wait for the YouTube clipper UI.
 * Fails fast (with instructions) if the Supabase session is missing.
 * Returns { page, consoleLog } — consoleLog accumulates panel console output
 * so the capture path (tabCapture vs canvas fallback) can be reported.
 */
export async function openPanel(context, tabId) {
  const page = await context.newPage();
  const consoleLog = [];
  page.on('console', (msg) => consoleLog.push(msg.text()));

  await page.goto(`${SIDEPANEL_URL}?e2eTabId=${tabId}`, { waitUntil: 'domcontentloaded' });

  // First-run onboarding screen (once per profile).
  const onboarding = page.getByRole('button', { name: /Got it/ });
  if (await onboarding.isVisible({ timeout: 2000 }).catch(() => false)) {
    await onboarding.click();
  }

  if (await page.getByText('Continue with X').isVisible({ timeout: 2000 }).catch(() => false)) {
    throw new Error(
      'Panel is showing the login screen — the transplanted Supabase session is missing or ' +
        'expired. Sign in to the extension in regular Chrome, then re-run with --fresh-profile.'
    );
  }

  // The panel asks the target tab's content script for page context on mount
  // with no retry; if the content script wasn't ready yet, a reload retries.
  for (let attempt = 0; ; attempt++) {
    const detected = await page
      .getByText('youtube detected', { exact: false })
      .waitFor({ timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (detected) break;
    if (attempt >= 2) throw new Error('Panel never detected the YouTube page');
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  return { page, consoleLog };
}

/**
 * Set the clip range. The panel reads the video's current time when each
 * button is clicked, so the caller seeks the YouTube tab between clicks.
 */
export async function setClipRange(panelPage, { seekTo }, start, end) {
  await seekTo(start);
  await panelPage.getByRole('button', { name: 'Set start' }).click();
  await expectTime(panelPage, 'Start', start);

  await seekTo(end);
  await panelPage.getByRole('button', { name: 'Set end' }).click();
  await expectTime(panelPage, 'End', end);
}

async function expectTime(panelPage, label, seconds) {
  const formatted = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  await panelPage
    .getByText(`✓ ${formatted}`)
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => {
      throw new Error(`Panel did not confirm ${label} at ${formatted}`);
    });
}

/**
 * Run the record → commentary → publish flow. Returns the published slug and
 * which capture path was used.
 */
export async function recordAndPublish(context, panelPage, consoleLog, { durationSeconds, commentary, webAppUrl }) {
  await panelPage.getByRole('button', { name: 'Record clip' }).click();

  // Recording indicator, then the commentary step once capture completes.
  // Canvas fallback re-runs the whole recording, so allow for two passes.
  await panelPage
    .getByText('Add Commentary')
    .waitFor({ timeout: (durationSeconds + 45) * 2 * 1000 });

  const captureError = await panelPage
    .locator('.text-red-400')
    .first()
    .textContent()
    .catch(() => null);

  await panelPage.getByPlaceholder("What's your take on this?").fill(commentary);
  await panelPage.getByRole('button', { name: 'Publish', exact: true }).click();

  // Publishing opens the landing page in a new tab — that URL carries the slug.
  const landingPagePromise = context.waitForEvent('page', {
    predicate: (p) => p.url().includes('/a/'),
    timeout: PUBLISH_TIMEOUT_MS,
  });
  // If publish fails before that tab appears, this promise rejects after the
  // failure is already being handled — pre-arm a handler so the late
  // rejection can't crash the process mid-batch.
  landingPagePromise.catch(() => {});
  await panelPage.getByRole('button', { name: 'Confirm' }).click();

  await panelPage.getByText('Published!').waitFor({ timeout: PUBLISH_TIMEOUT_MS });
  const landingPage = await landingPagePromise;
  const slug = new URL(landingPage.url()).pathname.split('/a/')[1];
  await landingPage.close().catch(() => {});
  if (!slug) throw new Error(`Could not extract slug from landing page URL`);

  const usedTabCapture = consoleLog.some((line) => line.includes('captured via tabCapture'));
  const usedCanvas = consoleLog.some((line) => line.includes('canvas fallback'));
  // When tabCapture didn't run, surface the extension's own console warnings
  // explaining why (invocation/permission errors, offscreen failures, ...).
  const diagnostics = usedTabCapture
    ? []
    : consoleLog.filter((line) =>
        /tabCapture unavailable|tab capture failed|offscreen unavailable|produced no result|falling back/.test(line)
      );
  return {
    slug,
    url: `${webAppUrl}/a/${slug}`,
    capturePath: usedTabCapture ? 'tabCapture' : usedCanvas ? 'canvas-fallback' : 'unknown',
    captureError: captureError || undefined,
    diagnostics,
  };
}
