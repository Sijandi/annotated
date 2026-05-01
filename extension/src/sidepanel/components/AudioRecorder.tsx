import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react';

interface Props {
  onRecorded: (blob: Blob) => void;
  onCleared?: () => void;
}

export function AudioRecorder({ onRecorded, onCleared }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<number>(0);
  const audioUrlRef = useRef<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startRecording = async () => {
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
      if (response?.error) throw new Error(response.error);

      setState('recording');
      setDuration(0);
      timerRef.current = window.setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err: any) {
      console.error('[annotated] recording error:', err);
      setError(err.message || 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      // Watch session storage for the audio result
      const resultPromise = new Promise<any>((resolve) => {
        const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
          if (changes.audioResult) {
            chrome.storage.session.onChanged.removeListener(listener);
            resolve(changes.audioResult.newValue);
            chrome.storage.session.remove('audioResult');
          }
        };
        chrome.storage.session.onChanged.addListener(listener);
        setTimeout(() => {
          chrome.storage.session.onChanged.removeListener(listener);
          resolve({ error: 'Recording timed out' });
        }, 10000);
      });

      // Tell background to stop
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

      const result = await resultPromise;
      if (result.error) throw new Error(result.error);
      if (!result.dataUrl) throw new Error('No audio data received');

      // Convert data URL to blob
      const res = await fetch(result.dataUrl);
      const blob = await res.blob();

      audioUrlRef.current = URL.createObjectURL(blob);
      onRecorded(blob);
      setState('recorded');
    } catch (err: any) {
      console.error('[annotated] stop recording error:', err);
      setError(err.message || 'Failed to stop recording');
      setState('idle');
    }
  };

  const togglePlayback = () => {
    if (!audioUrlRef.current) return;
    if (!audioElRef.current) {
      audioElRef.current = new Audio(audioUrlRef.current);
      audioElRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioElRef.current.pause();
      setPlaying(false);
    } else {
      audioElRef.current.play();
      setPlaying(true);
    }
  };

  const discard = () => {
    cleanup();
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    setState('idle');
    setDuration(0);
    setPlaying(false);
    onCleared?.();
  };

  const formatDur = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {state === 'idle' && (
        <button
          onClick={startRecording}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 px-4 py-3 text-sm font-medium transition"
        >
          <Mic className="w-5 h-5" />
          Record Audio Commentary
        </button>
      )}

      {state === 'recording' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm text-red-400 font-mono">{formatDur(duration)}</span>
          </div>

          <button
            onClick={stopRecording}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 text-sm font-medium transition"
          >
            <Square className="w-4 h-4 text-red-400" />
            Stop Recording
          </button>
        </div>
      )}

      {state === 'recorded' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-zinc-900 p-3">
            <button
              onClick={togglePlayback}
              className="p-1.5 hover:bg-zinc-800 rounded-md transition"
            >
              {playing ? (
                <Pause className="w-4 h-4 text-zinc-100" />
              ) : (
                <Play className="w-4 h-4 text-zinc-100" />
              )}
            </button>
            <span className="text-sm text-zinc-400 font-mono">{formatDur(duration)}</span>
            <button
              onClick={discard}
              className="p-1.5 hover:bg-zinc-800 rounded-md transition"
            >
              <Trash2 className="w-4 h-4 text-zinc-500 hover:text-red-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
