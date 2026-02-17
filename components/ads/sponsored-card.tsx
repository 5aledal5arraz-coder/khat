import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink } from "lucide-react"
import { getAdSettings, getActiveAdForSlot } from "@/lib/ads"
import { isEnabled } from "@/config/site"
import type { AdSlotPosition, SponsorData } from "@/types/ads"

interface SponsoredCardProps {
  position?: AdSlotPosition
}

function SponsoredCardUI({ sponsor }: { sponsor: SponsorData }) {
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
        <div className="absolute top-3 start-3 z-10">
          <Badge variant="secondary" className="bg-primary/20 text-primary text-[10px]">
            محتوى مدعوم
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row">
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

          <CardContent className="flex flex-1 flex-col justify-center p-5">
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

            <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
              {sponsor.title}
            </h3>

            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
              {sponsor.description}
            </p>

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

export async function SponsoredCard({ position }: SponsoredCardProps = {}) {
  if (!(await isEnabled("adsEnabled"))) return null

  // If position is provided, use enhanced slot-based lookup
  if (position) {
    const activeSlot = await getActiveAdForSlot(position)
    if (!activeSlot || !activeSlot.sponsoredData) return null
    return <SponsoredCardUI sponsor={activeSlot.sponsoredData} />
  }

  // Legacy behavior
  const settings = await getAdSettings()
  if (!settings.sponsoredCard.enabled) return null
  return <SponsoredCardUI sponsor={settings.sponsoredCard.data} />
}
