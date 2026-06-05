import Image from "next/image"
import type { EpisodeSponsorData } from "@/lib/queries/episode-sponsors"

export function EpisodeSponsor({ sponsor }: { sponsor: EpisodeSponsorData }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/10 bg-muted/30">
      <div className="px-6 py-8 sm:px-8">
        {/* Header */}
        <p className="mb-6 text-center text-[10px] font-bold tracking-[0.3em] text-primary/60">
          شريك الحوار
        </p>

        {/* Logo + Info */}
        <div className="flex flex-col items-center gap-5 text-center">
          {sponsor.logoUrl ? (
            <a
              href={sponsor.websiteUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
            >
              <Image
                src={sponsor.logoUrl}
                alt={sponsor.name}
                width={160}
                height={64}
                className="h-12 w-auto object-contain sm:h-14"
              />
            </a>
          ) : (
            <a
              href={sponsor.websiteUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xl font-semibold tracking-wide transition-colors hover:text-primary"
            >
              {sponsor.name}
            </a>
          )}

          {/* Brand line or description */}
          {(sponsor.brandLine || sponsor.description) && (
            <p className="max-w-md text-sm font-light leading-relaxed text-muted-foreground">
              {sponsor.brandLine || sponsor.description}
            </p>
          )}

          {/* Website link */}
          {sponsor.websiteUrl && (
            <a
              href={sponsor.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium tracking-wide text-primary/70 transition-colors hover:text-primary"
            >
              {sponsor.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
      </div>

      {/* Subtle decorative line */}
      <div className="h-px bg-gradient-to-l from-transparent via-primary/20 to-transparent" />
    </div>
  )
}
