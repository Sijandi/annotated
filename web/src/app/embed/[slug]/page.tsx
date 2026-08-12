import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { SourceBadge } from "@/components/SourceBadge";

export const dynamic = "force-dynamic";

// Chrome-less iframe-able clip player. This route sits outside the (site)
// route group so it renders without the Header; framing headers are set in
// next.config.ts (frame-ancestors *, X-Robots-Tag: noindex).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default async function EmbedPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const supabase = getSupabase();

  const { data: annotation, error } = await supabase
    .from("annotations")
    .select(
      "id, slug, status, source_type, source_title, source_url, media_url, clip_text, clip_start_seconds, clip_end_seconds"
    )
    .eq("slug", slug)
    .single();

  if (error || !annotation || annotation.status !== "published") notFound();

  const videoId =
    annotation.source_type === "youtube"
      ? (annotation.source_url.match(/[?&]v=([^&]+)/) ||
          annotation.source_url.match(/youtu\.be\/([^?]+)/))?.[1]
      : null;

  return (
    <div className="flex flex-col h-dvh p-3 gap-2.5">
      {/* Media */}
      <div className="flex-1 min-h-0">
        {annotation.source_type === "youtube" && videoId && (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(
              annotation.clip_start_seconds || 0
            )}&end=${Math.floor(
              annotation.clip_end_seconds || 0
            )}&autoplay=0&rel=0`}
            className="w-full h-full rounded-lg bg-black"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}

        {annotation.source_type === "podcast" && annotation.media_url && (
          <div className="h-full flex items-center rounded-lg bg-zinc-900 border border-zinc-800 px-4">
            <audio src={annotation.media_url} controls className="w-full" />
          </div>
        )}

        {annotation.source_type === "article" && annotation.clip_text && (
          <blockquote className="h-full overflow-y-auto border-l-4 border-zinc-500 pl-4 py-2 text-zinc-300 italic bg-zinc-900/50 rounded-r-lg p-4">
            &ldquo;{annotation.clip_text}&rdquo;
          </blockquote>
        )}
      </div>

      {/* Title + source + wordmark */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <SourceBadge type={annotation.source_type} />
          <a
            href={annotation.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-zinc-200 transition truncate"
          >
            {annotation.source_title || annotation.source_url}
            <span className="ml-1">↗</span>
          </a>
        </div>
        <a
          href={`/a/${annotation.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-bold tracking-tight font-[family-name:var(--font-serif)] italic text-zinc-400 hover:text-zinc-100 transition shrink-0"
        >
          annotated
        </a>
      </div>
    </div>
  );
}
