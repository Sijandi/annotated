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

// Capture video clip via canvas + MediaRecorder
async function captureVideoClip(startTime: number, endTime: number): Promise<string> {
  const video = document.querySelector('video');
  if (!video) throw new Error('No video element found');

  const duration = endTime - startTime;
  if (duration <= 0 || duration > 90) throw new Error('Invalid clip duration');

  // Create canvas matching video dimensions
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d')!;

  // Set up MediaRecorder to capture canvas + audio
  const canvasStream = canvas.captureStream(30);

  // Try to capture audio from the video element
  try {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    source.connect(audioCtx.destination); // Keep audio playing
    dest.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
  } catch {
    // Audio capture may fail due to CORS — continue without audio
    console.warn('[annotated] Could not capture audio, recording video only');
  }

  const recorder = new MediaRecorder(canvasStream, {
    mimeType: 'video/webm;codecs=vp8',
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

    // Draw video frames to canvas
    const drawFrame = () => {
      if (video.currentTime >= endTime || video.paused || video.ended) {
        video.pause();
        recorder.stop();
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(drawFrame);
    };
    drawFrame();

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
