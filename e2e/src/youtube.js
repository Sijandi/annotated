// YouTube page control: open a watch page, get past consent/ad interruptions,
// and drive the underlying <video> element into a known state so the
// extension's clipper reads the timestamps we want.

/** Extract the 11-char video ID from any YouTube watch/short URL form. */
export function videoIdFromUrl(url) {
  const m = url.match(/[?&]v=([\w-]{11})/) || url.match(/youtu\.be\/([\w-]{11})/);
  if (!m) throw new Error(`Could not parse YouTube video ID from ${url}`);
  return m[1];
}

async function dismissConsentAndDialogs(page) {
  // EU consent wall (rare on US IPs) and assorted YouTube modals — all
  // best-effort; absence is the normal case.
  const candidates = [
    'button[aria-label*="Accept all"]',
    'button[aria-label*="Accept the use of cookies"]',
    'tp-yt-paper-dialog #dismiss-button button',
    'ytd-popup-container #dismiss-button button',
  ];
  for (const selector of candidates) {
    const el = page.locator(selector).first();
    if (await el.isVisible().catch(() => false)) {
      await el.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

/** Wait until the player is out of ad playback (skipping ads when allowed). */
async function waitForNoAds(page, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const adShowing = await page
      .evaluate(() => {
        const player = document.querySelector('.html5-video-player');
        return player ? player.classList.contains('ad-showing') : false;
      })
      .catch(() => false);
    if (!adShowing) return;
    if (Date.now() > deadline) throw new Error('Ad playback did not finish in time');
    // Skip button appears a few seconds into skippable ads.
    await page
      .locator('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern')
      .first()
      .click({ timeout: 1000 })
      .catch(() => {});
    await page.waitForTimeout(2000);
  }
}

/**
 * Open a YouTube watch page and return once its video element is playable
 * (metadata loaded, no ad running, content video buffered at the clip start).
 */
export async function openVideo(context, url, startSeconds) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismissConsentAndDialogs(page);

  await page.waitForFunction(
    () => {
      const v = document.querySelector('video');
      return v && Number.isFinite(v.duration) && v.duration > 0;
    },
    { timeout: 60000 }
  );

  // Kick playback so any pre-roll ad starts (and can finish) now rather than
  // during capture.
  await page.evaluate(() => document.querySelector('video')?.play()?.catch(() => {}));
  await waitForNoAds(page);
  await dismissConsentAndDialogs(page);

  const duration = await page.evaluate(() => document.querySelector('video').duration);
  if (startSeconds >= duration) {
    throw new Error(`Clip start ${startSeconds}s is beyond video duration ${Math.floor(duration)}s`);
  }

  await seekTo(page, startSeconds);
  return page;
}

/** Pause and seek the content video to `seconds`, waiting for the seek to land. */
export async function seekTo(page, seconds) {
  await page.evaluate(async (t) => {
    const v = document.querySelector('video');
    v.pause();
    if (Math.abs(v.currentTime - t) < 0.05) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      v.addEventListener(
        'seeked',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      v.currentTime = t;
    });
  }, seconds);
  const landed = await page.evaluate(() => document.querySelector('video').currentTime);
  if (Math.abs(landed - seconds) > 1.5) {
    throw new Error(`Seek to ${seconds}s landed at ${landed.toFixed(1)}s`);
  }
}

/** Read the page <title> cleaned the same way the content script does. */
export async function videoTitle(page) {
  return page.evaluate(() =>
    document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*[-|]\s*YouTube$/, '')
  );
}
