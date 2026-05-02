import { useState } from 'react';
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

function sendToTab(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return reject(new Error('No active tab'));
      chrome.tabs.sendMessage(tab.id, message, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(res);
      });
    });
  });
}

async function getVideoTime(): Promise<number | null> {
  try {
    const res = await sendToTab({ type: 'GET_VIDEO_TIME' });
    return res?.time ?? null;
  } catch {
    return null;
  }
}

export function YouTubeClipper({ title, thumbnail, onClipReady }: Props) {
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startSet, setStartSet] = useState(false);
  const [endSet, setEndSet] = useState(false);

  const duration = start !== null && end !== null ? end - start : null;
  const isValid = duration !== null && duration > 0 && duration <= 90;
  const isTooLong = duration !== null && duration > 90;

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
    if (start !== null && time - start > 90) {
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
          Set start
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

      {isValid && (
        <button
          onClick={() => onClipReady({ start: start!, end: end! })}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium transition"
        >
          Next: Add Commentary
        </button>
      )}
    </div>
  );
}
