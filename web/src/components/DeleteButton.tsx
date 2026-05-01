"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export function DeleteButton({ annotationId, annotationUserId }: { annotationId: string; annotationUserId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  if (!userId || userId !== annotationUserId) return null;

  const handleDelete = async () => {
    setDeleting(true);
    await supabase.from("annotations").delete().eq("id", annotationId);
    router.push("/feed");
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs px-3 py-1 rounded-full bg-red-600 text-white hover:bg-red-500 transition"
        >
          {deleting ? "Deleting..." : "Confirm Delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-zinc-600 hover:text-red-400 transition"
    >
      Delete
    </button>
  );
}
