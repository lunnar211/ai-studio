// Pure CSS/SVG mockups of a logo: business card, T-shirt, app icon.
// No external images — the SVG is rendered inline in each mockup.
"use client";

export default function MockupPreview({ svg, brand }: { svg: string; brand: string }) {
  const art = (
    <span className="block h-full w-full overflow-hidden [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
  );
  return (
    <section aria-label="Logo mockup preview" className="mt-6 rounded-[3px] border-2 border-line bg-white p-4 dark:bg-slate-900">
      <h3 className="font-semibold">See it in the real world</h3>
      <p className="mt-1 text-muted-fg dark:text-slate-300">How {brand || "your logo"} could look on a card, a shirt, and an app icon.</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <div className="flex aspect-[1.75] items-center justify-center rounded-[3px] border-2 border-line bg-white p-3 dark:bg-slate-900">
            <div className="h-full w-full max-w-[140px]">{art}</div>
          </div>
          <p className="mt-1 text-center text-muted-fg dark:text-slate-300">Business card</p>
        </div>
        <div>
          <div className="flex aspect-square items-center justify-center rounded-[3px] bg-brand-dark p-6">
            <div className="h-full w-full max-w-[120px] rounded-[3px] bg-white p-3">{art}</div>
          </div>
          <p className="mt-1 text-center text-muted-fg dark:text-slate-300">T-shirt</p>
        </div>
        <div>
          <div className="flex aspect-square items-center justify-center rounded-[3px] bg-cream p-6 dark:bg-slate-800">
            <div className="h-full w-full max-w-[110px] rounded-[3px] border-2 border-line bg-white p-2 dark:bg-slate-900">{art}</div>
          </div>
          <p className="mt-1 text-center text-muted-fg dark:text-slate-300">App icon</p>
        </div>
      </div>
    </section>
  );
}
