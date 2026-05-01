// Background service worker for Annotated extension

// Open side panel when user clicks the action icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[annotated] sidePanel setup failed:', error));

// Offscreen document management
async function ensureOffscreen() {
  try {
    const contexts = await (chrome.runtime as any).getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Recording audio commentary',
      });
    }
  } catch (e) {
    console.error('[annotated] offscreen error:', e);
    throw e;
  }
}

// Audio recording state
let audioResponseCallback: ((data: any) => void) | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      sendResponse({ tab });
    });
    return true;
  }

  if (message.type === 'GET_YOUTUBE_PLAYER_TIME') {
    if (!sender.tab?.id) {
      sendResponse({ error: 'no tab' });
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId: sender.tab.id },
        func: () => {
          const video = document.querySelector('video');
          return video ? video.currentTime : null;
        },
      },
      (results) => {
        sendResponse({ time: results?.[0]?.result ?? null });
      }
    );
    return true;
  }

  // Sidebar requests recording
  if (message.type === 'START_RECORDING') {
    ensureOffscreen()
      .then(() => chrome.storage.local.set({ audioCmd: { action: 'start', ts: Date.now() } }))
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    chrome.storage.local.set({ audioCmd: { action: 'stop', ts: Date.now() } });
    sendResponse({ ok: true });
    return false;
  }

  // Offscreen sends back recording data — store in session for sidebar to pick up
  if (message.type === 'AUDIO_RESULT') {
    chrome.storage.local.set({ audioResult: { dataUrl: message.dataUrl, error: message.error } });
    return false;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[annotated] installed');
});

export {};
