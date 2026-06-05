/**
 * A10 — Compact AI-degraded admin banner.
 *
 * Renders a single-line strip above the admin page content when the
 * AI pipeline is dropping calls. Auto-disappears on the next render
 * when the rolling-window count drops below threshold (no manual
 * dismiss).
 *
 * UX constraints (operator §rules):
 *   • Single line. No modal, no toast, no chart, no animation.
 *   • Amber palette (warn, not alarm). No aggressive red.
 *   • Stable height so it doesn't introduce layout shift when it
 *     appears between renders.
 *   • Server-rendered. No client-side fetch / WebSocket / polling.
 *
 * The banner text deliberately uses plain operator-friendly Arabic
 * with a precise English fallback in case the i18n surface ever
 * flips. Reading order is RTL — flexbox order honors `dir="rtl"` set
 * on the root html element.
 */

import { AlertTriangle } from "lucide-react"
import type { AiDegradedState } from "@/lib/ops/ai-degraded"

interface Props {
  state: AiDegradedState
}

export function AiDegradedBanner({ state }: Props) {
  // Banner only renders when the degraded flag is on. Returning null
  // when off keeps the DOM tree stable — Next.js doesn't insert a
  // placeholder slot, so there's no layout shift when the state
  // toggles between renders.
  if (!state.degraded) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[12px] leading-tight text-amber-700 dark:text-amber-300"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="font-medium">حالة الذكاء الاصطناعي متدهورة:</span>
        <span className="text-amber-700/85 dark:text-amber-300/85">
          توليد جديد قد يفشل أو يتأخر — سيُعاد المحاولة تلقائيًا. ({state.recent_count} رفض خلال آخر {state.window_minutes} دقيقة)
        </span>
      </div>
    </div>
  )
}
