"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check, Share2, Bookmark } from "lucide-react"
import { isItemSaved, toggleSaveItem } from "@/lib/saved"
import type { Quote, Guest } from "@/types/database"

interface QuoteCardProps {
  quote: Quote & { guest?: Guest | null }
}

export function QuoteCard({ quote }: QuoteCardProps) {
  const [copied, setCopied] = useState(false)
  const quoteId = quote.id || btoa(encodeURIComponent(quote.text.slice(0, 50))).slice(0, 20)
  const [isSaved, setIsSaved] = useState(() => {
    if (typeof window === "undefined") return false
    return isItemSaved(quoteId, "quote")
  })

  const handleSave = () => {
    const newState = toggleSaveItem({
      id: quoteId,
      type: "quote",
      title: quote.text,
      subtitle: quote.guest?.name,
    })
    setIsSaved(newState)
  }

  const handleCopy = async () => {
    const text = `"${quote.text}"${quote.guest ? ` - ${quote.guest.name}` : ""}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    const text = `"${quote.text}"${quote.guest ? ` - ${quote.guest.name}` : ""}`
    if (navigator.share) {
      try {
        await navigator.share({
          text,
        })
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopy()
    }
  }

  return (
    <Card className="bg-muted/50">
      <CardContent className="p-4">
        <blockquote className="text-lg leading-relaxed">
          &ldquo;{quote.text}&rdquo;
        </blockquote>
        {quote.guest && (
          <p className="mt-2 text-sm text-muted-foreground">
            — {quote.guest.name}
          </p>
        )}
        {quote.theme && (
          <p className="mt-1 text-xs text-muted-foreground">
            {quote.theme}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            className={`gap-1 ${isSaved ? "text-primary" : ""}`}
          >
            <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
            <span>{isSaved ? "محفوظ" : "حفظ"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="gap-1"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                <span>تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>نسخ</span>
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="gap-1"
          >
            <Share2 className="h-4 w-4" />
            <span>مشاركة</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
