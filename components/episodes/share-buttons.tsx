"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Link2, Check, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface ShareButtonsProps {
  url: string
  title: string
  className?: string
  size?: "sm" | "default"
}

export function ShareButtons({ url, title, className, size = "sm" }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)

  const fullUrl = typeof window !== "undefined"
    ? `${window.location.origin}${url}`
    : url

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleWhatsAppShare = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const text = encodeURIComponent(`${title}\n${fullUrl}`)
    window.open(`https://wa.me/?text=${text}`, "_blank")
  }

  const handleXShare = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const text = encodeURIComponent(title)
    const urlEncoded = encodeURIComponent(fullUrl)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${urlEncoded}`, "_blank")
  }

  const buttonSize = size === "sm" ? "h-8 w-8" : "h-9 w-9"
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5"

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* WhatsApp */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleWhatsAppShare}
        className={cn(buttonSize, "text-muted-foreground hover:text-green-500 hover:bg-green-500/10")}
        title="مشاركة عبر واتساب"
      >
        <MessageCircle className={iconSize} />
      </Button>

      {/* X (Twitter) */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleXShare}
        className={cn(buttonSize, "text-muted-foreground hover:text-foreground hover:bg-foreground/10")}
        title="مشاركة عبر X"
      >
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </Button>

      {/* Copy Link */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopyLink}
        className={cn(
          buttonSize,
          "text-muted-foreground",
          copied ? "text-green-500" : "hover:text-primary hover:bg-primary/10"
        )}
        title={copied ? "تم النسخ!" : "نسخ الرابط"}
      >
        {copied ? <Check className={iconSize} /> : <Link2 className={iconSize} />}
      </Button>
    </div>
  )
}
