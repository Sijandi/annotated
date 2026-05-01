const STYLES: Record<string, string> = {
  youtube: "bg-red-500/20 text-red-400",
  article: "bg-blue-500/20 text-blue-400",
  podcast: "bg-purple-500/20 text-purple-400",
};

export function SourceBadge({ type }: { type: string }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        STYLES[type] ?? "bg-zinc-700 text-zinc-400"
      }`}
    >
      {type}
    </span>
  );
}
