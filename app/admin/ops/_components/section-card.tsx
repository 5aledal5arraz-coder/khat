/**
 * Phase 2.5 (P2.5.b) — Shared section-card shell.
 *
 * Every section component renders inside this wrapper for consistent
 * chrome (heading, optional subtitle, error mode). Server component —
 * no client interactivity.
 *
 * Error containment contract: when `errorMode` is provided, the body
 * is replaced with a muted error placeholder. The section heading
 * stays visible so the operator knows which section failed.
 *
 * NOT consolidated into `KitCard` (app/admin/components/ui-kit.tsx), and that
 * is a decision, not an oversight. `errorMode` IS this component: it is the
 * per-section failure-containment contract that `takeOpsSnapshot`'s
 * `Promise.allSettled` design depends on — heading stays, body is replaced,
 * only the generic sentence and the `errorRef` may be shown. `KitCard` has no
 * such state, and teaching it one would push an ops-specific concern into a
 * primitive that ~40 unrelated admin surfaces render. Merging them would move
 * risk, not remove duplication. If a THIRD surface ever needs section-level
 * error containment, promote it then, with a real second caller to design for.
 */

import type { ReactNode } from "react"

interface SectionCardProps {
  titleAr: string
  subtitleAr?: string
  /** Use the full-width grid track on lg screens. Section 5 only. */
  fullWidth?: boolean
  /**
   * The failed `SectionResult` fields. `error` is the fixed generic
   * sentence from `lib/ops/snapshot.ts`; `errorRef` is the lookup key
   * for the real cause in the server log. Nothing else about the
   * failure may be rendered here.
   */
  errorMode?: { error: string; errorRef?: string }
  children?: ReactNode
}

export function SectionCard({
  titleAr,
  subtitleAr,
  fullWidth = false,
  errorMode,
  children,
}: SectionCardProps) {
  const colSpan = fullWidth ? "lg:col-span-2" : ""
  return (
    <section
      className={`rounded-xl border border-border/60 bg-card p-5 ${colSpan}`}
    >
      <header className="mb-4">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {titleAr}
        </h2>
        {subtitleAr ? (
          <p className="mt-1 text-xs text-muted-foreground">{subtitleAr}</p>
        ) : null}
      </header>

      {errorMode ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
          <div className="font-medium">غير متاح</div>
          <div className="mt-1 break-words text-xs">{errorMode.error}</div>
          {errorMode.errorRef ? (
            // No opacity dimming here: this hex ref is the ONE string the
            // operator has to transcribe exactly, and `text-red-700` at
            // 70% opacity on white is ~3.3:1 — below WCAG AA. `-700` is
            // also the project's darkest coloured-text step (ui-kit.tsx).
            // The ref itself is set a step larger than the label for the
            // same reason: it has to be read character by character.
            <div className="mt-1 text-xs text-red-700">
              رقم للمتابعة مع المطوّر:{" "}
              <span className="font-mono text-[13px] font-semibold" dir="ltr">
                {errorMode.errorRef}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4 text-sm">{children}</div>
      )}
    </section>
  )
}

/**
 * Inline empty-state placeholder. Used for sub-blocks inside a
 * successful section (e.g., "no dead jobs" inside Section 1).
 *
 * Deliberately NOT `Empty` from the ui-kit: that one is a dashed, padded,
 * centered BOX. This renders inside a card that is already a box, often two or
 * three times on the same card — nesting dashed boxes inside a bordered card
 * is visual noise, and the sub-block it replaces was never a box to begin
 * with. Same words, different job; unifying them would be a layout change
 * dressed up as deduplication.
 */
export function InlineEmpty({ messageAr }: { messageAr: string }) {
  return <div className="text-xs text-muted-foreground">{messageAr}</div>
}

/**
 * Small KV row — Arabic label on the right (RTL natural), value on
 * the left. Used in oldest-pending / oldest-running / mode blocks.
 *
 * The value slot is FORCED to `dir="ltr"`, and that is load-bearing, not
 * cosmetic. Several values are ratios of the form «current / limit»
 * (`ai-router-section.tsx`: concurrency, daily cost vs cap). Inside the
 * RTL page, the bidi algorithm resolves the neutral " / " between two
 * numbers to the surrounding RTL direction (UAX#9 N1 — numbers act as R
 * for neighbouring neutrals), so L2 reverses the whole run and «2 / 8»
 * PAINTS as «8 / 2». The cost and its cap swapped places on screen: the
 * operator read the spend as the ceiling.
 *
 * Safe for the Arabic values too (`humanizeAge` → «منذ 5 أيام»): a run
 * that is entirely RTL-plus-digits reorders identically under either base
 * direction — only the neutrals BETWEEN two numbers change hands.
 */
export function KvRow({
  labelAr,
  value,
}: {
  labelAr: string
  value: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{labelAr}</span>
      <span className="font-mono text-xs text-foreground tabular-nums" dir="ltr">
        {value}
      </span>
    </div>
  )
}
