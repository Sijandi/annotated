import { useState } from 'react';
import { Quote, RefreshCw } from 'lucide-react';

interface Props {
  title: string;
  author?: string;
  onTextReady: (text: string) => void;
}

function getSelection(): Promise<string> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return resolve('');
      chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' }, (res) => {
        if (chrome.runtime.lastError) return resolve('');
        resolve(res?.selection ?? '');
      });
    });
  });
}

export function ArticleHighlighter({ title, author, onTextReady }: Props) {
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const handleGrab = async () => {
    setGrabbing(true);
    const text = await getSelection();
    setGrabbing(false);
    if (text) {
      setSelectedText(text);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-zinc-200 line-clamp-2">{title}</h3>
        {author && <p className="text-xs text-zinc-500 mt-1">by {author}</p>}
      </div>

      {!selectedText ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Highlight text on the page, then click the button below to capture it.
          </p>
          <button
            onClick={handleGrab}
            disabled={grabbing}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 text-sm font-medium transition disabled:opacity-50"
          >
            <Quote className="w-4 h-4" />
            {grabbing ? 'Grabbing...' : 'Grab Selection'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <blockquote className="border-l-2 border-blue-500 pl-3 py-1 text-sm text-zinc-300 italic bg-zinc-900 rounded-r-lg p-3">
            "{selectedText}"
          </blockquote>

          <button
            onClick={handleGrab}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition"
          >
            <RefreshCw className="w-3 h-3" />
            Re-select
          </button>

          <button
            onClick={() => onTextReady(selectedText)}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium transition"
          >
            Next: Add Commentary
          </button>
        </div>
      )}
    </div>
  );
}
