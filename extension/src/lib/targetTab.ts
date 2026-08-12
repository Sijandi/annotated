// Target-tab resolution for the side panel.
//
// In production the panel always acts on the active tab in the current
// window, and this module is a plain wrapper around chrome.tabs.query.
//
// E2E affordance: Chrome's side-panel chrome is not scriptable by automation,
// so the e2e harness (see e2e/) opens the panel page as a regular tab. Opened
// that way, "the active tab" would be the panel itself, so the harness passes
// ?e2eTabId=<tabId> to pin the tab being annotated. Without that query param
// (i.e. every real user session) behavior is byte-for-byte the active-tab
// lookup below.

function parseE2eTabId(): number | null {
  const raw = new URLSearchParams(window.location.search).get('e2eTabId');
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
}

const e2eTabId = parseE2eTabId();

export function getTargetTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    if (e2eTabId !== null) {
      chrome.tabs.get(e2eTabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          return reject(new Error(chrome.runtime.lastError?.message || 'e2e target tab not found'));
        }
        resolve(tab);
      });
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return reject(new Error('No active tab'));
      resolve(tab);
    });
  });
}
