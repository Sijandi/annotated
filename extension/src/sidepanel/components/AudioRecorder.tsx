import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Play, Pause, Trash2 } from 'lucide-react';

interface Props {
  onRecorded: (blob: Blob) => void;
  onCleared?: () => void;
}

export function AudioRecorder({ onRecorded, onCleared }: Props) {
  const [state, setState] = useState<'idle' | 'waiting' | 'recorded'>('idle');
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioUrlRef = useRef<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const durationRef = useRef(0);

  const cleanup = useCallback(() => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Listen for recording result from popup
  useEffect(() => {
    if (state !== 'waiting') return;

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (!changes.audioResult?.newValue) return;
      const result = changes.audioResult.newValue;
      chrome.storage.local.remove('audioResult');

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
  }, [state, onRecorded]);

  const openRecorder = () => {
    setError(null);
    // Clear any previous result
    chrome.storage.local.remove('audioResult');
    setState('waiting');

    // Open recorder popup
    chrome.windows.create({
      url: chrome.runtime.getURL('recorder.html'),
      type: 'popup',
      width: 340,
      height: 250,
      focused: true,
    });
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
    setPlaying(false);
    onCleared?.();
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {state === 'idle' && (
        <button
          onClick={openRecorder}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 px-4 py-3 text-sm font-medium transition"
        >
          <Mic className="w-5 h-5" />
          Record Audio Commentary
        </button>
      )}

      {state === 'waiting' && (
        <div className="text-center py-3">
          <p className="text-sm text-zinc-400">Recording in popup window...</p>
          <p className="text-xs text-zinc-600 mt-1">Close the popup when done.</p>
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
