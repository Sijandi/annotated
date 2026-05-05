import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { RefreshCw, UserPlus, UserMinus, ExternalLink, Trash2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

interface Annotation {
  id: string;
  slug: string;
  source_type: string;
  source_title: string | null;
  source_thumbnail_url: string | null;
  created_at: string;
  user_id: string;
  profiles: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TYPE_COLORS: Record<string, string> = {
  youtube: 'bg-red-500/20 text-red-400',
  article: 'bg-blue-500/20 text-blue-400',
  podcast: 'bg-zinc-500/20 text-zinc-400',
};

type Filter = 'all' | 'following';

export function Feed({ session }: { session: Session }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');

  const webAppUrl = import.meta.env.VITE_WEB_APP_URL || '';

  const loadFollowing = useCallback(async () => {
    const { data } = await supabase
      .from('follows')
      .select('followed_id')
      .eq('follower_id', session.user.id);
    if (data) setFollowing(new Set(data.map((f) => f.followed_id)));
  }, [session.user.id]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('annotations')
      .select('id, slug, source_type, source_title, source_thumbnail_url, created_at, user_id, profiles(id, username, display_name, avatar_url)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(30);
    setAnnotations((data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFeed();
    loadFollowing();
  }, [loadFeed, loadFollowing]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadFeed, 30000);
    return () => clearInterval(interval);
  }, [loadFeed]);

  const toggleFollow = async (userId: string) => {
    if (following.has(userId)) {
      await supabase.from('follows').delete().match({
        follower_id: session.user.id,
        followed_id: userId,
      });
      setFollowing((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } else {
      await supabase.from('follows').insert({
        follower_id: session.user.id,
        followed_id: userId,
      });
      setFollowing((prev) => new Set(prev).add(userId));
    }
  };

  const deleteAnnotation = async (id: string) => {
    if (!confirm('Delete this annotation?')) return;
    await supabase.from('annotations').delete().eq('id', id);
    setAnnotations(prev => prev.filter(a => a.id !== id));
  };

  const openAnnotation = (slug: string) => {
    const url = webAppUrl ? `${webAppUrl}/a/${slug}` : `#${slug}`;
    chrome.tabs.create({ url });
  };

  const displayed = filter === 'following'
    ? annotations.filter(a => following.has(a.user_id) || a.user_id === session.user.id)
    : annotations;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex rounded-lg bg-zinc-900 p-1">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            filter === 'all' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('following')}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            filter === 'following' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Following
        </button>
      </div>

      {/* Refresh button */}
      <button
        onClick={loadFeed}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition"
      >
        <RefreshCw className="w-3 h-3" />
        Refresh
      </button>

      {displayed.length === 0 ? (
        <div className="text-center py-12 text-sm text-zinc-500">
          {filter === 'following' ? (
            <>
              <p>No annotations from people you follow yet.</p>
              <p className="mt-1 text-xs">Follow annotators from the All tab.</p>
            </>
          ) : (
            <>
              <p>No annotations yet.</p>
              <p className="mt-1 text-xs">Be the first to clip something!</p>
            </>
          )}
        </div>
      ) : (
        displayed.map((a) => {
          const profile = a.profiles;
          const isOwnPost = profile.id === session.user.id;
          return (
            <div
              key={a.id}
              className="rounded-lg bg-zinc-900 p-3 space-y-2 hover:bg-zinc-800/70 transition cursor-pointer"
              onClick={() => openAnnotation(a.slug)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="w-6 h-6 rounded-full shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-zinc-700 shrink-0" />
                  )}
                  <span className="text-xs text-zinc-400 truncate">
                    {profile.display_name || profile.username}
                  </span>
                  {!isOwnPost && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFollow(profile.id);
                      }}
                      className="shrink-0 p-1 hover:bg-zinc-700 rounded transition"
                      title={following.has(profile.id) ? 'Unfollow' : 'Follow'}
                    >
                      {following.has(profile.id) ? (
                        <UserMinus className="w-3 h-3 text-zinc-500" />
                      ) : (
                        <UserPlus className="w-3 h-3 text-blue-400" />
                      )}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[a.source_type] ?? 'bg-zinc-700 text-zinc-400'}`}>
                    {a.source_type}
                  </span>
                  <ExternalLink className="w-3 h-3 text-zinc-600" />
                </div>
              </div>

              {a.source_title && (
                <p className="text-sm text-zinc-200 line-clamp-2">{a.source_title}</p>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">{timeAgo(a.created_at)}</p>
                {isOwnPost && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAnnotation(a.id);
                    }}
                    className="p-1 hover:bg-zinc-700 rounded transition"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3 text-zinc-600 hover:text-red-400" />
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
