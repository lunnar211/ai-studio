"use client";
import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="font-display text-4xl font-bold italic">Something went wrong</h1>
      <p className="mt-3 text-muted-fg dark:text-slate-300">
        The page hit an unexpected error. Your files were not changed. Try again, or go back to a tool.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand bg-brand px-4 font-semibold text-white">
          Try again
        </button>
        <Link href="/" className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-line px-4 font-semibold">
          Home
        </Link>
      </div>
    </div>
  );
}
