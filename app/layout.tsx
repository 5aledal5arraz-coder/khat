import type { Metadata, Viewport } from "next"
import { IBM_Plex_Sans_Arabic } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { MobileNav } from "@/components/layout/mobile-nav"
import { ViewportFix } from "@/components/layout/viewport-fix"
import { Toaster } from "@/components/ui/toaster"
import { ScrollToTop } from "@/components/ui/scroll-to-top"
import { AuthProvider } from "@/components/providers/auth-provider"
import { getThemeConfig } from "@/lib/theme"
import { isEnabled } from "@/config/site"
import { ThemeSync } from "@/components/theme/theme-sync"
import { fetchAllEpisodes } from "@/lib/youtube/queries"

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-arabic",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
})

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
  const [{ mode }, hibrEnabled, episodes] = await Promise.all([
    getThemeConfig(),
    isEnabled("hibrEnabled"),
    fetchAllEpisodes().catch(() => []),
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem("khat_theme");var m=s||document.documentElement.getAttribute("data-theme-mode");if(s)document.documentElement.setAttribute("data-theme-mode",s);if(m==="dark")document.documentElement.classList.add("dark");else if(m==="light")document.documentElement.classList.remove("dark");else if(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark");else document.documentElement.classList.remove("dark")})()`,
          }}
        />
      </head>
      <body className={`${ibmPlexArabic.variable} font-sans antialiased`}>
        <AuthProvider>
          <ThemeSync />
          <ViewportFix />
          <div className="flex min-h-dvh flex-col">
            <Header hibrEnabled={hibrEnabled} hasNewEpisode={hasNewEpisode} />
            <main className="main-content flex-1">{children}</main>
            <Footer />
            <MobileNav hibrEnabled={hibrEnabled} hasNewEpisode={hasNewEpisode} />
            <ScrollToTop />
            <Toaster />
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
