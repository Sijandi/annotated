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

  let image = get('meta[property="og:image"]');

  // For YouTube, construct the actual video thumbnail URL
  const url = window.location.href;
  if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
    const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/);
    if (match) {
      image = `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }
  }

  return {
    description: get('meta[property="og:description"]') ?? get('meta[name="description"]'),
    author: get('meta[name="author"]') ?? get('meta[property="article:author"]'),
    publishedDate: get('meta[property="article:published_time"]'),
    image,
  };
}

function getPageContext(): PageContext {
  const sourceType = detectSourceType();
  // Strip tab count prefix and common site suffixes from title
  const title = document.title
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*[-|]\s*YouTube$/, '')
    .replace(/\s*\|\s*Listen Notes$/, '')
    .replace(/\s*[-|]\s*AP News$/, '')
    .replace(/\s*[-|]\s*Reuters$/, '')
    .replace(/\s*[-|]\s*Bloomberg$/, '');
  const ctx: PageContext = {
    url: window.location.href,
    title,
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

// Video clip capture via start/stop flow
let activeRecorder: MediaRecorder | null = null;
let activeChunks: Blob[] = [];

function startContinuousCapture(): string | null {
  const video = document.querySelector('video');
  if (!video) return 'No video element found';

  let stream: MediaStream;
  try {
    stream = (video as any).captureStream(30);
  } catch {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    stream = canvas.captureStream(30);
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(draw);
    };
    video.addEventListener('play', draw, { once: false });
    draw();
  }

  activeRecorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp8,opus',
    videoBitsPerSecond: 2_000_000,
  });
  activeChunks = [];
  activeRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) activeChunks.push(e.data);
  };
  activeRecorder.start(100);

  // Safety: auto-stop after 95 seconds
  setTimeout(() => {
    if (activeRecorder?.state === 'recording') activeRecorder.stop();
  }, 95_000);

  return null;
}

function stopContinuousCapture(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!activeRecorder || activeRecorder.state === 'inactive') {
      reject(new Error('No active recording'));
      return;
    }

    activeRecorder.onstop = () => {
      const blob = new Blob(activeChunks, { type: 'video/webm' });
      activeChunks = [];
      activeRecorder = null;
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    };

    activeRecorder.stop();
  });
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

  if (message.type === 'START_CAPTURE') {
    const err = startContinuousCapture();
    sendResponse(err ? { error: err } : { ok: true });
    return false;
  }

  if (message.type === 'STOP_CAPTURE') {
    stopContinuousCapture()
      .then(dataUrl => sendResponse({ dataUrl }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

console.log('[annotated] content script loaded on', window.location.href);

export {};
