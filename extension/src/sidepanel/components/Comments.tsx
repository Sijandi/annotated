import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { RefreshCw, Trash2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

interface Comment {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  profiles: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

const MAX_BODY_LENGTH = 2000;

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

interface CommentsProps {
  annotationId: string;
  session: Session;
  /** Called with +1 / -1 so the parent can keep its comment count in sync. */
  onCountChange: (delta: number) => void;
}

export function Comments({ annotationId, session, onCountChange }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: loadError } = await supabase
        .from('comments')
        .select('id, body, created_at, user_id, profiles(username, display_name, avatar_url)')
        .eq('annotation_id', annotationId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (loadError) setError('Failed to load comments.');
      setComments((data as any) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [annotationId]);

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > MAX_BODY_LENGTH || posting) return;
    setPosting(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('comments')
      .insert({
        annotation_id: annotationId,
        user_id: session.user.id,
        body: trimmed,
      })
      .select('id, body, created_at, user_id, profiles(username, display_name, avatar_url)')
      .single();
    if (insertError || !data) {
      setError('Failed to post comment. Please try again.');
    } else {
      setComments((prev) => [...prev, data as any]);
      setBody('');
      onCountChange(1);
    }
    setPosting(false);
  };

  const deleteComment = async (id: string) => {
    setError(null);
    const { error: deleteError } = await supabase
      .from('comments')
      .delete()
      .match({ id, user_id: session.user.id });
    if (deleteError) {
      setError('Failed to delete comment.');
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== id));
    onCountChange(-1);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-3">
        <RefreshCw className="w-3 h-3 text-zinc-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2 border-t border-zinc-800">
      {comments.length === 0 && (
        <p className="text-xs text-zinc-600">No comments yet.</p>
      )}

      {comments.map((c) => (
        <div key={c.id} className="flex gap-2">
          {c.profiles.avatar_url ? (
            <img src={c.profiles.avatar_url} alt="" className="w-5 h-5 rounded-full shrink-0" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-zinc-700 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="font-medium text-zinc-400 truncate">
                {c.profiles.display_name || c.profiles.username}
              </span>
              <span className="text-zinc-600 shrink-0">{timeAgo(c.created_at)}</span>
              {c.user_id === session.user.id && (
                <button
                  onClick={() => deleteComment(c.id)}
                  className="ml-auto shrink-0 p-0.5 hover:bg-zinc-700 rounded transition"
                  title="Delete comment"
                >
                  <Trash2 className="w-3 h-3 text-zinc-600 hover:text-red-400" />
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-300 mt-0.5 break-words whitespace-pre-wrap">{c.body}</p>
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <form onSubmit={postComment} className="flex gap-1.5">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment..."
          maxLength={MAX_BODY_LENGTH}
          disabled={posting}
          className="flex-1 min-w-0 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={posting || !body.trim()}
          className="shrink-0 rounded-md bg-zinc-100 hover:bg-white text-zinc-900 px-2.5 py-1 text-xs font-medium transition disabled:opacity-40"
        >
          {posting ? 'Posting…' : 'Post'}
        </button>
      </form>
    </div>
  );
}
