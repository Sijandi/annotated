import { createServerSupabase } from "@/lib/supabase-server";
import { SourceBadge } from "@/components/SourceBadge";
import { timeAgo } from "@/components/TimeAgo";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const supabase = await createServerSupabase();

  const { data: annotations } = await supabase
    .from("annotations")
    .select(
      "id, slug, source_type, source_title, source_url, source_thumbnail_url, commentary_text, created_at, profiles(username, display_name, avatar_url)"
    )
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Feed</h1>

      {!annotations || annotations.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-lg">No annotations yet.</p>
          <p className="text-sm mt-2">
            Install the Chrome extension and clip something!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {annotations.map((a) => {
            const profile = a.profiles as unknown as {
              username: string;
              display_name: string | null;
              avatar_url: string | null;
            };

            return (
              <Link
                key={a.id}
                href={`/a/${a.slug}`}
                className="block rounded-xl bg-zinc-900 border border-zinc-800 p-5 hover:border-zinc-700 transition space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt=""
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-800" />
                    )}
                    <div>
                      <span className="text-sm font-medium">
                        {profile.display_name || profile.username}
                      </span>
                      <span className="text-xs text-zinc-600 ml-2">
                        {timeAgo(a.created_at)}
                      </span>
                    </div>
                  </div>
                  <SourceBadge type={a.source_type} />
                </div>

                {a.source_title && (
                  <h3 className="text-base font-medium text-zinc-200 line-clamp-2">
                    {a.source_title}
                  </h3>
                )}

                {a.commentary_text && (
                  <p className="text-sm text-zinc-400 line-clamp-3">
                    {a.commentary_text}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
