import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { RefreshCw, UserPlus, UserMinus, ExternalLink } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

interface Annotation {
  id: string;
  slug: string;
  source_type: string;
  source_title: string | null;
  source_thumbnail_url: string | null;
  created_at: string;
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
  podcast: 'bg-purple-500/20 text-purple-400',
};

export function Feed({ session }: { session: Session }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  const webAppUrl = import.meta.env.VITE_WEB_APP_URL || '';

  useEffect(() => {
    loadFeed();
    loadFollowing();
  }, []);

  const loadFeed = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('annotations')
      .select('id, slug, source_type, source_title, source_thumbnail_url, created_at, profiles(id, username, display_name, avatar_url)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(30);
    setAnnotations((data as any) ?? []);
    setLoading(false);
  };

  const loadFollowing = async () => {
    const { data } = await supabase
      .from('follows')
      .select('followed_id')
      .eq('follower_id', session.user.id);
    if (data) setFollowing(new Set(data.map((f) => f.followed_id)));
  };

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

  const openAnnotation = (slug: string) => {
    const url = webAppUrl ? `${webAppUrl}/a/${slug}` : `#${slug}`;
    chrome.tabs.create({ url });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (annotations.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-zinc-500">
        <p>No annotations yet.</p>
        <p className="mt-1">Be the first to clip something!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {annotations.map((a) => {
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

            <p className="text-xs text-zinc-500">{timeAgo(a.created_at)}</p>
          </div>
        );
      })}
    </div>
  );
}
