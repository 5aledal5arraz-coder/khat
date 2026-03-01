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

    // No image creative — hide ad slot from public
    return null
  }

  // Legacy behavior: use old AdSettings
  const settings = await getAdSettings()
  if (!settings.bannerAd.enabled) return null

  const banner = settings.bannerAd.data
  const hasImage = banner.image && banner.image.length > 0

  if (!hasImage) return null

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
