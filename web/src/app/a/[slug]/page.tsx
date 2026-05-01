import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { SourceBadge } from "@/components/SourceBadge";
import { ClaimForm } from "@/components/ClaimForm";
import { CommentSection } from "@/components/CommentSection";
import { FollowButton } from "@/components/FollowButton";
import { DeleteButton } from "@/components/DeleteButton";
import { ShareButton } from "@/components/ShareButton";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function formatTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default async function AnnotationPage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const { slug } = await props.params;
  const supabase = getSupabase();

  const { data: annotation, error } = await supabase
    .from("annotations")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !annotation) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", annotation.user_id)
    .single();

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Processing state */}
      {annotation.status === "processing" && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400">Processing your clip...</p>
          <p className="text-xs text-zinc-600">
            This usually takes less than a minute. Refresh to check.
          </p>
        </div>
      )}

      {/* Failed state */}
      {annotation.status === "failed" && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-6 text-center space-y-2">
          <p className="text-red-400 font-medium">Processing failed</p>
          {annotation.error_message && (
            <p className="text-sm text-zinc-500">{annotation.error_message}</p>
          )}
        </div>
      )}

      {/* Published state */}
      {annotation.status === "published" && (
        <>
          {annotation.source_type === "youtube" && annotation.media_url && (
            <div className="rounded-xl overflow-hidden bg-black">
              <video
                src={annotation.media_url}
                controls
                className="w-full aspect-video"
                poster={annotation.source_thumbnail_url ?? undefined}
              />
            </div>
          )}

          {annotation.source_type === "podcast" && annotation.media_url && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
              <audio src={annotation.media_url} controls className="w-full" />
            </div>
          )}

          {annotation.source_type === "article" && annotation.clip_text && (
            <blockquote className="border-l-4 border-blue-500 pl-4 py-2 text-lg text-zinc-300 italic bg-zinc-900/50 rounded-r-xl p-6">
              &ldquo;{annotation.clip_text}&rdquo;
            </blockquote>
          )}
        </>
      )}

      {/* Source link */}
      <div className="flex items-center gap-3">
        <SourceBadge type={annotation.source_type} />
        <a
          href={annotation.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-400 hover:text-blue-300 transition truncate"
        >
          {annotation.source_title || annotation.source_url}
          <span className="ml-1">↗</span>
        </a>
      </div>

      {/* Author */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-zinc-800" />
          )}
          <div>
            <p className="text-sm font-medium">
              {profile?.display_name || profile?.username || "Unknown"}
            </p>
            <p className="text-xs text-zinc-500">
              {profile?.username ? `@${profile.username} · ` : ""}
              {formatTimeAgo(annotation.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ShareButton slug={slug} />
          <FollowButton targetUserId={annotation.user_id} />
          <DeleteButton annotationId={annotation.id} annotationUserId={annotation.user_id} />
        </div>
      </div>

      {/* Commentary */}
      {(annotation.commentary_text || annotation.commentary_audio_url) && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">
            Commentary
          </h3>
          {annotation.commentary_text && (
            <p className="text-sm text-zinc-300 leading-relaxed">
              {annotation.commentary_text}
            </p>
          )}
          {annotation.commentary_audio_url && (
            <audio
              src={annotation.commentary_audio_url}
              controls
              className="w-full"
            />
          )}
        </div>
      )}

      {/* Comments */}
      <div className="border-t border-zinc-800 pt-6">
        <CommentSection annotationId={annotation.id} />
      </div>

      {/* Claim button */}
      <ClaimForm annotationId={annotation.id} />
    </div>
  );
}
