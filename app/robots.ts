import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-studio.vercel.app";
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/account/", "/signin", "/onboarding", "/api/"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
