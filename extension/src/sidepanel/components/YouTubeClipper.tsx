import { useState, useRef } from 'react';
import { Clock, Play, Square, AlertCircle } from 'lucide-react';

interface ClipData {
  start: number;
  end: number;
  videoBlob?: Blob;
}

interface Props {
  title: string;
  thumbnail?: string;
  onClipReady: (data: ClipData) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getVideoTime(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return resolve(null);
      chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_TIME' }, (res) => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(res?.time ?? null);
      });
    });
  });
}

function startCapture(retries = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return reject(new Error('No active tab'));
      chrome.tabs.sendMessage(tab.id, { type: 'START_CAPTURE' }, (res) => {
        if (chrome.runtime.lastError) {
          if (retries > 0) {
            // Content script may not be ready — retry after a short delay
            setTimeout(() => startCapture(retries - 1).then(resolve).catch(reject), 500);
            return;
          }
          return reject(new Error('Content script not ready. Try refreshing the page.'));
        }
        if (res?.error) return reject(new Error(res.error));
        resolve();
      });
    });
  });
}

function stopCapture(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return reject(new Error('No active tab'));
      chrome.tabs.sendMessage(tab.id, { type: 'STOP_CAPTURE' }, async (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res?.error) return reject(new Error(res.error));
        if (!res?.dataUrl) return reject(new Error('No video data'));
        try {
          const r = await fetch(res.dataUrl);
          const blob = await r.blob();
          resolve(blob);
        } catch (e: any) {
          reject(e);
        }
      });
    });
  });
}

export function YouTubeClipper({ title, thumbnail, onClipReady }: Props) {
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const duration = start !== null && end !== null ? end - start : null;
  const isValid = duration !== null && duration > 0 && duration <= 90;
  const isTooLong = duration !== null && duration > 90;

  const handleSetStart = async () => {
    const time = await getVideoTime();
    if (time === null) {
      setError('Could not read video time. Make sure a YouTube video is playing.');
      return;
    }
    setError(null);
    setStart(time);
    setEnd(null);
    blobRef.current = null;

    // Start recording in the content script
    try {
      await startCapture();
      setRecording(true);
    } catch (err: any) {
      setError(err.message || 'Failed to start recording');
    }
  };

  const handleSetEnd = async () => {
    const time = await getVideoTime();
    if (time === null) {
      setError('Could not read video time.');
      return;
    }
    setError(null);
    if (start !== null && time - start > 90) {
      setError('Clip cannot exceed 90 seconds. Move the video closer to your start point.');
      // Stop recording anyway
      try { await stopCapture(); } catch {}
      setRecording(false);
      return;
    }
    if (start !== null && time <= start) {
      setError('End time must be after start time.');
      return;
    }
    setEnd(time);

    // Stop recording and get the blob
    if (recording) {
      try {
        const blob = await stopCapture();
        blobRef.current = blob;
        setRecording(false);
      } catch (err: any) {
        setError(err.message || 'Failed to stop recording');
        setRecording(false);
      }
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
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2.5 text-sm font-medium transition"
        >
          <Play className="w-4 h-4 text-green-400" />
          {recording ? 'Restart' : 'Set start'}
        </button>
        <button
          onClick={handleSetEnd}
          disabled={start === null}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2.5 text-sm font-medium transition disabled:opacity-40"
        >
          <Square className="w-4 h-4 text-red-400" />
          Set end
        </button>
      </div>

      {recording && (
        <div className="flex items-center gap-2 text-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-red-400">Recording clip...</span>
        </div>
      )}

      <div className="rounded-lg bg-zinc-900 p-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Start</span>
          <span className="text-zinc-100 font-mono">
            {start !== null ? formatTime(start) : '--:--'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">End</span>
          <span className="text-zinc-100 font-mono">
            {end !== null ? formatTime(end) : '--:--'}
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

      {isValid && blobRef.current && (
        <button
          onClick={() => onClipReady({ start: start!, end: end!, videoBlob: blobRef.current! })}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium transition"
        >
          Next: Add Commentary
        </button>
      )}
    </div>
  );
}
