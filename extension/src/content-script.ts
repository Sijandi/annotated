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
  // Strip tab count prefix like "(111) " from title
  const title = document.title.replace(/^\(\d+\)\s*/, '');
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

// Capture video clip via captureStream or canvas fallback
async function captureVideoClip(startTime: number, endTime: number): Promise<string> {
  const video = document.querySelector('video');
  if (!video) throw new Error('No video element found');

  const duration = endTime - startTime;
  if (duration <= 0 || duration > 90) throw new Error('Invalid clip duration');

  let stream: MediaStream;

  // Try captureStream first — gets both video and audio
  try {
    stream = (video as any).captureStream(30);
    console.log('[annotated] Using captureStream — audio tracks:', stream.getAudioTracks().length);
  } catch {
    // Fallback to canvas (video only, no audio)
    console.warn('[annotated] captureStream failed, falling back to canvas');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    stream = canvas.captureStream(30);

    // Draw loop for canvas fallback
    const ctx = canvas.getContext('2d')!;
    const drawCanvas = () => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(drawCanvas);
    };
    // Start drawing when video plays
    video.addEventListener('play', drawCanvas, { once: false });
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp8,opus',
    videoBitsPerSecond: 2_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Seek to start and play
  video.currentTime = startTime;
  await new Promise<void>(resolve => {
    video.onseeked = () => resolve();
  });

  return new Promise<string>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    };

    recorder.start(100);
    video.play();

    // Monitor playback position to stop at end time
    const checkPosition = () => {
      if (video.currentTime >= endTime || video.paused || video.ended) {
        video.pause();
        if (recorder.state === 'recording') recorder.stop();
        return;
      }
      requestAnimationFrame(checkPosition);
    };
    checkPosition();

    // Safety timeout
    setTimeout(() => {
      if (recorder.state === 'recording') {
        video.pause();
        recorder.stop();
      }
    }, (duration + 5) * 1000);
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

  if (message.type === 'CAPTURE_VIDEO_CLIP') {
    captureVideoClip(message.start, message.end)
      .then(dataUrl => sendResponse({ dataUrl }))
      .catch(err => sendResponse({ error: err.message }));
    return true; // async response
  }
});

console.log('[annotated] content script loaded on', window.location.href);

export {};
