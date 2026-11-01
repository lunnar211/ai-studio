// Original example logos (drawn for this page only — no copied logos).
// Clicking one fills the generator prompt with its concept.
"use client";

const GALLERY: Array<{ title: string; prompt: string; brand: string; svg: string }> = [
  {
    title: "Mountain coffee roaster",
    prompt: "mountain coffee roaster",
    brand: "Summit Roast",
    svg: `<svg viewBox="0 0 512 512" role="img" aria-label="Mountain coffee roaster example logo"><path d="M90 330 L256 110 L422 330 Z" fill="#8B5A2B"/><circle cx="256" cy="170" r="26" fill="#F59E0B"/><rect x="216" y="330" width="80" height="14" rx="7" fill="#3F2D20"/><text x="256" y="420" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="34" fill="#3F2D20">Summit Roast</text></svg>`,
  },
  {
    title: "Tech startup",
    prompt: "minimal geometric tech startup logo",
    brand: "Nexora",
    svg: `<svg viewBox="0 0 512 512" role="img" aria-label="Tech startup example logo"><rect x="150" y="150" width="100" height="100" rx="20" fill="#EC4899"/><circle cx="310" cy="200" r="50" fill="#06B6D4"/><rect x="180" y="280" width="150" height="60" rx="30" fill="#111827"/><text x="256" y="420" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="34" fill="#111827">Nexora</text></svg>`,
  },
  {
    title: "Fitness studio",
    prompt: "bold fitness studio logo",
    brand: "Pulse Fit",
    svg: `<svg viewBox="0 0 512 512" role="img" aria-label="Fitness studio example logo"><path d="M40 260 L140 260 L190 180 L250 340 L300 220 L360 260 L470 260" stroke="#EF4444" stroke-width="28" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="256" y="420" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="34" fill="#111827">Pulse Fit</text></svg>`,
  },
  {
    title: "Bakery",
    prompt: "warm bakery logo with a wheat stalk",
    brand: "Golden Crust",
    svg: `<svg viewBox="0 0 512 512" role="img" aria-label="Bakery example logo"><ellipse cx="256" cy="210" rx="120" ry="70" fill="#F59E0B"/><path d="M256 150 L256 300 M220 190 L292 190 M230 230 L282 230" stroke="#92400E" stroke-width="14" stroke-linecap="round"/><text x="256" y="420" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="32" fill="#92400E">Golden Crust</text></svg>`,
  },
  {
    title: "Pet care",
    prompt: "friendly pet care logo with a paw",
    brand: "PawJoy",
    svg: `<svg viewBox="0 0 512 512" role="img" aria-label="Pet care example logo"><circle cx="256" cy="290" r="70" fill="#EC4899"/><circle cx="170" cy="210" r="32" fill="#EC4899"/><circle cx="256" cy="180" r="32" fill="#EC4899"/><circle cx="342" cy="210" r="32" fill="#EC4899"/><text x="256" y="440" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="34" fill="#111827">PawJoy</text></svg>`,
  },
  {
    title: "Plant shop",
    prompt: "minimal plant shop logo with a leaf",
    brand: "Leaf & Co",
    svg: `<svg viewBox="0 0 512 512" role="img" aria-label="Plant shop example logo"><path d="M256 340 C120 260 150 110 256 90 C362 110 392 260 256 340 Z" fill="#16A34A"/><path d="M256 340 L256 410" stroke="#166534" stroke-width="16" stroke-linecap="round"/><text x="256" y="470" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="34" fill="#166534">Leaf &amp; Co</text></svg>`,
  },
  {
    title: "Photography studio",
    prompt: "modern photography studio logo with a camera",
    brand: "LensLab",
    svg: `<svg viewBox="0 0 512 512" role="img" aria-label="Photography studio example logo"><rect x="110" y="170" width="292" height="190" rx="28" fill="#111827"/><circle cx="256" cy="265" r="62" fill="none" stroke="#F8FAFC" stroke-width="18"/><circle cx="360" cy="205" r="14" fill="#F59E0B"/><text x="256" y="440" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="34" fill="#111827">LensLab</text></svg>`,
  },
  {
    title: "Coffee truck",
    prompt: "retro coffee truck badge logo",
    brand: "Roam Brew",
    svg: `<svg viewBox="0 0 512 512" role="img" aria-label="Coffee truck example logo"><circle cx="256" cy="250" r="150" fill="none" stroke="#92400E" stroke-width="14"/><path d="M176 260 h160 M206 210 h100" stroke="#92400E" stroke-width="18" stroke-linecap="round"/><text x="256" y="440" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="32" fill="#92400E">Roam Brew</text></svg>`,
  },
  {
    title: "Yoga studio",
    prompt: "calm yoga studio logo with a lotus",
    brand: "Still Lotus",
    svg: `<svg viewBox="0 0 512 512" role="img" aria-label="Yoga studio example logo"><path d="M256 330 C170 280 150 180 200 130 C230 180 250 240 256 330 Z" fill="#8B5CF6"/><path d="M256 330 C342 280 362 180 312 130 C282 180 262 240 256 330 Z" fill="#A78BFA"/><ellipse cx="256" cy="350" rx="110" ry="18" fill="#C4B5FD"/><text x="256" y="440" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="32" fill="#4C1D95">Still Lotus</text></svg>`,
  },
];

export default function LogoGallery({ onPick }: { onPick: (prompt: string, brand: string) => void }) {
  return (
    <section aria-label="Example logos" className="mb-10">
      <h2 className="text-lg font-semibold text-gray-900">Examples — click one to try it</h2>
      <p className="mt-1 text-sm text-gray-600">
        Original examples made for this page. Clicking one fills the generator below.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-3 lg:grid-cols-9">
        {GALLERY.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onPick(item.prompt, item.brand)}
            className="group rounded-2xl border border-gray-200 bg-white p-2 shadow-sm transition hover:border-pink-400 hover:shadow focus:outline-none focus:ring-2 focus:ring-pink-500"
            aria-label={`Use example: ${item.title}`}
          >
            <span className="block aspect-square w-full overflow-hidden rounded-xl bg-gray-50 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: item.svg }} />
            <span className="mt-2 block truncate text-center text-xs font-medium text-gray-700">{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
