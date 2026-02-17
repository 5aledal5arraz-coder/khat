import Image from "next/image"
import { cn } from "@/lib/utils"
import { getAdSettings, getActiveAdForSlot } from "@/lib/ads"
import { isEnabled } from "@/config/site"
import type { AdSlotPosition } from "@/types/ads"

interface AdBannerProps {
  slot?: string
  position?: AdSlotPosition
  className?: string
  size?: "small" | "medium" | "large"
}

export async function AdBanner({ slot, position, className, size = "medium" }: AdBannerProps) {
  if (!(await isEnabled("adsEnabled"))) return null

  const heights = {
    small: "h-[90px]",
    medium: "h-[120px]",
    large: "h-[250px]",
  }

  // If position is provided, use enhanced slot-based lookup
  if (position) {
    const activeSlot = await getActiveAdForSlot(position)
    if (!activeSlot || !activeSlot.bannerData) return null

    const banner = activeSlot.bannerData
    const hasImage = banner.image && banner.image.length > 0

    if (hasImage) {
      return (
        <a
          href={banner.url || "#"}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className={cn(
            "relative block w-full overflow-hidden rounded-xl",
            heights[size],
            className
          )}
          data-ad-slot={position}
        >
          <Image
            src={banner.image}
            alt={banner.alt || "إعلان"}
            fill
            className="object-cover transition-transform hover:scale-[1.02]"
          />
        </a>
      )
    }

    return (
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl border border-dashed border-muted-foreground/20 bg-muted/30",
          heights[size],
          className
        )}
        data-ad-slot={position}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
          <span className="text-xs">مساحة إعلانية</span>
          <span className="text-[10px]">{activeSlot.label}</span>
        </div>
      </div>
    )
  }

  // Legacy behavior: use old AdSettings
  const settings = await getAdSettings()
  if (!settings.bannerAd.enabled) return null

  const banner = settings.bannerAd.data
  const hasImage = banner.image && banner.image.length > 0

  if (hasImage) {
    return (
      <a
        href={banner.url || "#"}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className={cn(
          "relative block w-full overflow-hidden rounded-xl",
          heights[size],
          className
        )}
        data-ad-slot={slot}
      >
        <Image
          src={banner.image}
          alt={banner.alt || "إعلان"}
          fill
          className="object-cover transition-transform hover:scale-[1.02]"
        />
      </a>
    )
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-dashed border-muted-foreground/20 bg-muted/30",
        heights[size],
        className
      )}
      data-ad-slot={slot}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
        <span className="text-xs">مساحة إعلانية</span>
        <span className="text-[10px]">{slot}</span>
      </div>
    </div>
  )
}
