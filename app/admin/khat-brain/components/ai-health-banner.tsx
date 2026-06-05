/**
 * AI health banner — production-readiness fix #1.
 *
 * Pure server component. Reads `getAiHealth()` and renders an inline
 * banner whenever the state is not "ok". Hidden when AI is healthy so
 * the operator never sees status noise during normal operation.
 *
 * Three visual tones:
 *   quota_exceeded → rose; generation buttons explicitly disabled.
 *   degraded       → amber; warning copy; buttons stay enabled.
 *   ok             → renders nothing.
 */

import { AlertOctagon, AlertTriangle } from "lucide-react"
import type { AiHealthSnapshot } from "@/lib/ai-router/health"

export function AiHealthBanner({ snapshot }: { snapshot: AiHealthSnapshot }) {
  if (snapshot.state === "ok" || !snapshot.banner_message) return null

  const isCritical = snapshot.state === "quota_exceeded"
  const Icon = isCritical ? AlertOctagon : AlertTriangle
  const tone = isCritical
    ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
    : "border-amber-500/40 bg-amber-500/10 text-amber-200"

  return (
    <div
      className={`mb-4 flex items-start gap-3 rounded-2xl border p-3 text-[12.5px] ${tone}`}
      data-ai-health-banner
      data-ai-health-state={snapshot.state}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium leading-relaxed">
          {snapshot.banner_message}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] opacity-80" dir="ltr">
          <span>
            ok={snapshot.recent_counts.ok} · failed={snapshot.recent_counts.failed}
            {snapshot.recent_counts.quota > 0 &&
              ` · quota=${snapshot.recent_counts.quota}`}
            {snapshot.recent_counts.rate_limited > 0 &&
              ` · rate=${snapshot.recent_counts.rate_limited}`}
          </span>
          {snapshot.last_error_class && (
            <span>last_error={snapshot.last_error_class}</span>
          )}
        </div>
      </div>
    </div>
  )
}
