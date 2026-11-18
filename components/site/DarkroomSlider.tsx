// Live before/after darkroom for the homepage hero.
//
// The portrait is a real 19th-century public-domain photograph from the
// gallery. The "after" side is the same file run through the standard
// sharpening pipeline the free photo route uses (sharpen + normalise) —
// NOT an AI result, and labelled as such below the slider. Dragging is
// the only motion on the homepage: no scroll-reveal, no page-load
// choreography.
"use client";

import { useState } from "react";
import Image from "next/image";

export function DarkroomSlider() {
  const [pos, setPos] = useState(50);
  return (
    <figure className="mt-6 border-2 border-line bg-white dark:bg-slate-900">
      <div className="relative aspect-[2/3] w-full overflow-hidden sm:aspect-[16/10]">
        {/* After (enhanced) underneath, full frame. */}
        <Image
          src="/gallery/man-19th-century-enhanced.jpg"
          alt=""
          aria-hidden="true"
          fill
          sizes="(max-width: 640px) 100vw, 800px"
          className="object-cover object-top"
          priority
        />
        {/* Before (original) on top, clipped to the left of the slider. */}
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }} aria-hidden="true">
          <Image
            src="/gallery/man-19th-century.jpg"
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 800px"
            className="object-cover object-top"
            style={{ width: `${100 / Math.max(pos, 1) * 100}%`, maxWidth: "none" }}
            priority
          />
        </div>
        <div className="absolute inset-y-0 w-[3px] bg-brand" style={{ left: `${pos}%` }} aria-hidden="true" />
        <span className="absolute left-3 top-3 rounded-[3px] border-2 border-line bg-white px-2 py-1 text-base font-semibold dark:bg-slate-900">
          Before — original, 19th century
        </span>
        <span className="absolute right-3 top-3 rounded-[3px] border-2 border-line bg-white px-2 py-1 text-base font-semibold dark:bg-slate-900">
          After — sharpened
        </span>
      </div>
      <figcaption className="p-4">
        <label htmlFor="darkroom-slider" className="font-semibold">
          Drag to compare the original with the sharpened version
        </label>
        <input
          id="darkroom-slider"
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          className="mt-3 w-full accent-pink-500"
          aria-label="Comparison slider: left shows the original photo, right shows the sharpened photo"
        />
        <p className="mt-2 text-muted-fg dark:text-slate-300">
          A real 19th-century studio portrait, public domain via Wikimedia Commons. The
          sharpened side is what the free photo enhancer does today — standard sharpening,
          labelled honestly, not AI upscaling. Colorize and restore are not set up yet; the
          photo enhancer shows their live status.
        </p>
      </figcaption>
    </figure>
  );
}
