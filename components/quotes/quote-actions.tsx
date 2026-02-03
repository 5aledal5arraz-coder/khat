"use client"

import { SaveButton } from "@/components/actions/save-button"
import { ShareButton } from "@/components/actions/share-button"

interface QuoteActionsProps {
  quote: {
    id?: string
    text: string
    guest?: { name: string } | null
    theme?: string | null
  }
  variant?: "ghost" | "outline" | "default"
  size?: "default" | "sm" | "lg" | "icon"
  showLabels?: boolean
  className?: string
}

export function QuoteActions({
  quote,
  variant = "ghost",
  size = "sm",
  showLabels = true,
  className,
}: QuoteActionsProps) {
  // Create a unique ID from the quote text if not provided
  const quoteId = quote.id || btoa(encodeURIComponent(quote.text.slice(0, 50))).slice(0, 20)

  return (
    <div className={className}>
      <SaveButton
        item={{
          id: quoteId,
          type: "quote",
          title: quote.text,
          subtitle: quote.guest?.name,
        }}
        variant={variant}
        size={size}
        showLabel={showLabels}
      />
      <ShareButton
        title={quote.guest?.name ? `اقتباس من ${quote.guest.name}` : "اقتباس"}
        text={`"${quote.text}"${quote.guest?.name ? ` — ${quote.guest.name}` : ""}`}
        variant={variant}
        size={size}
        showLabel={showLabels}
      />
    </div>
  )
}
