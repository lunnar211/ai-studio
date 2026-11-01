"use client";
import Link from "next/link";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-4xl font-bold">Something went wrong</h1>
          <p className="mt-3 text-slate-600">The site hit an unexpected error. Please try again.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={reset} className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-black bg-black px-4 font-semibold text-white">
              Try again
            </button>
            <Link href="/" className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-black px-4 font-semibold">
              Home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
