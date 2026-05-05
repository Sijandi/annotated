import { useState } from 'react';
import { Clock, Play, Square, AlertCircle, Headphones } from 'lucide-react';

interface ClipData {
  start: number;
  end: number;
  audioSrc?: string;
}

interface Props {
  title: string;
  audioSrc?: string;
  onClipReady: (data: ClipData) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getAudioTime(): Promise<{ time: number | null; src?: string }> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return resolve({ time: null });
      chrome.tabs.sendMessage(tab.id, { type: 'GET_AUDIO_TIME' }, (res) => {
        if (chrome.runtime.lastError) return resolve({ time: null });
        resolve({ time: res?.time ?? null, src: res?.src });
      });
    });
  });
}

export function PodcastClipper({ title, audioSrc: initialSrc, onClipReady }: Props) {
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [audioSrc, setAudioSrc] = useState(initialSrc);
  const [error, setError] = useState<string | null>(null);

  const duration = start !== null && end !== null ? end - start : null;
  const isValid = duration !== null && duration > 0 && duration <= 90;
  const isTooLong = duration !== null && duration > 90;

  const handleSetStart = async () => {
    const { time, src } = await getAudioTime();
    if (time === null) {
      setError('Could not read audio time. Make sure an audio player is on the page.');
      return;
    }
    setError(null);
    setStart(time);
    if (src) setAudioSrc(src);
    if (end !== null && end <= time) setEnd(null);
  };

  const handleSetEnd = async () => {
    const { time } = await getAudioTime();
    if (time === null) {
      setError('Could not read audio time.');
      return;
    }
    setError(null);
    if (start !== null && time - start > 90) {
      setError('Clip cannot exceed 90 seconds.');
      return;
    }
    if (start !== null && time <= start) {
      setError('End time must be after start time.');
      return;
    }
    setEnd(time);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Headphones className="w-5 h-5 text-zinc-400" />
        <h3 className="text-sm font-medium text-zinc-200 line-clamp-2">{title}</h3>
      </div>

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
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2.5 text-sm font-medium transition"
        >
          <Square className="w-4 h-4 text-red-400" />
          Set end
        </button>
      </div>

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
          <span>Clip exceeds 90-second maximum.</span>
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
          onClick={() => onClipReady({ start: start!, end: end!, audioSrc })}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium transition"
        >
          Next: Add Commentary
        </button>
      )}
    </div>
  );
}
