"use client"

import Image from "next/image"
import { useState } from "react"
import { cn, formatArabicCount } from "@/lib/utils"

interface GuestAvatarProps {
  name: string
  slug: string
  photoUrl?: string | null
  size?: "sm" | "md" | "lg" | "xl" | "2xl"
  className?: string
  showBorder?: boolean
  showGlow?: boolean
}

const sizeClasses = {
  sm: "h-10 w-10 text-sm",
  md: "h-14 w-14 text-base",
  lg: "h-20 w-20 text-xl",
  xl: "h-28 w-28 text-2xl",
  "2xl": "h-36 w-36 text-3xl",
}

const borderSizeClasses = {
  sm: "ring-2",
  md: "ring-2",
  lg: "ring-3",
  xl: "ring-4",
  "2xl": "ring-4",
}

export function GuestAvatar({
  name,
  slug,
  photoUrl,
  size = "md",
  className,
  showBorder = true,
  showGlow = false,
}: GuestAvatarProps) {
  const [imageError, setImageError] = useState(false)

  // Use photoUrl if available, otherwise fall back to initials
  const imageSources = photoUrl ? [photoUrl] : []

  const [currentSourceIndex, setCurrentSourceIndex] = useState(0)
  const currentSource = imageSources[currentSourceIndex]
  const hasValidImage = currentSource && !imageError

  const handleImageError = () => {
    if (currentSourceIndex < imageSources.length - 1) {
      setCurrentSourceIndex(currentSourceIndex + 1)
    } else {
      setImageError(true)
    }
  }

  // Get initials (first letter of first and last name)
  const initials = name
    .split(" ")
    .map((n) => n.charAt(0))
    .slice(0, 2)
    .join("")

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-full",
        sizeClasses[size],
        showBorder && [
          borderSizeClasses[size],
          "ring-primary/50 ring-offset-2 ring-offset-background",
        ],
        showGlow && "shadow-lg shadow-primary/20",
        className
      )}
    >
      {/* Gradient background for fallback */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-accent/20 to-primary/10" />

      {hasValidImage ? (
        <Image
          src={currentSource}
          alt={name}
          fill
          className="object-cover"
          onError={handleImageError}
          sizes={size === "2xl" ? "144px" : size === "xl" ? "112px" : size === "lg" ? "80px" : size === "md" ? "56px" : "40px"}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center font-semibold text-foreground/80">
          {initials}
        </div>
      )}

      {/* Subtle inner shadow for depth */}
      <div className="absolute inset-0 rounded-full shadow-inner shadow-black/20" />
    </div>
  )
}

// Styled guest card for featured sections
interface GuestCardProps {
  name: string
  slug: string
  photoUrl?: string | null
  title?: string | null
  episodeCount?: number
  className?: string
}

export function GuestCard({
  name,
  slug,
  photoUrl,
  title,
  episodeCount,
  className,
}: GuestCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col items-center gap-3 rounded-xl bg-card p-4 transition-all hover:bg-card/80",
        className
      )}
    >
      {/* Decorative background element */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 transition-opacity group-hover:opacity-100" />

      <GuestAvatar
        name={name}
        slug={slug}
        photoUrl={photoUrl}
        size="xl"
        showBorder
        showGlow
      />

      <div className="relative text-center">
        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
          {name}
        </h3>
        {title && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
            {title}
          </p>
        )}
        {episodeCount !== undefined && episodeCount > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {formatArabicCount(episodeCount, "حلقة")}
          </p>
        )}
      </div>
    </div>
  )
}
