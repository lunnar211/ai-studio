import type { MetadataRoute } from "next";

// Public pages only. /admin, /account, /signin and /onboarding are never
// listed (they also carry robots noindex + X-Robots-Tag).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-studio-sandy-sigma.vercel.app";
  const pages = ["", "/logo-generator", "/photo-enhancer", "/pricing", "/faq", "/logo-for-coffee-shop", "/logo-for-tech-startup", "/logo-for-fitness-studio", "/colorize-black-and-white-photo", "/restore-old-photos", "/photo-upscaler", "/ai-logo-maker", "/about", "/contact", "/privacy", "/terms", "/cookies", "/refund-policy", "/acceptable-use", "/dmca", "/disclaimer"];
  return pages.map((p) => ({ url: `${base}${p}`, lastModified: new Date(), changeFrequency: "monthly", priority: p === "" ? 1 : 0.8 }));
}
