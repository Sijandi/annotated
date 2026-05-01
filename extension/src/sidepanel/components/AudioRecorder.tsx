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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const audioUrlRef = useRef<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const drawWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);

      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufLen;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const v = data[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        audioUrlRef.current = URL.createObjectURL(blob);
        onRecorded(blob);
        setState('recorded');
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      };

      mediaRecorder.start(100);
      setState('recording');
      setDuration(0);

      timerRef.current = window.setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      drawWaveform();
    } catch {
      console.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
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

          <canvas
            ref={canvasRef}
            width={280}
            height={60}
            className="w-full rounded-lg"
          />

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
