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
import { BRAND_DESCRIPTION } from "@/lib/brand/voice"

const FALLBACK_DESCRIPTION =
  BRAND_DESCRIPTION

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
  /**
   * The maintenance page gets NO public chrome either, for a reason the admin
   * case does not share: every link in the Header, Footer and MobileNav points
   * into a site that is closed, and the middleware rewrites all of them
   * straight back to this page. A visitor could click «الحلقات» and arrive
   * here again — a menu of dead links wrapped around the notice explaining why
   * they are dead.
   *
   * It also skips the episode fetch below, which is the whole point of a
   * maintenance page: it must not depend on the data layer that may be the
   * reason for the outage in the first place.
   */
  const isMaintenance = pathname === "/maintenance"
  const isBareRoute = isAdminRoute || isMaintenance

  // Theme is a single light surface platform-wide. The palette lives in one
  // place — the :root block in globals.css — so it reaches <body> and any
  // React portal too; the admin's divergences ride the same block, keyed off
  // `[data-surface="admin"]`. The old system/dark/light toggle was vestigial
  // (forced light by the inline token overrides), so it has been removed.
  const episodes = isBareRoute ? [] : await fetchAllEpisodes().catch(() => [])

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
      // Which surface's values EVERYTHING the two surfaces disagree on
      // resolves to: the four shared-primitive sizes (components/ui/*) and the
      // three colours the admin diverges on. The site maps the primitives onto
      // the brand type scale so a font swap moves controls with their labels;
      // the admin pins them, so a font swap never reflows the operations
      // panel. Both sets live in the :root block of globals.css.
      //
      // ON <html>, NOT ON THE ADMIN WRAPPER <div>, because a token that is not
      // at the root does not follow a subtree that escapes the wrapper. The
      // wrapper is inside <body>, and `createPortal(…, document.body)` puts
      // its subtree outside it — the guests row menu
      // (app/admin/guests/guests-list.tsx) and the Toaster both do this.
      // NOTE: our own <DialogPortal> does NOT — it is `<>{children}</>` and
      // renders in place. The earlier version of this comment claimed dialogs
      // were the reason; they are not, and the real portals are.
      //
      // Same `isAdminRoute` that picks the chrome below, so "this is the
      // admin" is decided exactly once.
      data-surface={isAdminRoute ? "admin" : "site"}
      suppressHydrationWarning
    >
      <head>
        {/* Fonts loaded via a Google Fonts <link> in the root layout <head> (App Router equivalent of
            _document.js), as a stylesheet rather than next/font/google so the build never depends on a
            build-time font fetch.

            THIS IS NO LONGER HALF OF THE FONT SWITCH POINT. It was, while the family came from
            Google and had to be *fetched* here as well as *named* in globals.css. Manifa V2 —
            the identity's own face — is self-hosted from /public/fonts and both declared and
            named in app/globals.css, so the whole switch is one file now. What is left below is
            a preload of the two weights the first screen paints, which is an optimisation and
            not a declaration: deleting it costs a frame, not a typeface.

            ONE FAMILY, because one family is all this site paints. Playfair Display went first: it was
            the middle entry of `Amiri, "Playfair Display", serif` and could never render, since Google
            serves Amiri with latin + latin-ext + arabic subsets and Amiri covered every glyph those
            headlines could contain.

            AMIRI FOLLOWED IT, for the same reason one level up. Its only consumer was
            `.museum-font-headline`, whose only caller — components/episodes/episode-card.tsx — was
            deleted; the stylesheet's claim that it renders "three nodes in the recommendations grid"
            outlived the component. Measured on the running site before removal:
            `document.querySelectorAll('.museum-font-headline').length === 0` on every public route, and
            all 12 Amiri faces reported `status: "unloaded"`. We were fetching a display family, four
            weights x two styles, that nothing on the site draws. */}
        {/* NO GOOGLE FONTS. Manifa V2 — the identity's own typeface — is
            self-hosted from /public/fonts and declared in app/globals.css, so
            the two preconnects and the stylesheet <link> that used to fetch
            IBM Plex Sans Arabic are gone with it. Two fewer third-party
            handshakes on first paint, and the brand face no longer depends on
            a network Khaled does not control.
            The half of the switch point that lived HERE now lives entirely in
            globals.css: adopting a new family is `@font-face` plus
            `--font-brand-sans`, with nothing to keep in sync across files. */}
        <link
          rel="preload"
          href="/fonts/manifa-v2-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/manifa-v2-600.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
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
        {isBareRoute ? (
          // Admin pages bring their own chrome via app/admin/layout.tsx.
          // Skip Header / Footer / MobileNav and the public min-h-dvh
          // flex wrapper — admin layout owns its own structure.
          <>
            {children}
            <Toaster />
          </>
        ) : (
          // `text-body` here is the public site's type DEFAULT, not a local
          // choice: it hands every element that doesn't name a step the body
          // size and — the part that matters — the body LEADING (1.85, a
          // unitless number, so descendants scale it against their own size).
          // Without it, unstyled Arabic prose falls back to `normal` (~1.5),
          // which is below the 1.607em this typeface needs to keep tashkeel
          // from colliding. Admin never mounts this wrapper, so it is
          // unaffected.
          <div className="flex min-h-dvh flex-col bg-background text-body text-foreground">
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
