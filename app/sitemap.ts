import type { MetadataRoute } from "next";

// Public pages only. /admin, /account, /signin and /onboarding are never
// listed (they also carry robots noindex + X-Robots-Tag).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-studio.vercel.app";
  const pages = ["", "/logo-generator", "/photo-enhancer", "/about", "/contact", "/privacy", "/terms", "/cookies", "/refund-policy", "/acceptable-use", "/dmca", "/disclaimer"];
  return pages.map((p) => ({ url: `${base}${p}`, lastModified: new Date(), changeFrequency: "monthly", priority: p === "" ? 1 : 0.8 }));
}
