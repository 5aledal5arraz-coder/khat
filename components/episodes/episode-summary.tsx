interface EpisodeSummaryProps {
  summary: string
}

/**
 * ص-٨ — the tinted card now shrinks to the measure instead of leaving a
 * band of empty background beside the text.
 *
 * `max-w-measure` was on the `<p>` only. The measure resolves in `em`
 * against the paragraph's own 16px size (75 × 0.3907em ≈ 469px), while the
 * card inherited the page's `max-w-4xl` (896px) — so at 1280px the text
 * filled 469px and roughly 387px of tinted background sat empty beside it.
 * Moving the cap to the container lets the card end where the copy does.
 * The line length is not identical afterwards — `p-5` now sits inside the
 * cap, so the text measures ~429px rather than 469px. That is a deliberate
 * trade: 429px is still a comfortable measure (~68 characters), and it buys
 * a card that no longer has a third of its width empty.
 */
export function EpisodeSummary({ summary }: EpisodeSummaryProps) {
  return (
    <div className="max-w-measure rounded-lg bg-muted/50 p-5">
      <h2 className="mb-3 text-lead font-semibold">ملخص الحلقة</h2>
      <p className="text-muted-foreground whitespace-pre-line">
        {summary}
      </p>
    </div>
  )
}
