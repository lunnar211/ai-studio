import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { GatedAnalytics } from "@/components/site/GatedAnalytics";
import "./globals.css";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { CookieBanner } from "@/components/site/CookieBanner";
import { AnnouncementBanner } from "@/components/site/AnnouncementBanner";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://ai-studio-sandy-sigma.vercel.app"),
  title: { default: "AI Studio — Free AI Logo Generator and Photo Enhancer", template: "%s | AI Studio" },
  description: "Free AI tools: generate an original logo from a description, and enhance your photos. No account needed for the free tier.",
  openGraph: {
    type: "website",
    siteName: "AI Studio",
    title: "AI Studio — Free AI Logo Generator and Photo Enhancer",
    description: "Generate an original logo from a description, and enhance your photos. Free tier, no account needed.",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "AI Studio — Free AI Logo Generator and Photo Enhancer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Studio — Free AI Logo Generator and Photo Enhancer",
    description: "Generate an original logo from a description, and enhance your photos. Free tier, no account needed.",
    images: ["/og.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:font-semibold">
            Skip to main content
          </a>
          <Header />
          <AnnouncementBanner />
          <main id="main" className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <Footer />
          <CookieBanner />
          <GatedAnalytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
