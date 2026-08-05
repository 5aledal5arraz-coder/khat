import Image from "next/image"
import type { EpisodeSponsorData } from "@/lib/queries/episode-sponsors"

export function EpisodeSponsor({ sponsor }: { sponsor: EpisodeSponsorData }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/10 bg-muted/30">
      <div className="px-6 py-8 sm:px-8">
        {/* Header */}
        <p className="mb-6 text-center text-micro font-bold text-primary/60">
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
              {/* Same treatment as the season band (components/sponsors/
                  sponsor-strip.tsx): greyscale so a foreign palette does not
                  land on the page, multiply so an opaque white logo file does
                  not sit in a white box on the tinted ground, both dropped on
                  hover. The two sponsor surfaces have to agree — a logo that
                  is monochrome on the homepage and full-colour on the episode
                  page reads as a bug, not as a decision. */}
              <Image
                src={sponsor.logoUrl}
                alt={sponsor.name}
                width={160}
                height={64}
                className="h-12 w-auto object-contain opacity-80 mix-blend-multiply grayscale transition duration-300 hover:opacity-100 hover:grayscale-0 sm:h-14"
              />
            </a>
          ) : (
            <a
              href={sponsor.websiteUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-subhead font-semibold transition-colors hover:text-primary"
            >
              {sponsor.name}
            </a>
          )}

          {/* Brand line or description */}
          {(sponsor.brandLine || sponsor.description) && (
            <p className="max-w-md text-caption font-light text-muted-foreground">
              {sponsor.brandLine || sponsor.description}
            </p>
          )}

          {/* Website link */}
          {sponsor.websiteUrl && (
            <a
              href={sponsor.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-micro font-medium tracking-wide text-primary/70 transition-colors hover:text-primary"
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
