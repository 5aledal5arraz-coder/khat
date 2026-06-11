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
 */

import type { ReactNode } from "react"

interface SectionCardProps {
  titleAr: string
  subtitleAr?: string
  /** Use the full-width grid track on lg screens. Section 5 only. */
  fullWidth?: boolean
  errorMode?: { error: string }
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
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          <div className="font-medium">غير متاح</div>
          <div className="mt-1 break-words text-xs opacity-80">
            خطأ: {errorMode.error}
          </div>
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
 */
export function InlineEmpty({ messageAr }: { messageAr: string }) {
  return <div className="text-xs text-muted-foreground">{messageAr}</div>
}

/**
 * Small KV row — Arabic label on the right (RTL natural), value on
 * the left. Used in oldest-pending / oldest-running / mode blocks.
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
      <span className="font-mono text-xs text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}
