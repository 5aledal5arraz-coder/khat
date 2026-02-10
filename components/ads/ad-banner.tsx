import Image from "next/image"
import { cn } from "@/lib/utils"
import { getAdSettings } from "@/lib/ads"

interface AdBannerProps {
  slot: string
  className?: string
  size?: "small" | "medium" | "large"
}

export async function AdBanner({ slot, className, size = "medium" }: AdBannerProps) {
  const settings = await getAdSettings()

  // Don't render if disabled
  if (!settings.bannerAd.enabled) {
    return null
  }

  const banner = settings.bannerAd.data
  const hasImage = banner.image && banner.image.length > 0

  const heights = {
    small: "h-[90px]",
    medium: "h-[120px]",
    large: "h-[250px]",
  }

  // If there's a real banner image, show it
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

  // Placeholder if no image set
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
