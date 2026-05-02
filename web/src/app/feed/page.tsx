import { createClient } from "@supabase/supabase-js";
import { SourceBadge } from "@/components/SourceBadge";
import { timeAgo } from "@/lib/time";
import Link from "next/link";
import { FeedClient } from "@/components/FeedClient";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default async function FeedPage() {
  const supabase = getSupabase();

  const { data: annotations } = await supabase
    .from("annotations")
    .select("id, slug, source_type, source_title, source_url, source_thumbnail_url, commentary_text, clip_text, created_at, user_id, clip_start_seconds, clip_end_seconds")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);

  const userIds = [...new Set((annotations ?? []).map((a) => a.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Get like counts
  const annotationIds = (annotations ?? []).map(a => a.id);
  const { data: likeCounts } = annotationIds.length
    ? await supabase
        .from("likes")
        .select("annotation_id")
        .in("annotation_id", annotationIds)
    : { data: [] };

  const likeMap = new Map<string, number>();
  (likeCounts ?? []).forEach(l => {
    likeMap.set(l.annotation_id, (likeMap.get(l.annotation_id) ?? 0) + 1);
  });

  // Get comment counts
  const { data: commentCounts } = annotationIds.length
    ? await supabase
        .from("comments")
        .select("annotation_id")
        .in("annotation_id", annotationIds)
    : { data: [] };

  const commentMap = new Map<string, number>();
  (commentCounts ?? []).forEach(c => {
    commentMap.set(c.annotation_id, (commentMap.get(c.annotation_id) ?? 0) + 1);
  });

  const enriched = (annotations ?? []).map(a => ({
    ...a,
    profile: profileMap.get(a.user_id),
    likeCount: likeMap.get(a.id) ?? 0,
    commentCount: commentMap.get(a.id) ?? 0,
  }));

  return <FeedClient annotations={enriched} />;
}
