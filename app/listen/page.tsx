import { Metadata } from "next"
import { KhatLogo } from "@/components/brand/khat-logo"
import { Headphones, ExternalLink, Rss } from "lucide-react"
import { listActivePlatforms, getPlatformByKey } from "@/lib/queries/official-platforms"
import { PlatformIcon } from "@/components/platforms/platform-icon"

export const metadata: Metadata = {
  // NO SITE NAME HERE — `app/layout.tsx` appends it via `title.template`, so
  // spelling it out shipped «استمع الآن | بودكاست خط | بودكاست خط». Same rule
  // `categoryMetadata` documents in lib/episodes/programs.ts.
  title: "استمع الآن",
  description: "استمع لبودكاست خط على منصتك المفضلة — Spotify, Apple Podcasts والمزيد",
}

/**
 * ONE HOVER, IN OUR COLOUR — not five, in theirs.
 *
 * This was a per-platform map of each service's own brand hex: Spotify green
 * #1DB954, Apple purple #9933CC, YouTube red #FF0000, SoundCloud #FF5500,
 * Anghami #D90166. Five colours, none of them in «ملف عرض الشعار».
 *
 * A LOGO is a trademark and is not ours to repaint — that is why the sponsor
 * strip and the YouTube play button keep their own colours. A HOVER STATE on
 * OUR tile is not: it is our styling decision, and we had simply decided to
 * borrow theirs. Each platform's identity is already carried by its icon
 * (`PlatformIcon`), which is the correct place for it.
 *
 * It was also incomplete in a way that showed the seam: `amazon_music` had no
 * entry, so the newest platform was the one tile that did not light up.
 * A single rule covers every platform, including ones not added yet.
 */
const PLATFORM_HOVER = "hover:border-primary hover:text-primary"

export default async function ListenPage() {
  // Only audio platforms on the listen page.
  const audioPlatforms = await listActivePlatforms({ category: "audio" })
  // Split visible tiles vs the RSS fallback.
  const tiles = audioPlatforms.filter((p) => p.platform_key !== "rss")
  const rss = audioPlatforms.find((p) => p.platform_key === "rss")
    || await getPlatformByKey("rss")

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
        {/* Header */}
        <div className="text-center space-y-6">
          {/* Was /logo.png — the RETIRED gold wordmark, at 80px under a
              drop-shadow. The mark is the right element above a heading that
              already names the brand, and the shadow is one of the six formal
              don'ts. */}
          <KhatLogo variant="mark" height={72} label={null} className="mx-auto" />
          <div>
            <h1 className="text-heading font-bold">استمع لبودكاست خط</h1>
            <p className="mt-2 text-muted-foreground">
              اختر منصتك المفضلة
            </p>
          </div>
        </div>

        {/* Platform Links */}
        <div className="mt-10 space-y-3">
          {tiles.length > 0 ? (
            tiles.map((p) => {
              return (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-4 rounded-xl border border-border/40 bg-card/60 px-5 py-4 transition-all hover:shadow-md ${PLATFORM_HOVER}`}
                >
                  <PlatformIcon iconName={p.icon_name} className="h-6 w-6 shrink-0" />
                  <span className="flex-1 text-body font-medium">{p.platform_name}</span>
                  <ExternalLink className="h-4 w-4 opacity-40" />
                </a>
              )
            })
          ) : (
            <div className="text-center py-12">
              <Headphones className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">لا توجد منصات متاحة حالياً</p>
              {rss && (
                <a
                  href={rss.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-caption text-primary hover:underline"
                >
                  <Rss className="h-4 w-4" />
                  اشترك عبر RSS
                </a>
              )}
            </div>
          )}
        </div>

        {/* RSS fallback link */}
        {tiles.length > 0 && rss && (
          <div className="mt-8 text-center">
            <a
              href={rss.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-micro text-muted-foreground hover:text-primary transition-colors"
            >
              <Rss className="h-3.5 w-3.5" />
              اشترك عبر RSS Feed
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
