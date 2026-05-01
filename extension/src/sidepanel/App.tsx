import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Login } from './components/Login';
import { Capture } from './components/Capture';
import { Feed } from './components/Feed';
import type { Session } from '@supabase/supabase-js';

type Tab = 'capture' | 'feed';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('capture');
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);

      // Show onboarding on first sign-in
      if (session) {
        chrome.storage.local.get('onboarded', (result) => {
          if (!result.onboarded) setShowOnboarding(true);
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const dismissOnboarding = () => {
    chrome.storage.local.set({ onboarded: true });
    setShowOnboarding(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Login />;

  if (showOnboarding) {
    return (
      <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 p-6">
        <div className="flex-1 flex flex-col justify-center space-y-6">
          <h1 className="text-2xl font-bold">Welcome to Annotated</h1>
          <div className="space-y-4 text-sm text-zinc-400">
            <div className="flex gap-3">
              <span className="text-blue-400 font-mono shrink-0">1.</span>
              <p>Navigate to a <span className="text-zinc-200">YouTube video</span>, <span className="text-zinc-200">news article</span>, or <span className="text-zinc-200">podcast</span> page</p>
            </div>
            <div className="flex gap-3">
              <span className="text-blue-400 font-mono shrink-0">2.</span>
              <p>The sidebar auto-detects what's on the page and shows capture controls</p>
            </div>
            <div className="flex gap-3">
              <span className="text-blue-400 font-mono shrink-0">3.</span>
              <p><span className="text-zinc-200">Set start and end</span> to clip a video, or <span className="text-zinc-200">highlight text</span> on an article</p>
            </div>
            <div className="flex gap-3">
              <span className="text-blue-400 font-mono shrink-0">4.</span>
              <p>Add your <span className="text-zinc-200">text or audio commentary</span>, then publish</p>
            </div>
            <div className="flex gap-3">
              <span className="text-blue-400 font-mono shrink-0">5.</span>
              <p>Every clip gets a <span className="text-zinc-200">shareable landing page</span> with a link back to the source</p>
            </div>
          </div>
          <button
            onClick={dismissOnboarding}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-3 text-sm font-medium transition"
          >
            Got it — let's go
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 shrink-0">
        <button
          onClick={() => setActiveTab('capture')}
          className={`flex-1 py-2.5 text-sm font-medium transition ${
            activeTab === 'capture'
              ? 'text-zinc-100 border-b-2 border-blue-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Capture
        </button>
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex-1 py-2.5 text-sm font-medium transition ${
            activeTab === 'feed'
              ? 'text-zinc-100 border-b-2 border-blue-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Feed
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'capture' ? (
          <Capture session={session} />
        ) : (
          <div className="p-4">
            <Feed session={session} />
          </div>
        )}
      </div>
    </div>
  );
}
