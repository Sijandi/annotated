"use client";

import { useState } from "react";

export function EmbedButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");

  const handleOpen = () => {
    setCode(
      `<iframe src="${window.location.origin}/embed/${slug}" width="560" height="340" style="border:0;border-radius:12px;overflow:hidden" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Annotated clip"></iframe>`
    );
    setOpen(true);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="text-xs px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition"
      >
        Embed
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Embed this clip</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-zinc-500 hover:text-zinc-300 text-xl"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-zinc-400">
          Paste this anywhere that accepts HTML. The player links back to the
          source and this annotation.
        </p>

        <textarea
          readOnly
          rows={5}
          value={code}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs font-mono text-zinc-300 resize-none focus:outline-none focus:border-zinc-500"
        />

        <button
          onClick={handleCopy}
          className="w-full rounded-lg bg-zinc-100 text-zinc-900 px-4 py-2.5 text-sm font-medium hover:bg-white transition"
        >
          {copied ? "Copied!" : "Copy embed code"}
        </button>
      </div>
    </div>
  );
}
