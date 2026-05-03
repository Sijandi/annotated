import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight font-[family-name:var(--font-serif)] italic">
          Annotated
        </h1>
        <p className="text-lg text-zinc-400 max-w-lg mx-auto leading-relaxed">
          Clip any moment from YouTube, articles, or podcasts. Add your take. Every annotation gets its own shareable page — always linked to the source.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-lg mx-auto">
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-2xl mb-2">✂️</div>
            <h3 className="text-sm font-medium mb-1">Clip in the Sidebar</h3>
            <p className="text-xs text-zinc-500">
              Set start and end on any video or highlight text. Max 90 seconds, downscaled to 240p. Fair-use first.
            </p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-2xl mb-2">🎙️</div>
            <h3 className="text-sm font-medium mb-1">Record Your Take</h3>
            <p className="text-xs text-zinc-500">
              Text or audio commentary. React to what you clipped, in your own voice or words.
            </p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="text-2xl mb-2">🔗</div>
            <h3 className="text-sm font-medium mb-1">Share & Source</h3>
            <p className="text-xs text-zinc-500">
              Every clip links back to the original. Public feed. Follow people. File a claim if it's yours.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-6 max-w-lg mx-auto text-left space-y-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">How it works</p>
          <ol className="text-sm text-zinc-400 space-y-2">
            <li className="flex gap-3"><span className="text-zinc-600 font-mono">1.</span> Install the Chrome extension and sign in with X or Google</li>
            <li className="flex gap-3"><span className="text-zinc-600 font-mono">2.</span> Open the sidebar on any page — it detects what's clippable</li>
            <li className="flex gap-3"><span className="text-zinc-600 font-mono">3.</span> Set your clip, add commentary, hit publish</li>
            <li className="flex gap-3"><span className="text-zinc-600 font-mono">4.</span> Your annotation gets a landing page — share it anywhere</li>
          </ol>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#install"
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

        <div id="install" className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 max-w-lg mx-auto text-left space-y-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Install the extension</p>
          <a
            href="https://github.com/Sijandi/annotated/releases/latest/download/annotated-extension.zip"
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-3 text-sm font-medium transition"
          >
            Add to Chrome — it's free
          </a>
          <ol className="text-sm text-zinc-400 space-y-2">
            <li className="flex gap-3"><span className="text-zinc-600 font-mono">1.</span>
              <span>Download and <span className="text-zinc-200">unzip</span> the file above</span>
            </li>
            <li className="flex gap-3"><span className="text-zinc-600 font-mono">2.</span>
              <span>Open <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">chrome://extensions</code> → enable <span className="text-zinc-200">Developer mode</span></span>
            </li>
            <li className="flex gap-3"><span className="text-zinc-600 font-mono">3.</span>
              <span>Click <span className="text-zinc-200">Load unpacked</span> → select the unzipped <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">dist</code> folder</span>
            </li>
            <li className="flex gap-3"><span className="text-zinc-600 font-mono">4.</span>
              <span>Click the Annotated icon → sidebar opens</span>
            </li>
          </ol>
          <a
            href="https://github.com/Sijandi/annotated"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-violet-400 hover:text-violet-300 transition mt-2"
          >
            View source on GitHub →
          </a>
        </div>

      </div>
    </div>
  );
}
