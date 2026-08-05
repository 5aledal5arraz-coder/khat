import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { GuestPortrait } from "@/components/media/guest-portrait"
import { formatArabicCount } from "@/lib/utils"
import type { Guest } from "@/types/database"

interface GuestCardProps {
  guest: Guest & {
    episode_count?: number
  }
}

export function GuestCard({ guest }: GuestCardProps) {
  return (
    <Link href={`/guests/${guest.slug}`}>
      <Card className="group h-full overflow-hidden transition-all hover:shadow-lg hover:border-primary/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            {/* 80px rounded square, and — when there is no photo — the same flat
                panel every other empty image slot shows. What it replaced was a
                ring + gradient + glow circle carrying two Arabic initials that
                were wrong for five of our seven names; see the note in
                `lib/shared/formatters.ts`. This is the ONE surface that still
                shows the empty state for a guest: a list of cards needs
                something in the slot to stay a grid. The guest's own page and
                the episode page show nothing at all. */}
            <GuestPortrait
              name={guest.name}
              photoUrl={guest.photo_url}
              variant="card"
            />
            <div className="flex-1">
              <h3 className="text-lead font-semibold group-hover:text-primary transition-colors">
                {guest.name}
              </h3>
              {guest.bio && (
                <p className="mt-1 line-clamp-2 text-caption text-muted-foreground">
                  {guest.bio}
                </p>
              )}
              {guest.testimonial && (
                // `text-accent` (the brand's warm/energy token), not the
                // literal `text-amber-500/70` this used to be: amber was a
                // leftover of the retired gold identity, so it would have
                // survived a brand swap as the one warm colour on the page
                // that no longer belonged to any palette. Safe to retarget —
                // zero guests currently carry a testimonial, so this branch
                // renders for nobody today.
                <p className="mt-1.5 line-clamp-1 text-micro italic text-accent-strong">
                  &ldquo;{guest.testimonial}&rdquo;
                </p>
              )}
              {guest.episode_count !== undefined && (
                <p className="mt-2 text-micro text-muted-foreground">
                  {formatArabicCount(guest.episode_count, "حلقة")}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
