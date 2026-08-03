interface BeforeYouWatchProps {
  data?: {
    who_is_it_for?: string
    who_is_it_not_for?: string
    what_you_gain?: string
  }
}

/**
 * ص-٨ — two corrections to the card styling, both of which only became
 * visible once these fields started being generated:
 *
 *  1. The three `dark:text-*-400` variants are GONE. `app/globals.css`
 *     defines no `@custom-variant dark` and no `.dark` rule, so under
 *     Tailwind v4 `dark:` compiles to `@media (prefers-color-scheme:
 *     dark)` — it tracked the VISITOR'S operating system on a page that
 *     has no dark theme at all, washing these headings out to a -400
 *     shade on a light card.
 *  2. -600 → -700. At `text-caption` (14px) these headings are normal
 *     text and need 4.5:1. Measured against this card background on the
 *     live page: green-600 = 3.00:1 and orange-600 = 3.31:1 — both fail.
 *     (blue-600 = 4.83:1 already passed; it moves for consistency, not
 *     because it was broken.) The -700 shades measure 4.62 / 4.83 / 6.29
 *     and match the convention already recorded for coloured text here.
 *
 * The hues themselves are still raw palette values rather than semantic
 * tokens — `globals.css` has no success/warning/info token to point at
 * (`--destructive` is the only status token). Introducing three is a
 * brand decision, not a bug fix, so it is deliberately left alone.
 */
export function BeforeYouWatch({ data }: BeforeYouWatchProps) {
  if (!data) return null
  const { who_is_it_for, who_is_it_not_for, what_you_gain } = data
  if (!who_is_it_for && !who_is_it_not_for && !what_you_gain) return null

  return (
    <div className="space-y-4">
      <h2 className="text-lead font-semibold">قبل أن تشاهد</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {who_is_it_for && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
            <h3 className="mb-2 text-caption font-medium text-green-700">لمن هذه الحلقة؟</h3>
            <p className="max-w-measure text-caption text-muted-foreground whitespace-pre-line">{who_is_it_for}</p>
          </div>
        )}
        {who_is_it_not_for && (
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
            <h3 className="mb-2 text-caption font-medium text-orange-700">ليست لك إذا...</h3>
            <p className="max-w-measure text-caption text-muted-foreground whitespace-pre-line">{who_is_it_not_for}</p>
          </div>
        )}
        {what_you_gain && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <h3 className="mb-2 text-caption font-medium text-blue-700">ماذا ستخرج به؟</h3>
            <p className="max-w-measure text-caption text-muted-foreground whitespace-pre-line">{what_you_gain}</p>
          </div>
        )}
      </div>
    </div>
  )
}
