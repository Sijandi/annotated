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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!session) return <Login />;

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
