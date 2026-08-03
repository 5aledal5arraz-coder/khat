interface EpisodeSummaryProps {
  summary: string
}

/**
 * ص-٨ — the measure caps the LINE, not the card.
 *
 * `max-w-measure` resolves in `em` (75 × 0.3907em ≈ 469px at 16px), and it
 * briefly sat on the container instead. That did remove the empty tint
 * INSIDE the card, but it left a 469px card sitting against a 896px
 * container between two full-width neighbours — measured at 1280: container
 * x=188 w=896, this card x=615 w=469, the index row below it x=188 w=896.
 * A tinted block indented 427px from one edge only reads as a render fault,
 * which is worse than the whitespace it was trying to save.
 *
 * `WhyThisConversation` is the settling argument: it is the same tinted
 * card, one section up the page, and it has always been full width with the
 * cap on its `<p>`. Two adjacent cards of the same kind get the same
 * geometry. The empty tint beside the copy is the accepted cost, and it is
 * the ordinary editorial look — an unequal card width is not.
 */
export function EpisodeSummary({ summary }: EpisodeSummaryProps) {
  return (
    <div className="rounded-lg bg-muted/50 p-5">
      <h2 className="mb-3 text-lead font-semibold">ملخص الحلقة</h2>
      <p className="max-w-measure text-muted-foreground whitespace-pre-line">
        {summary}
      </p>
    </div>
  )
}
