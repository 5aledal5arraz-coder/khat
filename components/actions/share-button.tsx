"use client"

import { Button } from "@/components/ui/button"
import { Share2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ShareButtonProps {
  title: string
  text?: string
  url?: string
  variant?: "ghost" | "outline" | "default"
  size?: "default" | "sm" | "lg" | "icon"
  showLabel?: boolean
  className?: string
}

export function ShareButton({
  title,
  text,
  url,
  variant = "ghost",
  size = "icon",
  showLabel = false,
  className,
}: ShareButtonProps) {
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "")
    const shareText = text || title

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: shareUrl,
        })
      } catch (err) {
        // User cancelled or share failed - copy to clipboard as fallback
        if ((err as Error).name !== "AbortError") {
          copyToClipboard(shareUrl)
        }
      }
    } else {
      copyToClipboard(shareUrl)
    }
  }

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text)
      // Could add a toast notification here
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={cn(showLabel && "gap-2", className)}
      title="مشاركة"
    >
      <Share2 className="h-4 w-4" />
      {showLabel && "مشاركة"}
    </Button>
  )
}
