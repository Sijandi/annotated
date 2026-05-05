import Link from "next/link";
import { AuthButton } from "./AuthButton";

export function Header() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold tracking-tight font-[family-name:var(--font-serif)] italic">
            Annotated
          </Link>
          <Link
            href="/feed"
            className="text-sm text-zinc-400 hover:text-zinc-100 transition"
          >
            Feed
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <AuthButton />
          <a
            href="/#install"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-medium transition"
          >
            Add to Chrome
          </a>
        </div>
      </div>
    </header>
  );
}
