import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
      <Card className="group h-full overflow-hidden transition-all hover:shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
              {guest.photo_url ? (
                <Image
                  src={guest.photo_url}
                  alt={guest.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted-foreground">
                  {guest.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold group-hover:text-primary">
                {guest.name}
              </h3>
              {guest.bio && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {guest.bio}
                </p>
              )}
              {guest.episode_count !== undefined && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {guest.episode_count} {guest.episode_count === 1 ? "حلقة" : "حلقات"}
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
