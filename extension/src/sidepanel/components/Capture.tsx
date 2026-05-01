import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { LogOut } from 'lucide-react';

interface PageContext {
  url: string;
  title: string;
  sourceType: 'youtube' | 'article' | 'podcast' | 'unknown';
  metadata: {
    description?: string;
    author?: string;
    image?: string;
  };
}

export function Capture({ session }: { session: Session }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('content script not ready:', chrome.runtime.lastError.message);
          return;
        }
        setPageContext(response);
      });
    });
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h1 className="text-lg font-semibold">Annotated</h1>
        <button
          onClick={signOut}
          className="p-1.5 hover:bg-zinc-800 rounded-md transition"
          title="Sign out"
        >
          <LogOut className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        {!pageContext ? (
          <div className="text-sm text-zinc-400">Detecting page…</div>
        ) : pageContext.sourceType === 'unknown' ? (
          <div className="text-sm text-zinc-400">
            <p className="mb-2">No clippable media detected on this page.</p>
            <p className="text-xs">Annotated supports YouTube videos, news articles, and podcasts.</p>
          </div>
        ) : (
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
              {pageContext.sourceType} detected
            </div>
            <h2 className="text-base font-medium text-zinc-100 line-clamp-2 mb-3">
              {pageContext.title}
            </h2>

            {/* TODO Day 3: Per-source-type capture UI mounts here */}
            <div className="rounded-lg bg-zinc-900 p-4 text-sm text-zinc-400">
              Capture UI for <code>{pageContext.sourceType}</code> coming next.
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500">
        {session.user.email ?? session.user.user_metadata?.user_name ?? 'Signed in'}
      </div>
    </div>
  );
}
