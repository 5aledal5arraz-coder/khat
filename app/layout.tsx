import type { Metadata, Viewport } from "next"
import { IBM_Plex_Sans_Arabic } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { MobileNav } from "@/components/layout/mobile-nav"
import { ViewportFix } from "@/components/layout/viewport-fix"
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from "@/components/providers/auth-provider"
import { getThemeConfig } from "@/lib/theme"
import { ThemeSync } from "@/components/theme/theme-sync"

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-arabic",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
})

export const metadata: Metadata = {
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
  const { mode } = await getThemeConfig()

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
            __html: `(function(){var m=document.documentElement.getAttribute("data-theme-mode");if(m==="dark")document.documentElement.classList.add("dark");else if(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark");else document.documentElement.classList.remove("dark")})()`,
          }}
        />
      </head>
      <body className={`${ibmPlexArabic.variable} font-sans antialiased`}>
        <AuthProvider>
          <ThemeSync />
          <ViewportFix />
          <div className="flex min-h-dvh flex-col">
            <Header />
            <main className="main-content flex-1">{children}</main>
            <Footer />
            <MobileNav />
            <Toaster />
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
