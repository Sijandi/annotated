import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight">
          Annotated
        </h1>
        <p className="text-xl text-zinc-400 max-w-lg mx-auto">
          Clip and annotate media from anywhere on the web. Share your takes. Join the conversation.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-lg mx-auto">
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-2xl mb-2">✂️</div>
            <h3 className="text-sm font-medium mb-1">Clip Media</h3>
            <p className="text-xs text-zinc-500">
              YouTube, articles, podcasts. Up to 90 seconds, fair-use friendly.
            </p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-2xl mb-2">🎙️</div>
            <h3 className="text-sm font-medium mb-1">Add Commentary</h3>
            <p className="text-xs text-zinc-500">
              Text or recorded audio. Your take on what matters.
            </p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-2xl mb-2">🌐</div>
            <h3 className="text-sm font-medium mb-1">Share & Discuss</h3>
            <p className="text-xs text-zinc-500">
              Public feed. Follow annotators. Comment on theirs.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/Sijandi/annotated"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-zinc-100 text-zinc-900 px-6 py-3 font-medium hover:bg-white transition"
          >
            Get the Chrome Extension
          </a>
          <Link
            href="/feed"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition"
          >
            Browse the feed →
          </Link>
        </div>
      </div>
    </div>
  );
}
