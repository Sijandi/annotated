"use client";

import { useState } from "react";

interface Endorsement {
  display_name: string | null;
  message: string | null;
}

// Trust signal shown when the original creator has endorsed an annotation.
// `compact` renders the inline feed-card variant; the default renders the
// expandable annotation-page variant (click to reveal the creator's message).
export function EndorsementBadge({
  endorsement,
  compact = false,
}: {
  endorsement: Endorsement;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const name = endorsement.display_name || "the creator";

  const check = (
    <svg
      className="w-3.5 h-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2l2.4 2.4 3.4-.5.6 3.3 3 1.6-1.5 3.2 1.5 3.2-3 1.6-.6 3.3-3.4-.5L12 22l-2.4-2.4-3.4.5-.6-3.3-3-1.6L4.1 12 2.6 8.8l3-1.6.6-3.3 3.4.5z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );

  if (compact) {
    return (
      <span
        title={endorsement.message ?? undefined}
        className="inline-flex items-center gap-1.5 text-xs text-emerald-400/90"
      >
        {check}
        <span className="truncate">Endorsed by {name}</span>
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3">
      <button
        onClick={() => endorsement.message && setExpanded((e) => !e)}
        className={`flex items-center gap-2 text-sm text-emerald-400/90 ${
          endorsement.message ? "cursor-pointer" : "cursor-default"
        }`}
      >
        {check}
        <span className="font-medium">Endorsed by {name}</span>
        {endorsement.message && (
          <span className="text-xs text-emerald-500/60">
            {expanded ? "hide note" : "read note"}
          </span>
        )}
      </button>
      {expanded && endorsement.message && (
        <p className="mt-2 pl-[22px] text-sm text-zinc-400 leading-relaxed">
          &ldquo;{endorsement.message}&rdquo;
        </p>
      )}
    </div>
  );
}
