import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { GuestAvatar } from "@/components/guests/guest-avatar"
import { formatArabicCount } from "@/lib/utils"
import type { Guest } from "@/types/database"

interface GuestCardProps {
  guest: Guest & {
    episode_count?: number
    topics?: string[]
  }
}

export function GuestCard({ guest }: GuestCardProps) {
  return (
    <Link href={`/guests/${guest.slug}`}>
      <Card className="group h-full overflow-hidden transition-all hover:shadow-lg hover:border-primary/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <GuestAvatar
              name={guest.name}
              slug={guest.slug}
              photoUrl={guest.photo_url}
              size="lg"
              showBorder
              className="shrink-0 transition-all group-hover:ring-primary group-hover:shadow-lg group-hover:shadow-primary/20"
            />
            <div className="flex-1">
              <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                {guest.name}
              </h3>
              {guest.bio && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {guest.bio}
                </p>
              )}
              {guest.testimonial && (
                <p className="mt-1.5 line-clamp-1 text-xs italic text-amber-500/70">
                  &ldquo;{guest.testimonial}&rdquo;
                </p>
              )}
              {guest.episode_count !== undefined && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatArabicCount(guest.episode_count, "حلقة")}
                </p>
              )}
              {guest.topics && guest.topics.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {guest.topics.slice(0, 3).map((topic, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
