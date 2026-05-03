"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SourceBadge } from "./SourceBadge";
import { LikeButton } from "./LikeButton";
import { timeAgo } from "@/lib/time";

interface Annotation {
  id: string;
  slug: string;
  source_type: string;
  source_title: string | null;
  source_url: string;
  source_thumbnail_url: string | null;
  commentary_text: string | null;
  clip_text: string | null;
  created_at: string;
  user_id: string;
  clip_start_seconds: number | null;
  clip_end_seconds: number | null;
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | undefined;
  likeCount: number;
  commentCount: number;
}

type SortMode = "recent" | "trending";
type ContentFilter = "all" | "youtube" | "article" | "podcast";

export function FeedClient({ annotations }: { annotations: Annotation[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [filter, setFilter] = useState<ContentFilter>("all");

  const filtered = useMemo(() => {
    let list = annotations;

    if (filter !== "all") {
      list = list.filter(a => a.source_type === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (a.source_title?.toLowerCase().includes(q)) ||
        (a.commentary_text?.toLowerCase().includes(q)) ||
        (a.clip_text?.toLowerCase().includes(q)) ||
        (a.profile?.username.toLowerCase().includes(q)) ||
        (a.profile?.display_name?.toLowerCase().includes(q))
      );
    }

    if (sort === "trending") {
      list = [...list].sort((a, b) => (b.likeCount + b.commentCount) - (a.likeCount + a.commentCount));
    }

    return list;
  }, [annotations, search, sort, filter]);

  const counts = useMemo(() => ({
    all: annotations.length,
    youtube: annotations.filter(a => a.source_type === "youtube").length,
    article: annotations.filter(a => a.source_type === "article").length,
    podcast: annotations.filter(a => a.source_type === "podcast").length,
  }), [annotations]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold font-[family-name:var(--font-serif)] italic">Feed</h1>
        <span className="text-sm text-zinc-500">{filtered.length} annotations</span>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search annotations..."
        className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
      />

      {/* Sort tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSort("recent")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
            sort === "recent" ? "bg-violet-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Recent
        </button>
        <button
          onClick={() => setSort("trending")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
            sort === "trending" ? "bg-violet-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Trending
        </button>
      </div>

      {/* Content type filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "youtube", "article", "podcast"] as ContentFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filter === f ? "bg-zinc-700 text-zinc-100" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {f === "all" ? "All content" : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1 text-zinc-600">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-lg">No annotations found.</p>
          {search && <p className="text-sm mt-2">Try a different search term.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(a => {
            const profile = a.profile;
            const isYoutube = a.source_type === "youtube";
            const videoId = isYoutube ? (a.source_url.match(/[?&]v=([^&]+)/) || a.source_url.match(/youtu\.be\/([^?]+)/))?.[1] : null;
            const thumbnailUrl = videoId
              ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
              : a.source_thumbnail_url;
            const clipDuration = a.clip_start_seconds != null && a.clip_end_seconds != null
              ? Math.floor(a.clip_end_seconds - a.clip_start_seconds)
              : null;

            return (
              <Link
                key={a.id}
                href={`/a/${a.slug}`}
                className="block rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden hover:border-zinc-700 transition"
              >
                {/* Thumbnail for video/podcast */}
                {thumbnailUrl && (
                  <div className="relative">
                    <img src={thumbnailUrl} alt="" className="w-full aspect-video object-cover" />
                    {clipDuration && (
                      <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                        {Math.floor(clipDuration / 60)}:{(clipDuration % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>
                )}

                {/* Article text preview */}
                {a.source_type === "article" && a.clip_text && !thumbnailUrl && (
                  <div className="px-5 pt-5">
                    <blockquote className="border-l-2 border-violet-500 pl-3 text-sm text-zinc-300 italic line-clamp-3">
                      &ldquo;{a.clip_text}&rdquo;
                    </blockquote>
                  </div>
                )}

                <div className="p-5 space-y-3">
                  {/* Author row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-zinc-800" />
                      )}
                      <span className="text-xs text-zinc-400">
                        {profile?.display_name || profile?.username || "Unknown"}
                      </span>
                      <span className="text-xs text-zinc-600">{timeAgo(a.created_at)}</span>
                    </div>
                    <SourceBadge type={a.source_type} />
                  </div>

                  {/* Title */}
                  {a.source_title && (
                    <h3 className="text-base font-medium text-zinc-200 line-clamp-2">
                      {a.source_title}
                    </h3>
                  )}

                  {/* Commentary preview */}
                  {a.commentary_text && (
                    <p className="text-sm text-zinc-400 line-clamp-2">{a.commentary_text}</p>
                  )}

                  {/* Actions row */}
                  <div className="flex items-center gap-4 pt-1">
                    <LikeButton annotationId={a.id} initialCount={a.likeCount} />
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      {a.commentCount}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
