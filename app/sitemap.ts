import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-studio.vercel.app";
  const pages = ["", "/logo-generator", "/photo-enhancer", "/about", "/contact", "/privacy", "/terms", "/disclaimer"];
  return pages.map((p) => ({ url: `${base}${p}`, lastModified: new Date(), changeFrequency: "monthly", priority: p === "" ? 1 : 0.8 }));
}
