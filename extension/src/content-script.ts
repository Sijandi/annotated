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

// Structured page metadata for source attribution, stored on the annotation
// row (source_metadata jsonb). All fields optional strings.
interface PageMetadata {
  title?: string;
  siteName?: string;
  author?: string;
  publishedTime?: string;
  image?: string;
  favicon?: string;
  description?: string;
}

function collectPageMetadata(): PageMetadata {
  const cap = (value: string | null | undefined, max = 300): string | undefined => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
  };

  // First non-empty content attribute among the given selectors
  const meta = (...selectors: string[]): string | undefined => {
    for (const selector of selectors) {
      const content = document.querySelector(selector)?.getAttribute('content');
      if (content?.trim()) return content;
    }
    return undefined;
  };

  // Resolve relative URLs (favicons, og:image paths) against the page.
  // Truncating a URL breaks it, so over-long URLs are dropped instead.
  const url = (href: string | null | undefined): string | undefined => {
    if (!href?.trim()) return undefined;
    try {
      const absolute = new URL(href, window.location.href).href;
      return absolute.length <= 600 ? absolute : undefined;
    } catch {
      return undefined;
    }
  };

  const faviconHref = document
    .querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
    ?.getAttribute('href');

  return {
    title: cap(meta('meta[property="og:title"]', 'meta[name="twitter:title"]') ?? document.title),
    siteName: cap(
      meta('meta[property="og:site_name"]', 'meta[name="application-name"]') ??
        window.location.hostname.replace(/^www\./, '')
    ),
    author: cap(
      meta('meta[name="author"]', 'meta[property="article:author"]', 'meta[name="twitter:creator"]')
    ),
    publishedTime: cap(
      meta('meta[property="article:published_time"]', 'meta[itemprop="datePublished"]', 'meta[name="date"]')
    ),
    image: url(meta('meta[property="og:image"]', 'meta[name="twitter:image"]')),
    favicon: url(faviconHref ?? '/favicon.ico'),
    description: cap(
      meta('meta[property="og:description"]', 'meta[name="twitter:description"]', 'meta[name="description"]'),
      500
    ),
  };
}

// Geometry of the page's video element at capture start, used by the worker
// to crop the full-tab recording down to just the player.
interface CaptureCrop {
  rect: { x: number; y: number; width: number; height: number };
  dpr: number;
  viewport: { width: number; height: number };
}

// Seek the page's video to the clip start (paused) and report its on-screen
// geometry so the tab recording can later be cropped to the player.
function prepareCapture(time: number): Promise<{ crop: CaptureCrop } | { error: string }> {
  return new Promise((resolve) => {
    const video = document.querySelector('video');
    if (!video) {
      resolve({ error: 'No video element found' });
      return;
    }

    const finish = () => {
      const rect = video.getBoundingClientRect();
      resolve({
        crop: {
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          dpr: window.devicePixelRatio,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        },
      });
    };

    video.pause();
    if (Math.abs(video.currentTime - time) < 0.05) {
      finish();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      clearTimeout(timer);
      finish();
    };
    // Safety: don't hang forever if the seek target never buffers
    const timer = setTimeout(onSeeked, 3000);
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

// Video clip capture via start/stop flow
let activeRecorder: MediaRecorder | null = null;
let activeChunks: Blob[] = [];

function startContinuousCapture(): string | null {
  try {
    const video = document.querySelector('video');
    if (!video) return 'No video element found';

    // Use canvas capture — captureStream is blocked by YouTube's SES/Lockdown
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const stream = canvas.captureStream(30);
    const ctx = canvas.getContext('2d')!;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

    activeRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 });
    activeChunks = [];
    activeRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) activeChunks.push(e.data);
    };
    activeRecorder.start(100);

    // Start draw loop AFTER recorder is active
    let recording = true;
    const draw = () => {
      if (!recording) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(draw);
    };
    draw();

    // Store cleanup ref
    activeRecorder.addEventListener('stop', () => { recording = false; });
    console.log('[annotated] canvas recording started, video size:', video.videoWidth, 'x', video.videoHeight);
  } catch (e: any) {
    console.error('[annotated] startContinuousCapture error:', e);
    return e.message || 'Failed to start capture';
  }

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

  if (message.type === 'GET_PAGE_METADATA') {
    sendResponse(collectPageMetadata());
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

  if (message.type === 'PREPARE_CAPTURE') {
    prepareCapture(message.time).then(sendResponse);
    return true;
  }

  if (message.type === 'PLAY_VIDEO') {
    const video = document.querySelector('video');
    if (!video) {
      sendResponse({ error: 'No video element found' });
      return false;
    }
    video
      .play()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message || 'Playback failed' }));
    return true;
  }

  if (message.type === 'PAUSE_VIDEO') {
    document.querySelector('video')?.pause();
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
