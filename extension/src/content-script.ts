// Content script — runs in the context of every page
// Reports selection, video time, audio elements to the sidebar via messages

interface PageContext {
  url: string;
  title: string;
  sourceType: 'youtube' | 'article' | 'podcast' | 'unknown';
  metadata: {
    description?: string;
    author?: string;
    publishedDate?: string;
    image?: string;
  };
  videoCurrentTime?: number;
  audioCurrentTime?: number;
  audioSrc?: string;
}

function detectSourceType(): PageContext['sourceType'] {
  const url = window.location.href;
  if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) return 'youtube';
  if (document.querySelector('audio')) return 'podcast';
  if (
    document.querySelector('article') ||
    document.querySelector('meta[property="og:type"][content="article"]')
  ) {
    return 'article';
  }
  return 'unknown';
}

function getMetadata(): PageContext['metadata'] {
  const get = (selector: string) =>
    document.querySelector(selector)?.getAttribute('content') ?? undefined;
  return {
    description: get('meta[property="og:description"]') ?? get('meta[name="description"]'),
    author: get('meta[name="author"]') ?? get('meta[property="article:author"]'),
    publishedDate: get('meta[property="article:published_time"]'),
    image: get('meta[property="og:image"]'),
  };
}

function getPageContext(): PageContext {
  const sourceType = detectSourceType();
  const ctx: PageContext = {
    url: window.location.href,
    title: document.title,
    sourceType,
    metadata: getMetadata(),
  };

  if (sourceType === 'youtube') {
    const video = document.querySelector('video');
    if (video) ctx.videoCurrentTime = video.currentTime;
  }

  if (sourceType === 'podcast') {
    const audio = document.querySelector('audio');
    if (audio) {
      ctx.audioCurrentTime = audio.currentTime;
      ctx.audioSrc = audio.src;
    }
  }

  return ctx;
}

// Handle messages from sidebar
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_CONTEXT') {
    sendResponse(getPageContext());
    return false;
  }

  if (message.type === 'GET_SELECTION') {
    const selection = window.getSelection()?.toString().trim() ?? '';
    sendResponse({ selection });
    return false;
  }

  if (message.type === 'GET_VIDEO_TIME') {
    const video = document.querySelector('video');
    sendResponse({ time: video?.currentTime ?? null });
    return false;
  }

  if (message.type === 'SEEK_VIDEO') {
    const video = document.querySelector('video');
    if (video && typeof message.time === 'number') {
      video.currentTime = message.time;
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'GET_AUDIO_TIME') {
    const audio = document.querySelector('audio');
    sendResponse({ time: audio?.currentTime ?? null, src: audio?.src ?? null });
    return false;
  }

  if (message.type === 'SEEK_AUDIO') {
    const audio = document.querySelector('audio');
    if (audio && typeof message.time === 'number') {
      audio.currentTime = message.time;
    }
    sendResponse({ ok: true });
    return false;
  }
});

console.log('[annotated] content script loaded on', window.location.href);

export {};
