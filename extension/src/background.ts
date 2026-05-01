// Background service worker for Annotated extension
// MV3 service workers are ephemeral — persist state to chrome.storage.local

// Open side panel when user clicks the action icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[annotated] sidePanel setup failed:', error));

// Listen for messages from content scripts and sidebar
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Offscreen messages — handled by offscreen.ts
  if (message.type?.startsWith('OFFSCREEN_')) return false;
  if (message.type === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      sendResponse({ tab });
    });
    return true; // async response
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
});

// On install, log status
chrome.runtime.onInstalled.addListener(() => {
  console.log('[annotated] installed');
});

export {};
