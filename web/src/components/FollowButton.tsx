"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

export function FollowButton({ targetUserId }: { targetUserId: string }) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid || uid === targetUserId) {
        setLoading(false);
        return;
      }
      supabase
        .from("follows")
        .select("follower_id")
        .match({ follower_id: uid, followed_id: targetUserId })
        .then(({ data: follows }) => {
          setIsFollowing((follows?.length ?? 0) > 0);
          setLoading(false);
        });
    });
  }, [targetUserId]);

  const toggle = async () => {
    if (!userId) return;
    setLoading(true);
    if (isFollowing) {
      await supabase
        .from("follows")
        .delete()
        .match({ follower_id: userId, followed_id: targetUserId });
      setIsFollowing(false);
    } else {
      await supabase
        .from("follows")
        .insert({ follower_id: userId, followed_id: targetUserId });
      setIsFollowing(true);
    }
    setLoading(false);
  };

  // Don't show for own profile or if not logged in
  if (!userId || userId === targetUserId || loading) return null;

  return (
    <button
      onClick={toggle}
      className={`text-xs px-3 py-1 rounded-full font-medium transition ${
        isFollowing
          ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          : "bg-blue-600 text-white hover:bg-blue-500"
      }`}
    >
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
