// Background service worker for Annotated extension
// MV3 service workers are ephemeral — persist state to chrome.storage.local

// Open side panel when user clicks the action icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[annotated] sidePanel setup failed:', error));

// Offscreen document management
let offscreenReady = false;

async function ensureOffscreen() {
  if (offscreenReady) return;
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
    offscreenReady = true;
  } catch (e) {
    console.error('[annotated] offscreen setup error:', e);
  }
}

// Store for pending offscreen callbacks
let pendingCallback: ((response: any) => void) | null = null;

// Listen for messages from sidebar and offscreen
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

  // Sidebar requests to start/stop recording
  if (message.type === 'START_RECORDING') {
    ensureOffscreen().then(() => {
      // Forward to offscreen via storage-based message passing
      chrome.storage.local.set({ audioCommand: 'start' }, () => {
        sendResponse({ ok: true });
      });
    }).catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    chrome.storage.local.set({ audioCommand: 'stop' });
    // Store callback for when offscreen responds
    pendingCallback = sendResponse;
    return true;
  }

  // Response from offscreen document
  if (message.type === 'RECORDING_RESULT') {
    if (pendingCallback) {
      pendingCallback(message);
      pendingCallback = null;
    }
    return false;
  }
});

// On install, log status
chrome.runtime.onInstalled.addListener(() => {
  console.log('[annotated] installed');
});

export {};
