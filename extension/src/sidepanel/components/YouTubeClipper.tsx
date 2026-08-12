import { useEffect, useRef, useState } from 'react';
import { Clock, Play, Square, AlertCircle, Video } from 'lucide-react';
import { getTargetTab } from '../../lib/targetTab';

export interface CropInfo {
  rect: { x: number; y: number; width: number; height: number };
  dpr: number;
  viewport: { width: number; height: number };
}

interface ClipData {
  start: number;
  end: number;
  videoBlob?: Blob;
  crop?: CropInfo;
}

interface Props {
  title: string;
  thumbnail?: string;
  onClipReady: (data: ClipData) => void;
}

const MAX_CLIP_SECONDS = 90;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Pass `tabId` to pin a long-running flow (e.g. capture) to one tab even if
// the user switches tabs mid-way; otherwise the target (active) tab is used.
function sendToTab(message: any, tabId?: number): Promise<any> {
  if (tabId !== undefined) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(res);
      });
    });
  }
  return getTargetTab().then((tab) => sendToTab(message, tab.id!));
}

function sendToBackground(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(res);
    });
  });
}

// Resolves with the value once `key` appears in chrome.storage.local
// (or null on timeout). Consumes (removes) the key when found.
function waitForStorageKey(key: string, timeoutMs: number): Promise<any | null> {
  return new Promise((resolve) => {
    let done = false;
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[key]?.newValue) finish(changes[key].newValue);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const finish = (value: any) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.storage.local.onChanged.removeListener(listener);
      if (value !== null) chrome.storage.local.remove(key);
      resolve(value);
    };
    chrome.storage.local.onChanged.addListener(listener);
    // The value may have been written before the listener attached
    chrome.storage.local.get(key, (items) => {
      if (items[key]) finish(items[key]);
    });
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function getVideoTime(): Promise<number | null> {
  try {
    const res = await sendToTab({ type: 'GET_VIDEO_TIME' });
    return res?.time ?? null;
  } catch {
    return null;
  }
}

// Preferred path: chrome.tabCapture via background → offscreen document.
// Records video + tab audio. Returns null if capture couldn't start
// (caller falls back to silent canvas capture).
async function recordViaTabCapture(
  tabId: number,
  duration: number,
  onRecordingStarted: () => Promise<void>
): Promise<Blob | null> {
  // Offscreen doc must exist before we mint the stream ID — IDs expire quickly.
  const ensure = await sendToBackground({ type: 'ENSURE_OFFSCREEN' });
  if (ensure?.error) {
    console.warn('[annotated] offscreen unavailable:', ensure.error);
    return null;
  }

  const streamRes = await sendToBackground({ type: 'CAPTURE_TAB', tabId });
  if (!streamRes?.streamId) {
    console.warn('[annotated] tabCapture unavailable:', streamRes?.error);
    return null;
  }

  await chrome.storage.local.remove(['captureResult', 'captureStatus']);
  // Arm waiters before issuing the start command so no signal is missed
  const statusPromise = waitForStorageKey('captureStatus', 5000);
  const resultPromise = waitForStorageKey('captureResult', (duration + 15) * 1000);
  await chrome.storage.local.set({
    captureCmd: { action: 'start', streamId: streamRes.streamId, duration, ts: Date.now() },
  });

  const status = await statusPromise;
  if (status?.status !== 'recording') {
    console.warn('[annotated] tab capture failed to start:', status?.error || 'timed out');
    return null;
  }

  // Recording is live in the offscreen doc — start playback now
  try {
    await onRecordingStarted();
  } catch (err) {
    await chrome.storage.local.set({ captureCmd: { action: 'stop', ts: Date.now() } });
    throw err;
  }

  const result = await resultPromise;
  if (!result?.dataUrl) {
    console.warn('[annotated] tab capture produced no result:', result?.error || 'timed out');
    return null;
  }
  return dataUrlToBlob(result.dataUrl);
}

// Fallback path: canvas capture in the content script. Works when tabCapture
// is denied, but produces silent video (a canvas stream has no audio track).
async function recordViaCanvas(
  tabId: number,
  duration: number,
  onRecordingStarted: () => Promise<void>
): Promise<Blob> {
  const startRes = await sendToTab({ type: 'START_CAPTURE' }, tabId);
  if (startRes?.error) throw new Error(startRes.error);

  await onRecordingStarted();
  await new Promise((r) => setTimeout(r, (duration + 0.5) * 1000));

  const stopRes = await sendToTab({ type: 'STOP_CAPTURE' }, tabId);
  if (!stopRes?.dataUrl) throw new Error(stopRes?.error || 'Capture failed');
  return dataUrlToBlob(stopRes.dataUrl);
}

type CapturePhase = 'idle' | 'starting' | 'recording' | 'finishing';

export function YouTubeClipper({ title, thumbnail, onClipReady }: Props) {
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startSet, setStartSet] = useState(false);
  const [endSet, setEndSet] = useState(false);
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [remaining, setRemaining] = useState(0);
  const countdownRef = useRef<number>(0);
  const capturingRef = useRef(false); // synchronous double-start guard

  useEffect(() => () => clearInterval(countdownRef.current), []);

  const duration = start !== null && end !== null ? end - start : null;
  const isValid = duration !== null && duration > 0 && duration <= MAX_CLIP_SECONDS;
  const isTooLong = duration !== null && duration > MAX_CLIP_SECONDS;
  const busy = phase !== 'idle';

  const handleSetStart = async () => {
    const time = await getVideoTime();
    if (time === null) {
      setError('Could not read video time. Make sure a YouTube video is playing and try refreshing the page.');
      return;
    }
    setError(null);
    setStart(time);
    setStartSet(true);
    setEndSet(false);
    if (end !== null && end <= time) setEnd(null);
    setTimeout(() => setStartSet(false), 1500);
  };

  const handleSetEnd = async () => {
    const time = await getVideoTime();
    if (time === null) {
      setError('Could not read video time.');
      return;
    }
    setError(null);
    if (start !== null && time - start > MAX_CLIP_SECONDS) {
      setError('Clip cannot exceed 90 seconds. Move the video closer to your start point.');
      return;
    }
    if (start !== null && time <= start) {
      setError('End time must be after start time.');
      return;
    }
    setEnd(time);
    setEndSet(true);
    setTimeout(() => setEndSet(false), 1500);
  };

  const startCountdown = (secs: number) => {
    setPhase('recording');
    setRemaining(Math.ceil(secs));
    clearInterval(countdownRef.current);
    countdownRef.current = window.setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
  };

  const handleCapture = async () => {
    if (capturingRef.current || start === null || end === null || !isValid) return;
    capturingRef.current = true;
    setError(null);
    setPhase('starting');

    const clipDuration = Math.min(end - start, MAX_CLIP_SECONDS);

    // Pin the whole flow to the tab being clipped, in case the user switches
    // tabs while the recording runs.
    let tabId: number | undefined;

    try {
      const tab = await getTargetTab();
      tabId = tab.id!;

      // Seek to the clip start (paused) and grab the player geometry for cropping
      const prep = await sendToTab({ type: 'PREPARE_CAPTURE', time: start }, tabId);
      if (!prep?.crop) throw new Error(prep?.error || 'Could not prepare the video for capture');
      const crop: CropInfo = prep.crop;

      const onRecordingStarted = async () => {
        const playRes = await sendToTab({ type: 'PLAY_VIDEO' }, tabId);
        if (playRes?.error) throw new Error(playRes.error);
        startCountdown(clipDuration);
      };

      // Preferred: tab capture (video + audio). Fallback: silent canvas capture.
      let videoBlob = await recordViaTabCapture(tabId, clipDuration, onRecordingStarted);
      let usedTabCapture = true;
      if (!videoBlob) {
        usedTabCapture = false;
        console.warn('[annotated] falling back to canvas capture (no audio)');
        // Re-seek to the clip start in case the tab path already began playback
        await sendToTab({ type: 'PREPARE_CAPTURE', time: start }, tabId);
        videoBlob = await recordViaCanvas(tabId, clipDuration, onRecordingStarted);
      }
      console.log(
        `[annotated] clip captured via ${usedTabCapture ? 'tabCapture (video + tab audio)' : 'canvas fallback (silent)'}, ${videoBlob.size} bytes`
      );

      setPhase('finishing');
      clearInterval(countdownRef.current);
      await sendToTab({ type: 'PAUSE_VIDEO' }, tabId).catch(() => {});

      capturingRef.current = false;
      setPhase('idle');
      // Canvas capture already frames just the video element — only the
      // full-tab recording needs server-side cropping.
      onClipReady({ start, end, videoBlob, crop: usedTabCapture ? crop : undefined });
    } catch (err: any) {
      clearInterval(countdownRef.current);
      if (tabId !== undefined) await sendToTab({ type: 'PAUSE_VIDEO' }, tabId).catch(() => {});
      capturingRef.current = false;
      setPhase('idle');
      setError(err.message || 'Failed to capture clip');
    }
  };

  return (
    <div className="space-y-4">
      {thumbnail && (
        <img src={thumbnail} alt="" className="w-full rounded-lg object-cover aspect-video" />
      )}
      <h3 className="text-sm font-medium text-zinc-200 line-clamp-2">{title}</h3>

      <div className="flex gap-3">
        <button
          onClick={handleSetStart}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2.5 text-sm font-medium transition disabled:opacity-40"
        >
          <Play className="w-4 h-4 text-green-400" />
          Set start
        </button>
        <button
          onClick={handleSetEnd}
          disabled={start === null || busy}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2.5 text-sm font-medium transition disabled:opacity-40"
        >
          <Square className="w-4 h-4 text-red-400" />
          Set end
        </button>
      </div>

      <div className="rounded-lg bg-zinc-900 p-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Start</span>
          <span className={`font-mono transition-colors ${startSet ? 'text-green-400' : 'text-zinc-100'}`}>
            {start !== null ? `✓ ${formatTime(start)}` : '--:--'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">End</span>
          <span className={`font-mono transition-colors ${endSet ? 'text-green-400' : 'text-zinc-100'}`}>
            {end !== null ? `✓ ${formatTime(end)}` : '--:--'}
          </span>
        </div>
        <div className="flex justify-between text-sm border-t border-zinc-800 pt-2">
          <span className="text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Duration
          </span>
          <span className={`font-mono ${isTooLong ? 'text-red-400' : 'text-zinc-100'}`}>
            {duration !== null ? formatTime(duration) : '--:--'}
          </span>
        </div>
      </div>

      {isTooLong && (
        <div className="flex items-start gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Clip exceeds 90-second maximum. Adjust your start or end point.</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {phase === 'starting' && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm text-zinc-400">
          <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Starting capture...
        </div>
      )}

      {phase === 'recording' && (
        <div className="flex items-center justify-center gap-3 rounded-lg bg-red-600/10 px-4 py-2.5 text-sm">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <span className="text-red-400 font-medium">Recording clip</span>
          <span className="text-red-400 font-mono">{remaining}s left</span>
        </div>
      )}

      {phase === 'finishing' && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm text-zinc-400">
          <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Processing clip...
        </div>
      )}

      {isValid && phase === 'idle' && (
        <button
          onClick={handleCapture}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium transition"
        >
          <Video className="w-4 h-4" />
          Record clip
        </button>
      )}
    </div>
  );
}
