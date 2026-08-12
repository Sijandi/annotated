// Capture transport bridge for the offscreen recorder.
//
// Playwright's Chromium build has a quirk: extension offscreen documents come
// up WITHOUT chrome.storage bindings (real Chrome provides them — the
// extension's production capture transport uses chrome.storage.local as a
// message bus between side panel and offscreen recorder). Media capture
// itself (tabCapture streamId consumption, MediaRecorder) works fine there.
//
// This bridge restores the transport without touching extension code:
//   - it pre-creates the offscreen document and injects a tiny
//     chrome.storage.local polyfill that queues writes in-page,
//   - relays queued offscreen writes (captureStatus / captureResult) into
//     real chrome.storage.local via the service worker, where change events
//     reach the side panel normally,
//   - watches real storage for captureCmd and invokes the extension's own
//     startTabCapture / stopTabCapture in the offscreen document.
//
// Every byte of recorder logic that runs is the extension's own offscreen.js.

import fs from 'node:fs';
import path from 'node:path';
import { PROFILE_DIR } from './config.js';

const POLL_MS = 150;

/** Minimal raw CDP client (Playwright's CDPSession cannot address the
 * offscreen target, which reports as a background_page). */
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

  static async connect(profileDir = PROFILE_DIR) {
    // Written by Chromium on startup when --remote-debugging-port is used.
    const portFile = fs.readFileSync(path.join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n');
    const ws = new WebSocket(`ws://127.0.0.1:${portFile[0].trim()}${portFile[1].trim()}`);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('Could not connect to browser CDP endpoint'));
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

  close() {
    this.ws.close();
  }
}

const POLYFILL = `(() => {
  if (globalThis.__e2eStorageBridge) return 'already-installed';
  const queue = [];
  const mirror = {};
  globalThis.__e2eStorageBridge = { queue, mirror };
  const local = {
    set: (items) => { queue.push(items); Object.assign(mirror, items); return Promise.resolve(); },
    get: (keys) => {
      let result = {};
      if (keys == null) result = { ...mirror };
      else if (typeof keys === 'string') { if (keys in mirror) result[keys] = mirror[keys]; }
      else if (Array.isArray(keys)) for (const k of keys) { if (k in mirror) result[k] = mirror[k]; }
      else { for (const k of Object.keys(keys)) result[k] = k in mirror ? mirror[k] : keys[k]; }
      return Promise.resolve(result);
    },
    remove: (keys) => { for (const k of [].concat(keys)) delete mirror[k]; return Promise.resolve(); },
    onChanged: { addListener: () => {}, removeListener: () => {} },
  };
  chrome.storage = { local, onChanged: { addListener: () => {}, removeListener: () => {} } };
  return 'installed';
})()`;

export class CaptureBridge {
  constructor(cdp, sessionId, serviceWorker) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.serviceWorker = serviceWorker;
    this.lastCmdTs = 0;
    this.stopped = false;
  }

  /**
   * Pre-create the offscreen document (the extension's ensureOffscreen will
   * then reuse it), inject the storage polyfill, and start the relay loop.
   */
  static async install(serviceWorker) {
    await serviceWorker.evaluate(async () => {
      const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (ctxs.length === 0) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['USER_MEDIA'],
          justification: 'Media processing',
        });
      }
    });

    const cdp = await Cdp.connect();
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find((t) => t.url.endsWith('/offscreen.html'));
    if (!target) throw new Error('Offscreen document target not found via CDP');
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });

    const bridge = new CaptureBridge(cdp, sessionId, serviceWorker);
    await bridge.injectPolyfill();
    // Never re-run a command that predates the bridge.
    bridge.lastCmdTs = await serviceWorker.evaluate(async () => {
      const { captureCmd } = await chrome.storage.local.get('captureCmd');
      return captureCmd?.ts || 0;
    });
    bridge.loop = bridge.runLoop();
    return bridge;
  }

  async injectPolyfill() {
    const installed = await this.evalInOffscreen(POLYFILL);
    if (installed !== 'installed' && installed !== 'already-installed') {
      throw new Error(`Offscreen polyfill injection failed: ${JSON.stringify(installed)}`);
    }
  }

  /**
   * Chrome reaps idle offscreen documents; if ours went away (dead CDP
   * session), recreate it and re-inject the polyfill.
   */
  async reattach() {
    await this.serviceWorker.evaluate(async () => {
      const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (ctxs.length === 0) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['USER_MEDIA'],
          justification: 'Media processing',
        });
      }
    });
    const { targetInfos } = await this.cdp.send('Target.getTargets');
    const target = targetInfos.find((t) => t.url.endsWith('/offscreen.html'));
    if (!target) throw new Error('Offscreen document target not found via CDP');
    const { sessionId } = await this.cdp.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    this.sessionId = sessionId;
    await this.injectPolyfill();
  }

  async evalInOffscreen(expression) {
    const res = await this.cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      this.sessionId
    );
    if (res.exceptionDetails) {
      throw new Error(`Offscreen eval failed: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  /** Relay loop: commands in (storage → offscreen), writes out (offscreen → storage). */
  async runLoop() {
    while (!this.stopped) {
      try {
        // 1) New capture command? Invoke the extension's real handler.
        const cmd = await this.serviceWorker.evaluate(async () => {
          const { captureCmd } = await chrome.storage.local.get('captureCmd');
          return captureCmd || null;
        });
        if (cmd?.ts && cmd.ts !== this.lastCmdTs) {
          this.lastCmdTs = cmd.ts;
          if (cmd.action === 'start') {
            await this.evalInOffscreen(
              `startTabCapture(${JSON.stringify(cmd.streamId)}, ${JSON.stringify(cmd.duration)}); 'started'`
            );
          } else if (cmd.action === 'stop') {
            await this.evalInOffscreen(`stopTabCapture(); 'stopped'`);
          }
        }

        // 2) Drain queued offscreen writes into real storage (events from
        // these writes reach the side panel like production).
        const writes = await this.evalInOffscreen(
          `JSON.stringify(globalThis.__e2eStorageBridge ? globalThis.__e2eStorageBridge.queue.splice(0) : [])`
        );
        for (const items of JSON.parse(writes)) {
          await this.serviceWorker.evaluate((obj) => chrome.storage.local.set(obj), items);
        }
      } catch (err) {
        if (!this.stopped) {
          console.warn('[e2e] capture bridge:', err.message);
          await this.reattach().catch((e) => console.warn('[e2e] bridge reattach failed:', e.message));
        }
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  async close() {
    this.stopped = true;
    await this.loop.catch(() => {});
    this.cdp.close();
  }
}
