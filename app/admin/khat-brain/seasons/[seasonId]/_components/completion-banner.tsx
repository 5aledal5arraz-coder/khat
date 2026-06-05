"use client"

import { Sparkles, Loader2, Zap } from "lucide-react"
import {
  ROLE_LABEL_AR,
  type KhatMapMustIncludeRole,
} from "@/lib/khat-map/v2/completion"

/**
 * Surfaces when `remaining_slots <= 2` AND at least one must-include
 * role is still open AND the season isn't in manual mode. Lists the
 * missing roles as pills and offers a one-click auto-fill that drops
 * tailored cards into the review stack — still reviewable, never
 * auto-locked.
 */
export function CompletionBanner({
  missingRoles,
  remainingSlots,
  pending,
  onAutoComplete,
}: {
  missingRoles: KhatMapMustIncludeRole[]
  remainingSlots: number
  pending: boolean
  onAutoComplete: () => void
}) {
  if (missingRoles.length === 0 || remainingSlots <= 0) return null

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Zap className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary/80">
            إكمال ذكي
          </div>
          <h3 className="mt-0.5 text-[14px] font-bold">
            متبقٍ {remainingSlots} {remainingSlots === 1 ? "حلقة" : "حلقات"} — نملأها مباشرة؟
          </h3>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
            سنولّد حلقات موجّهة للأدوار الناقصة — ستبقى قابلة للمراجعة قبل القفل.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {missingRoles.map((r) => (
              <span
                key={r}
                className="rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              >
                {ROLE_LABEL_AR[r]}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onAutoComplete}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[12px] font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              نولّد…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              أكمل تلقائياً
            </>
          )}
        </button>
      </div>
    </div>
  )
}
