import { Metadata } from "next"
import Image from "next/image"
import { Headphones, ExternalLink, Rss } from "lucide-react"
import { listActivePlatforms, getPlatformByKey } from "@/lib/queries/official-platforms"
import { PlatformIcon } from "@/components/platforms/platform-icon"

export const metadata: Metadata = {
  title: "استمع الآن | بودكاست خط",
  description: "استمع لبودكاست خط على منصتك المفضلة — Spotify, Apple Podcasts والمزيد",
}

const PLATFORM_COLORS: Record<string, string> = {
  spotify: "hover:border-[#1DB954] hover:text-[#1DB954]",
  apple_podcasts: "hover:border-[#9933CC] hover:text-[#9933CC]",
  youtube_music: "hover:border-[#FF0000] hover:text-[#FF0000]",
  soundcloud: "hover:border-[#FF5500] hover:text-[#FF5500]",
  anghami: "hover:border-[#D90166] hover:text-[#D90166]",
}

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
          <Image
            src="/logo.png"
            alt="بودكاست خط"
            width={80}
            height={80}
            className="mx-auto rounded-2xl shadow-lg"
          />
          <div>
            <h1 className="text-3xl font-bold">استمع لبودكاست خط</h1>
            <p className="mt-2 text-muted-foreground">
              اختر منصتك المفضلة
            </p>
          </div>
        </div>

        {/* Platform Links */}
        <div className="mt-10 space-y-3">
          {tiles.length > 0 ? (
            tiles.map((p) => {
              const colorClass = PLATFORM_COLORS[p.icon_name || ""] || "hover:border-primary hover:text-primary"
              return (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-4 rounded-xl border border-border/40 bg-card/60 px-5 py-4 transition-all hover:shadow-md ${colorClass}`}
                >
                  <PlatformIcon iconName={p.icon_name} className="h-6 w-6 shrink-0" />
                  <span className="flex-1 text-base font-medium">{p.platform_name}</span>
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
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
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
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
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
