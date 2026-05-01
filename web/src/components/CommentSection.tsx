"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { TimeAgo } from "./TimeAgo";

interface Comment {
  id: string;
  body: string;
  created_at: string;
  profiles: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function CommentSection({ annotationId }: { annotationId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    loadComments();
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const loadComments = async () => {
    const { data } = await supabase
      .from("comments")
      .select(
        "id, body, created_at, profiles(username, display_name, avatar_url)"
      )
      .eq("annotation_id", annotationId)
      .order("created_at", { ascending: true });
    setComments((data as unknown as Comment[]) ?? []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || !userId) return;
    setSubmitting(true);

    await supabase.from("comments").insert({
      annotation_id: annotationId,
      user_id: userId,
      body: body.trim(),
    });

    setBody("");
    setSubmitting(false);
    loadComments();
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-zinc-300">
        Comments ({comments.length})
      </h3>

      {comments.length === 0 && (
        <p className="text-sm text-zinc-600">No comments yet.</p>
      )}

      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            {c.profiles.avatar_url ? (
              <img
                src={c.profiles.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-800 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-zinc-300">
                  {c.profiles.display_name || c.profiles.username}
                </span>
                <span className="text-zinc-600">
                  <TimeAgo date={c.created_at} />
                </span>
              </div>
              <p className="text-sm text-zinc-400 mt-0.5">{c.body}</p>
            </div>
          </div>
        ))}
      </div>

      {userId ? (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment..."
            maxLength={2000}
            className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium transition disabled:opacity-40"
          >
            Post
          </button>
        </form>
      ) : (
        <p className="text-xs text-zinc-600">
          Sign in via the Chrome extension to comment.
        </p>
      )}
    </div>
  );
}
