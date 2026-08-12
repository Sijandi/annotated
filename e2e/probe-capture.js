#!/usr/bin/env node
// Diagnostic probe: which route (if any) lets chrome.tabCapture.getMediaStreamId
// succeed under Playwright automation? Findings land in CAPTURE-NOTES.md.
//
// Usage: node e2e/probe-capture.js

import fs from 'node:fs';
import path from 'node:path';
import { PROFILE_DIR, EXTENSION_ID } from './src/config.js';
import { launchBrowser, chromeTabId } from './src/browser.js';

// --- minimal raw CDP client over the browser endpoint (same trick as captureBridge) ---
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

const GET_STREAM_ID = (tabIdExpr, extra = '') => `
  new Promise((resolve) => {
    try {
      chrome.tabCapture.getMediaStreamId({ targetTabId: ${tabIdExpr}${extra} }, (id) => {
        resolve(JSON.stringify({ id: id || null, err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null }));
      });
    } catch (e) { resolve(JSON.stringify({ id: null, err: 'threw: ' + e.message })); }
  })
`;

async function main() {
  const results = [];
  const record = (name, outcome) => {
    console.log(`\n=== ${name} ===\n${outcome}`);
    results.push({ name, outcome });
  };

  const { context, serviceWorker } = await launchBrowser();
  try {
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/watch?v=5S5TorQ49Tg', { waitUntil: 'domcontentloaded' });
    const tabId = await chromeTabId(serviceWorker, '5S5TorQ49Tg');
    console.log(`[probe] target tabId = ${tabId}`);

    // --- Probe A: plain SW call via Playwright evaluate (baseline) ---
    try {
      const res = await serviceWorker.evaluate(
        (expr) => eval(expr),
        GET_STREAM_ID('__TABID__').replace('__TABID__', String(tabId))
      );
      record('A: SW getMediaStreamId (Playwright evaluate, no gesture)', res);
    } catch (e) {
      record('A: SW getMediaStreamId (Playwright evaluate, no gesture)', `EXCEPTION: ${e.message}`);
    }

    // --- CDP attach to the extension service worker target ---
    const cdp = await Cdp.connect();
    const { targetInfos } = await cdp.send('Target.getTargets');
    console.log('[probe] targets:', targetInfos.map((t) => `${t.type} ${t.url}`).join('\n  '));
    const swTarget = targetInfos.find(
      (t) => t.url.startsWith(`chrome-extension://${EXTENSION_ID}`) && (t.type === 'service_worker' || t.type === 'worker')
    );
    let swSession = null;
    if (!swTarget) {
      record('B: CDP attach to SW', 'FAILED: no service_worker target found for extension');
    } else {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: swTarget.targetId, flatten: true });
      swSession = sessionId;

      // --- Probe B: CDP Runtime.evaluate userGesture:true in SW ---
      try {
        const res = await cdp.send(
          'Runtime.evaluate',
          { expression: GET_STREAM_ID(String(tabId)), awaitPromise: true, returnByValue: true, userGesture: true },
          swSession
        );
        record('B: SW getMediaStreamId via CDP userGesture:true', JSON.stringify(res.result?.value ?? res));
      } catch (e) {
        record('B: SW getMediaStreamId via CDP userGesture:true', `EXCEPTION: ${e.message}`);
      }

      // --- Probe C: mark "invoked" first — action.openPopup / sidePanel.open with gesture, then retry ---
      try {
        const inv = await cdp.send(
          'Runtime.evaluate',
          {
            expression: `
              (async () => {
                const out = {};
                try { await chrome.sidePanel.open({ tabId: ${tabId} }); out.sidePanelOpen = 'ok'; }
                catch (e) { out.sidePanelOpen = 'err: ' + e.message; }
                try { await chrome.action.openPopup(); out.openPopup = 'ok'; }
                catch (e) { out.openPopup = 'err: ' + e.message; }
                return JSON.stringify(out);
              })()
            `,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
          },
          swSession
        );
        const retry = await cdp.send(
          'Runtime.evaluate',
          { expression: GET_STREAM_ID(String(tabId)), awaitPromise: true, returnByValue: true, userGesture: true },
          swSession
        );
        record(
          'C: sidePanel.open/action.openPopup w/ gesture, then getMediaStreamId',
          `invocation: ${JSON.stringify(inv.result?.value)}\nretry: ${JSON.stringify(retry.result?.value)}`
        );
      } catch (e) {
        record('C: sidePanel.open/action.openPopup route', `EXCEPTION: ${e.message}`);
      }
    }

    // --- Probe D: extension page (panel-as-tab) + REAL trusted click gesture ---
    try {
      const extPage = await context.newPage();
      await extPage.goto(`chrome-extension://${EXTENSION_ID}/src/sidepanel/index.html?e2eTabId=${tabId}`, {
        waitUntil: 'domcontentloaded',
      });
      await extPage.evaluate((targetTabId) => {
        const btn = document.createElement('button');
        btn.id = '__probe_btn';
        btn.textContent = 'probe';
        btn.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;width:200px;height:60px;';
        btn.addEventListener('click', () => {
          window.__probeResult = new Promise((resolve) => {
            try {
              chrome.tabCapture.getMediaStreamId({ targetTabId }, (id) => {
                resolve(JSON.stringify({ id: id || null, err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null }));
              });
            } catch (e) { resolve(JSON.stringify({ id: null, err: 'threw: ' + e.message })); }
          });
        });
        document.body.appendChild(btn);
      }, tabId);
      await extPage.click('#__probe_btn');
      const res = await extPage.evaluate(() => window.__probeResult);
      record('D: extension page + trusted Playwright click', res);

      // --- Probe E: same trusted-click page, but ALSO pass consumerTabId (self) ---
      const selfTabId = await serviceWorker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        const t = tabs.find((x) => (x.url || '').includes('sidepanel/index.html'));
        return t ? t.id : null;
      });
      await extPage.evaluate(({ targetTabId, consumerTabId }) => {
        const btn = document.getElementById('__probe_btn');
        btn.replaceWith(btn.cloneNode(true));
        const b2 = document.getElementById('__probe_btn');
        b2.addEventListener('click', () => {
          window.__probeResult2 = new Promise((resolve) => {
            try {
              chrome.tabCapture.getMediaStreamId({ targetTabId, consumerTabId }, (id) => {
                resolve(JSON.stringify({ id: id || null, err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null }));
              });
            } catch (e) { resolve(JSON.stringify({ id: null, err: 'threw: ' + e.message })); }
          });
        });
      }, { targetTabId: tabId, consumerTabId: selfTabId });
      await extPage.click('#__probe_btn');
      const res2 = await extPage.evaluate(() => window.__probeResult2);
      record(`E: trusted click + consumerTabId=${selfTabId} (panel tab)`, res2);
      await extPage.close();
    } catch (e) {
      record('D/E: extension page trusted click', `EXCEPTION: ${e.message}`);
    }

    console.log('\n\n=== SUMMARY ===');
    for (const r of results) console.log(`${r.name}\n  -> ${r.outcome.replace(/\n/g, '\n     ')}`);
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[probe] fatal:', err);
  process.exit(1);
});
