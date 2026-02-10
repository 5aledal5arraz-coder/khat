import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink } from "lucide-react"
import { getAdSettings } from "@/lib/ads"

export async function SponsoredCard() {
  const settings = await getAdSettings()

  // Don't render if disabled
  if (!settings.sponsoredCard.enabled) {
    return null
  }

  const sponsor = settings.sponsoredCard.data
  const hasImage = sponsor.image && sponsor.image.length > 0
  const hasLogo = sponsor.logo && sponsor.logo.length > 0

  return (
    <a
      href={sponsor.url || "#"}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className="group block"
    >
      <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card transition-all hover:border-primary/50 hover:shadow-lg">
        {/* Sponsored badge */}
        <div className="absolute top-3 start-3 z-10">
          <Badge variant="secondary" className="bg-primary/20 text-primary text-[10px]">
            محتوى مدعوم
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row">
          {/* Image */}
          <div className="relative aspect-video sm:aspect-square sm:w-48 overflow-hidden bg-muted">
            {hasImage ? (
              <Image
                src={sponsor.image}
                alt={sponsor.title}
                fill
                className="object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                <span className="text-4xl text-primary/30">AD</span>
              </div>
            )}
          </div>

          {/* Content */}
          <CardContent className="flex flex-1 flex-col justify-center p-5">
            {/* Sponsor name/logo */}
            <div className="mb-2 flex items-center gap-2">
              {hasLogo && (
                <Image
                  src={sponsor.logo}
                  alt={sponsor.name}
                  width={24}
                  height={24}
                  className="rounded"
                />
              )}
              <span className="text-xs text-muted-foreground">{sponsor.name}</span>
            </div>

            {/* Title */}
            <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
              {sponsor.title}
            </h3>

            {/* Description */}
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
              {sponsor.description}
            </p>

            {/* CTA */}
            <div className="mt-3 flex items-center gap-1 text-sm font-medium text-primary">
              <span>اعرف المزيد</span>
              <ExternalLink className="h-3 w-3" />
            </div>
          </CardContent>
        </div>
      </Card>
    </a>
  )
}
