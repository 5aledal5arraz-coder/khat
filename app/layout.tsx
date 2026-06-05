import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import "./globals.css"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { MobileNav } from "@/components/layout/mobile-nav"
import { ViewportFix } from "@/components/layout/viewport-fix"
import { Toaster } from "@/components/ui/toaster"
import { ScrollToTop } from "@/components/ui/scroll-to-top"
import { getThemeConfig } from "@/lib/theme"
import { ThemeSync } from "@/components/theme/theme-sync"
import { fetchAllEpisodes } from "@/lib/youtube/queries"

export const metadata: Metadata = {
  metadataBase: new URL("https://khatpodcast.com"),
  title: {
    default: "خط | بودكاست",
    template: "%s | خط",
  },
  description: "بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.",
  keywords: ["بودكاست", "خط", "حوارات", "قصص", "عربي"],
  authors: [{ name: "خط" }],
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName: "خط",
    url: "https://khatpodcast.com",
    images: [{ url: "/logo-wide.jpg", width: 2560, height: 424, alt: "بودكاست خط" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "خط | بودكاست",
    description: "بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.",
    images: ["/logo-wide.jpg"],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Phase 2 — admin chrome isolation. Detect admin paths from the
  // `x-pathname` request header set in middleware. Admin pages must NOT
  // mount the public-site Header / Footer / MobileNav (they have their
  // own chrome in `app/admin/layout.tsx`). For admin paths we also skip
  // the public-episodes fetch — it's only used to drive the "new episode"
  // badge in the public Header / MobileNav, which admin never renders.
  const hdrs = await headers()
  const pathname = hdrs.get("x-pathname") ?? ""
  const isAdminRoute = pathname.startsWith("/admin")

  const [{ mode }, episodes] = await Promise.all([
    getThemeConfig(),
    isAdminRoute ? Promise.resolve([]) : fetchAllEpisodes().catch(() => []),
  ])

  // Check if there's an episode published in the last 48 hours
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 48)
  const hasNewEpisode = episodes.some((ep) =>
    ep.release_date ? new Date(ep.release_date) >= cutoff : false
  )

  return (
    <html
      lang="ar"
      dir="rtl"
      data-theme-mode={mode}
      className={mode === "dark" ? "dark" : ""}
      suppressHydrationWarning
    >
      <head>
        {/* Fonts loaded via Google Fonts <link> in the root layout <head> (App Router equivalent of _document.js):
            IBM Plex Sans Arabic (body, drives --font-ibm-plex-arabic), Amiri (headlines), Playfair Display (accent).
            Loaded as a stylesheet rather than next/font/google so the build never depends on a build-time font fetch. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router root layout <head> is the correct location; rule is a Pages Router false positive */}
        <link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem("khat_theme");var m=s||document.documentElement.getAttribute("data-theme-mode");if(s)document.documentElement.setAttribute("data-theme-mode",s);if(m==="dark")document.documentElement.classList.add("dark");else if(m==="light")document.documentElement.classList.remove("dark");else if(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark");else document.documentElement.classList.remove("dark")})()`,
          }}
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeSync />
        <ViewportFix />
        {isAdminRoute ? (
          // Admin pages bring their own chrome via app/admin/layout.tsx.
          // Skip Header / Footer / MobileNav and the public min-h-dvh
          // flex wrapper — admin layout owns its own structure.
          <>
            {children}
            <Toaster />
          </>
        ) : (
          <div className="flex min-h-dvh flex-col">
            <Header hasNewEpisode={hasNewEpisode} />
            <main className="main-content flex-1">{children}</main>
            <Footer />
            <MobileNav hasNewEpisode={hasNewEpisode} />
            <ScrollToTop />
            <Toaster />
          </div>
        )}
      </body>
    </html>
  )
}
