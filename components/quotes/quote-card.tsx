"use client"

import { useState, lazy, Suspense } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check, Share2, ImageDown } from "lucide-react"
import type { Quote, Guest } from "@/types/database"

const QuoteImageModal = lazy(() =>
  import("./quote-image-modal").then((m) => ({ default: m.QuoteImageModal }))
)

interface QuoteCardProps {
  quote: Quote & { guest?: Guest | null }
  episodeTitle?: string
}

export function QuoteCard({ quote, episodeTitle }: QuoteCardProps) {
  const [copied, setCopied] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)

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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowImageModal(true)}
            className="gap-1"
          >
            <ImageDown className="h-4 w-4" />
            <span>صورة</span>
          </Button>
        </div>
        {showImageModal && (
          <Suspense fallback={null}>
            <QuoteImageModal
              quote={quote}
              episodeTitle={episodeTitle}
              onClose={() => setShowImageModal(false)}
            />
          </Suspense>
        )}
      </CardContent>
    </Card>
  )
}
