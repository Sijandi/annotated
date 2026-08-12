#!/usr/bin/env node
// Probe stage 2: streamId minting works (see probe-capture.js) — does the
// offscreen document's getUserMedia({chromeMediaSource:'tab'}) consumption work?
//
// Usage: node e2e/probe-offscreen.js

import fs from 'node:fs';
import path from 'node:path';
import { PROFILE_DIR } from './src/config.js';
import { launchBrowser, chromeTabId } from './src/browser.js';

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message || JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  static async connect() {
    const portFile = fs.readFileSync(path.join(PROFILE_DIR, 'DevToolsActivePort'), 'utf8').split('\n');
    const ws = new WebSocket(`ws://127.0.0.1:${portFile[0].trim()}${portFile[1].trim()}`);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('CDP connect failed'));
    });
    return new Cdp(ws);
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  close() { this.ws.close(); }
}

const CONSUME = (streamId) => `
  (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: ${JSON.stringify(streamId)} } },
        video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: ${JSON.stringify(streamId)} } },
      });
      const kinds = stream.getTracks().map(t => t.kind + ':' + t.readyState);
      // record 2s to prove MediaRecorder produces bytes with audio
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise(r => rec.onstop = r);
      rec.start(100);
      await new Promise(r => setTimeout(r, 2000));
      rec.stop();
      await done;
      stream.getTracks().forEach(t => t.stop());
      const bytes = chunks.reduce((a, c) => a + c.size, 0);
      return JSON.stringify({ ok: true, kinds, recordedBytes: bytes });
    } catch (e) {
      return JSON.stringify({ ok: false, name: e.name, message: e.message, constraint: e.constraint || null });
    }
  })()
`;

async function main() {
  const { context, serviceWorker } = await launchBrowser();
  try {
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/watch?v=5S5TorQ49Tg', { waitUntil: 'domcontentloaded' });
    // start playback so there's real audio while we record
    await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = false; v.play().catch(() => {}); } });
    const tabId = await chromeTabId(serviceWorker, '5S5TorQ49Tg');

    // Ensure offscreen document exists (extension's own creation params).
    await serviceWorker.evaluate(async () => {
      const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (ctxs.length === 0) {
        await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Media processing' });
      }
    });

    const cdp = await Cdp.connect();
    const { targetInfos } = await cdp.send('Target.getTargets');
    console.log('[probe2] targets:\n  ' + targetInfos.map((t) => `${t.type} ${t.url}`).join('\n  '));
    const off = targetInfos.find((t) => t.url.endsWith('/offscreen.html'));
    if (!off) throw new Error('no offscreen target');
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: off.targetId, flatten: true });

    // Mint a fresh streamId in the SW (no consumerTabId -> extension consumes).
    const res = await serviceWorker.evaluate(
      (targetTabId) =>
        new Promise((resolve) =>
          chrome.tabCapture.getMediaStreamId({ targetTabId }, (id) =>
            resolve({ id: id || null, err: chrome.runtime.lastError?.message || null })
          )
        ),
      tabId
    );
    console.log('[probe2] minted streamId:', JSON.stringify(res));
    if (!res.id) throw new Error('mint failed');

    const out = await cdp.send(
      'Runtime.evaluate',
      { expression: CONSUME(res.id), awaitPromise: true, returnByValue: true },
      sessionId
    );
    console.log('\n=== offscreen getUserMedia consumption ===');
    console.log(out.result?.value ?? JSON.stringify(out, null, 2));
    if (out.exceptionDetails) console.log('exception:', JSON.stringify(out.exceptionDetails));

    cdp.close();
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[probe2] fatal:', err);
  process.exit(1);
});
