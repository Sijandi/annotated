import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Play, Pause, Trash2 } from 'lucide-react';

interface Props {
  onRecorded: (blob: Blob) => void;
  onCleared?: () => void;
}

export function AudioRecorder({ onRecorded, onCleared }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIframe, setShowIframe] = useState(false);

  const timerRef = useRef<number>(0);
  const audioUrlRef = useRef<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Listen for recording result from iframe/popup
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (!changes.audioResult?.newValue) return;
      const result = changes.audioResult.newValue;
      chrome.storage.local.remove('audioResult');

      if (timerRef.current) clearInterval(timerRef.current);
      setShowIframe(false);

      if (result.error) {
        setError(result.error);
        setState('idle');
        return;
      }

      if (result.dataUrl) {
        fetch(result.dataUrl)
          .then(r => r.blob())
          .then(blob => {
            audioUrlRef.current = URL.createObjectURL(blob);
            onRecorded(blob);
            setState('recorded');
          })
          .catch(() => {
            setError('Failed to process audio');
            setState('idle');
          });
      }
    };

    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, [onRecorded]);

  const startRecording = () => {
    setError(null);
    chrome.storage.local.remove('audioResult');
    setShowIframe(true);
    setState('recording');
    setDuration(0);
    timerRef.current = window.setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);
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
    setShowIframe(false);
    setState('idle');
    setDuration(0);
    setPlaying(false);
    onCleared?.();
  };

  const formatDur = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-400">{error}</p>}

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
          <div className="flex items-center justify-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm text-red-400 font-mono">{formatDur(duration)}</span>
          </div>

          {showIframe && (
            <iframe
              src={chrome.runtime.getURL('recorder.html')}
              className="w-full border border-zinc-800 rounded-lg"
              style={{ height: '140px' }}
              allow="microphone"
            />
          )}
        </div>
      )}

      {state === 'recorded' && (
        <div className="flex items-center justify-between rounded-lg bg-zinc-900 p-3">
          <button onClick={togglePlayback} className="p-1.5 hover:bg-zinc-800 rounded-md transition">
            {playing ? <Pause className="w-4 h-4 text-zinc-100" /> : <Play className="w-4 h-4 text-zinc-100" />}
          </button>
          <span className="text-sm text-green-400">Audio recorded</span>
          <button onClick={discard} className="p-1.5 hover:bg-zinc-800 rounded-md transition">
            <Trash2 className="w-4 h-4 text-zinc-500 hover:text-red-400" />
          </button>
        </div>
      )}
    </div>
  );
}
