import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import "./globals.css"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { MobileNav } from "@/components/layout/mobile-nav"
import { ViewportFix } from "@/components/layout/viewport-fix"
import { Toaster } from "@/components/ui/toaster"
import { ScrollToTop } from "@/components/ui/scroll-to-top"
import { fetchAllEpisodes } from "@/lib/youtube/queries"
import { getSiteSettings } from "@/lib/site-settings"
import { resolveDefaultOgImage } from "@/lib/seo/og"

const FALLBACK_DESCRIPTION =
  "بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين."

/**
 * Site-wide metadata is driven by the admin Settings hub (`site_settings`):
 * name, default description, keywords, title template, and the default OG
 * image. Per-page `metadata`/`generateMetadata` still override title and
 * description as usual; this sets the defaults every page inherits.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings().catch(() => null)
  const name = settings?.metadata.name?.trim() || "خط"
  const tagline = settings?.metadata.tagline?.trim()
  const description =
    settings?.seo.defaultDescription?.trim() ||
    settings?.metadata.description?.trim() ||
    FALLBACK_DESCRIPTION
  const template = settings?.seo.titleTemplate?.trim() || `%s | ${name}`
  const keywords =
    settings?.seo.keywords && settings.seo.keywords.length > 0
      ? settings.seo.keywords
      : ["بودكاست", "خط", "حوارات", "قصص", "عربي"]
  const defaultTitle = tagline ? `${name} | ${tagline}` : "خط | بودكاست"
  // Shared with /partner and the guest pages so all three agree on the card.
  const ogImageEntry = await resolveDefaultOgImage(settings)
  const ogImage = ogImageEntry.url

  return {
    metadataBase: new URL("https://khatpodcast.com"),
    title: { default: defaultTitle, template },
    description,
    keywords,
    authors: [{ name }],
    openGraph: {
      type: "website",
      locale: "ar_SA",
      siteName: name,
      url: "https://khatpodcast.com",
      images: [ogImageEntry],
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description,
      images: [ogImage],
    },
  }
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

  // Theme is a single light surface platform-wide. The palette lives in one
  // place — the :root block in globals.css — so it reaches <body> and any
  // React portal too; the admin overrides only the three tokens it
  // deliberately diverges on. The old system/dark/light toggle was vestigial
  // (forced light by the inline token overrides), so it has been removed.
  const episodes = isAdminRoute ? [] : await fetchAllEpisodes().catch(() => [])

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
      data-theme-mode="light"
      suppressHydrationWarning
    >
      <head>
        {/* Fonts loaded via a Google Fonts <link> in the root layout <head> (App Router equivalent of
            _document.js), as a stylesheet rather than next/font/google so the build never depends on a
            build-time font fetch.

            THIS href IS THE OTHER HALF OF THE FONT SWITCH POINT. The families are *named* by
            --font-brand-sans / --font-brand-display in the :root block of app/globals.css and *fetched*
            here — changing the brand font means editing both, and nothing else.
              · IBM Plex Sans Arabic → --font-brand-sans (body copy, every surface)
              · Amiri               → --font-brand-display (.museum-font-headline)

            Playfair Display was removed: it appeared only as the middle entry of
            `Amiri, "Playfair Display", serif` and could never render, because Google serves Amiri with
            latin + latin-ext + arabic subsets and Amiri therefore covers every glyph those headlines can
            contain. Verified in the browser: no Playfair face ever reached `loaded`. Dropping it stops
            fetching 8 unused @font-face declarations. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router root layout <head> is the correct location; rule is a Pages Router false positive */}
        <link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            // Single light surface — strip any stale `.dark` class a returning
            // visitor may have cached from the removed theme toggle.
            __html: `document.documentElement.classList.remove("dark")`,
          }}
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
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
          <div className="flex min-h-dvh flex-col bg-background text-foreground">
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
