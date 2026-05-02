"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

export function LikeButton({ annotationId, initialCount = 0 }: { annotationId: string; initialCount?: number }) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        supabase
          .from("likes")
          .select("user_id")
          .match({ user_id: uid, annotation_id: annotationId })
          .then(({ data: likes }) => {
            setLiked((likes?.length ?? 0) > 0);
          });
      }
    });
  }, [annotationId]);

  const toggle = async () => {
    if (!userId) return;
    if (liked) {
      await supabase.from("likes").delete().match({ user_id: userId, annotation_id: annotationId });
      setLiked(false);
      setCount(c => Math.max(0, c - 1));
    } else {
      await supabase.from("likes").insert({ user_id: userId, annotation_id: annotationId });
      setLiked(true);
      setCount(c => c + 1);
    }
  };

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
      className={`flex items-center gap-1 text-xs transition ${liked ? 'text-red-400' : 'text-zinc-500 hover:text-red-400'}`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {count}
    </button>
  );
}
