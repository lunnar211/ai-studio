// Pure CSS/SVG mockups of a logo: business card, T-shirt, app icon.
// No external images — the SVG is rendered inline in each mockup.
"use client";

export default function MockupPreview({ svg, brand }: { svg: string; brand: string }) {
  const art = (
    <span className="block h-full w-full overflow-hidden [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
  );
  return (
    <section aria-label="Logo mockup preview" className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">See it in the real world</h3>
      <p className="mt-1 text-xs text-gray-600">How {brand || "your logo"} could look on a card, a shirt, and an app icon.</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <div className="flex aspect-[1.75] items-center justify-center rounded-lg border border-gray-200 bg-white p-3 shadow">
            <div className="h-full w-full max-w-[140px]">{art}</div>
          </div>
          <p className="mt-1 text-center text-xs text-gray-600">Business card</p>
        </div>
        <div>
          <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-900 p-6 shadow">
            <div className="h-full w-full max-w-[120px] rounded-full bg-white p-3">{art}</div>
          </div>
          <p className="mt-1 text-center text-xs text-gray-600">T-shirt</p>
        </div>
        <div>
          <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-100 p-6">
            <div className="h-full w-full max-w-[110px] rounded-[22%] border border-gray-200 bg-white p-2 shadow">{art}</div>
          </div>
          <p className="mt-1 text-center text-xs text-gray-600">App icon</p>
        </div>
      </div>
    </section>
  );
}
