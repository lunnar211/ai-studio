import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="font-display text-4xl font-bold italic">Page not found</h1>
      <p className="mt-3 text-muted-fg dark:text-slate-300">
        That page does not exist or moved. The tools are still right here:
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/logo-generator" className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-brand-dark bg-brand-dark px-4 font-semibold text-white">
          Logo Generator
        </Link>
        <Link href="/photo-enhancer" className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-line px-4 font-semibold">
          Photo Enhancer
        </Link>
        <Link href="/" className="inline-flex min-h-[44px] items-center rounded-[3px] border-2 border-line px-4 font-semibold">
          Home
        </Link>
      </div>
    </div>
  );
}
