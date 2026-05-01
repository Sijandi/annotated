import Link from "next/link";
import { AuthButton } from "./AuthButton";

export function Header() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Annotated
          </Link>
          <Link
            href="/feed"
            className="text-sm text-zinc-400 hover:text-zinc-100 transition"
          >
            Feed
          </Link>
        </div>
        <AuthButton />
      </div>
    </header>
  );
}
