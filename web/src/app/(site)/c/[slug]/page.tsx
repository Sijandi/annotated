import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { SourceBadge } from "@/components/SourceBadge";
import { FollowButton } from "@/components/FollowButton";
import { timeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = getSupabase();
  const { data } = await supabase
    .from("collections")
    .select("title, description")
    .eq("slug", slug)
    .single();

  if (!data) return { title: "Annotated" };

  return {
    title: `${data.title} — Annotated`,
    description: data.description ?? "A curated collection of clips on Annotated.",
    openGraph: {
      title: data.title,
      description: data.description ?? "A curated collection of clips on Annotated.",
      type: "article",
    },
  };
}

function youtubeThumbnail(sourceUrl: string): string | null {
  const match =
    sourceUrl.match(/[?&]v=([^&]+)/) || sourceUrl.match(/youtu\.be\/([^?]+)/);
  return match?.[1] ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
}

export default async function CollectionPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const supabase = getSupabase();

  const { data: collection, error } = await supabase
    .from("collections")
    .select("id, user_id, title, description, visibility, created_at")
    .eq("slug", slug)
    .single();

  if (error || !collection) notFound();

  const { data: curator } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url, bio")
    .eq("id", collection.user_id)
    .single();

  const { data: items } = await supabase
    .from("collection_items")
    .select("annotation_id, position, note")
    .eq("collection_id", collection.id)
    .order("position", { ascending: true })
    .order("added_at", { ascending: true });

  const annotationIds = (items ?? []).map((i) => i.annotation_id);
  const { data: annotations } = annotationIds.length
    ? await supabase
        .from("annotations")
        .select(
          "id, slug, source_type, source_title, source_url, source_thumbnail_url, commentary_text, clip_text, clip_start_seconds, clip_end_seconds"
        )
        .in("id", annotationIds)
        .eq("status", "published")
    : { data: [] };

  const annotationMap = new Map((annotations ?? []).map((a) => [a.id, a]));
  // Preserve curator ordering; drop items whose annotation is not published
  const orderedItems = (items ?? []).filter((i) => annotationMap.has(i.annotation_id));

  const curatorName =
    curator?.display_name || curator?.username || "Your coach";

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Collection header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-widest text-zinc-600">
            A collection from {curatorName}
          </p>
          {collection.visibility === "unlisted" && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5">
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Unlisted
            </span>
          )}
        </div>
        <h1 className="text-4xl font-bold tracking-tight font-[family-name:var(--font-serif)] italic">
          {collection.title}
        </h1>
        {collection.description && (
          <p className="text-zinc-400 leading-relaxed max-w-xl">
            {collection.description}
          </p>
        )}
      </div>

      {/* Curator card */}
      <div className="flex items-center justify-between rounded-xl bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex items-center gap-3 min-w-0">
          {curator?.avatar_url ? (
            <img
              src={curator.avatar_url}
              alt=""
              className="w-11 h-11 rounded-full shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-zinc-800 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{curatorName}</p>
            <p className="text-xs text-zinc-500 truncate">
              {curator?.username ? `@${curator.username}` : ""}
              {curator?.bio ? ` · ${curator.bio}` : ""}
            </p>
          </div>
        </div>
        <FollowButton targetUserId={collection.user_id} />
      </div>

      {/* Ordered clips */}
      {orderedItems.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p>Nothing here yet.</p>
          <p className="text-sm mt-1">
            {curatorName} hasn&apos;t added any clips to this collection.
          </p>
        </div>
      ) : (
        <ol className="space-y-5">
          {orderedItems.map((item, idx) => {
            const a = annotationMap.get(item.annotation_id)!;
            const thumbnailUrl =
              a.source_type === "youtube"
                ? youtubeThumbnail(a.source_url)
                : a.source_thumbnail_url;
            const clipDuration =
              a.clip_start_seconds != null && a.clip_end_seconds != null
                ? Math.floor(a.clip_end_seconds - a.clip_start_seconds)
                : null;

            return (
              <li key={item.annotation_id}>
                <Link
                  href={`/a/${a.slug}`}
                  className="block rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 overflow-hidden transition"
                >
                  <div className="flex gap-4 p-4">
                    <span className="text-sm font-mono text-zinc-600 pt-1 shrink-0 w-6">
                      {String(idx + 1).padStart(2, "0")}
                    </span>

                    {thumbnailUrl && (
                      <div className="relative shrink-0 hidden sm:block">
                        <img
                          src={thumbnailUrl}
                          alt=""
                          className="w-36 aspect-video object-cover rounded-lg"
                        />
                        {clipDuration && (
                          <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                            {Math.floor(clipDuration / 60)}:
                            {(clipDuration % 60).toString().padStart(2, "0")}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <SourceBadge type={a.source_type} />
                        {clipDuration && !thumbnailUrl && (
                          <span className="text-[10px] font-mono text-zinc-600">
                            {Math.floor(clipDuration / 60)}:
                            {(clipDuration % 60).toString().padStart(2, "0")}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-medium text-zinc-200 line-clamp-2">
                        {a.source_title || a.clip_text || a.source_url}
                      </h3>
                      {a.commentary_text && (
                        <p className="text-xs text-zinc-500 line-clamp-1">
                          {a.commentary_text}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* The curator's guidance — the reason this clip is here */}
                  {item.note && (
                    <div className="border-t border-zinc-800/70 bg-zinc-950/40 px-4 py-3">
                      <p className="text-sm text-zinc-300 leading-relaxed">
                        <span className="text-zinc-500">
                          {curatorName}:&nbsp;
                        </span>
                        {item.note}
                      </p>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {/* Footer */}
      <p className="text-center text-xs text-zinc-600 pt-4">
        Curated {timeAgo(collection.created_at)} on{" "}
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 transition">
          Annotated
        </Link>
      </p>
    </div>
  );
}
