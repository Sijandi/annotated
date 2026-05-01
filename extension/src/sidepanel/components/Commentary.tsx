import { useState, useRef, useEffect } from 'react';
import { AudioRecorder } from './AudioRecorder';
import { Type, Mic } from 'lucide-react';

export interface CommentaryData {
  text?: string;
  audioBlob?: Blob;
}

interface Props {
  clipPreviewBlob?: Blob;
  sourceType: string;
  onReady: (data: CommentaryData) => void;
  onBack: () => void;
}

export function Commentary({ clipPreviewBlob, sourceType, onReady, onBack }: Props) {
  const [tab, setTab] = useState<'text' | 'audio'>('text');
  const [text, setText] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [confirming, setConfirming] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (clipPreviewBlob) {
      previewUrlRef.current = URL.createObjectURL(clipPreviewBlob);
    }
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [clipPreviewBlob]);

  const canSubmit =
    (tab === 'text' && text.trim().length > 0) ||
    (tab === 'audio' && audioBlob !== null);

  const handlePublish = () => {
    setConfirming(true);
  };

  const confirmPublish = () => {
    onReady(
      tab === 'text'
        ? { text: text.trim() }
        : { audioBlob: audioBlob! }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition"
        >
          ← Back
        </button>
        <h3 className="text-sm font-medium text-zinc-200">Add Commentary</h3>
      </div>

      {/* Clip preview */}
      {previewUrlRef.current && sourceType === 'youtube' && (
        <div className="rounded-lg overflow-hidden bg-black">
          <video
            src={previewUrlRef.current}
            controls
            className="w-full aspect-video"
          />
        </div>
      )}

      <div className="flex rounded-lg bg-zinc-900 p-1">
        <button
          onClick={() => setTab('text')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === 'text' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Type className="w-4 h-4" />
          Text
        </button>
        <button
          onClick={() => setTab('audio')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === 'audio' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Mic className="w-4 h-4" />
          Audio
        </button>
      </div>

      {tab === 'text' ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's your take on this?"
            maxLength={2000}
            rows={5}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-600"
          />
          <div className="text-xs text-zinc-500 text-right">{text.length} / 2,000</div>
        </div>
      ) : (
        <AudioRecorder
          onRecorded={setAudioBlob}
          onCleared={() => setAudioBlob(null)}
        />
      )}

      {confirming ? (
        <div className="space-y-2">
          <p className="text-xs text-zinc-400 text-center">Publish this annotation? This will be public.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 text-sm font-medium transition text-zinc-400"
            >
              Cancel
            </button>
            <button
              onClick={confirmPublish}
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-500 px-4 py-2.5 text-sm font-medium transition"
            >
              Confirm
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => onReady({})}
            className="flex-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 text-sm font-medium transition text-zinc-400"
          >
            Skip
          </button>
          <button
            onClick={handlePublish}
            disabled={!canSubmit}
            className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Publish
          </button>
        </div>
      )}
    </div>
  );
}
