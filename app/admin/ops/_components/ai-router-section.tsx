/**
 * Phase 2.5 (P2.5.b) — Section 3: AI Router & Rate-limit.
 *
 * Mode badge, per-tier concurrency/cost cards, 24h ai_runs status
 * counts, recent rejects from both layers (rate-limit + ai-router).
 */

import { formatUtc, severityClass, truncate } from "@/lib/ops/format"
import type {
  AiRouterSnapshot,
  SectionResult,
  TierSnapshot,
} from "@/lib/ops/snapshot"
import { InlineEmpty, KvRow, SectionCard } from "./section-card"

const AI_RUN_STATUS_ORDER = [
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
] as const

function modeClass(mode: string): string {
  switch (mode) {
    case "enforce":
      return "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    case "report":
      return "border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
    case "off":
    default:
      return "border border-border bg-muted/60 text-muted-foreground"
  }
}

function utilization(t: TierSnapshot): number {
  if (t.concurrency_limit <= 0) return 0
  return Math.min(100, Math.round((t.current_concurrency / t.concurrency_limit) * 100))
}

function barClass(util: number): string {
  if (util >= 95) return "bg-red-500"
  if (util >= 80) return "bg-amber-500"
  return "bg-green-500"
}

function TierCard({ titleAr, tier }: { titleAr: string; tier: TierSnapshot }) {
  const util = utilization(tier)
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="mb-1.5 text-xs font-medium text-foreground">{titleAr}</div>
      <KvRow
        labelAr="التزامن"
        value={`${tier.current_concurrency} / ${tier.concurrency_limit}`}
      />
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-border/60">
        <div
          className={`h-full ${barClass(util)}`}
          style={{ width: `${util}%` }}
        />
      </div>
      <div className="mt-2">
        <KvRow
          labelAr="التكلفة اليومية (دولار)"
          value={`${tier.daily_cost_usd.toFixed(2)} / ${tier.daily_cost_limit_usd.toFixed(2)}`}
        />
      </div>
    </div>
  )
}

export function AiRouterSection({
  result,
}: {
  result: SectionResult<AiRouterSnapshot>
}) {
  if (!result.ok) {
    return (
      <SectionCard
        titleAr="موجّه الذكاء الاصطناعي وحدّ المعدل"
        errorMode={{ error: result.error }}
      />
    )
  }
  const d = result.data

  return (
    <SectionCard titleAr="موجّه الذكاء الاصطناعي وحدّ المعدل">
      {/* Mode. */}
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted-foreground">الوضع</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${modeClass(d.rate_limit_mode)}`}
        >
          {d.rate_limit_mode}
        </span>
      </div>

      {/* Tier cards. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TierCard titleAr="الفئة الخفيفة" tier={d.tiers.light} />
        <TierCard titleAr="الفئة المكلفة" tier={d.tiers.expensive} />
      </div>

      {/* ai_runs status counts. */}
      <div className="border-t border-border/60 pt-2">
        <div className="mb-1 text-xs font-medium text-foreground">
          حالات تشغيل الذكاء الاصطناعي (24 ساعة)
        </div>
        <ul className="space-y-0.5">
          {AI_RUN_STATUS_ORDER.map((s) => (
            <li key={s}>
              <KvRow
                labelAr={s}
                value={d.ai_runs_status_counts_24h[s].toLocaleString("en-US")}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* Recent rate-limit rejects. */}
      <div className="border-t border-border/60 pt-2">
        <div className="mb-1 text-xs font-medium text-foreground">
          الرفض من حدّ المعدل
        </div>
        {d.recentRateLimitRejects.length === 0 ? (
          <InlineEmpty messageAr="لا توجد عمليات رفض حديثة" />
        ) : (
          <ul className="space-y-1">
            {d.recentRateLimitRejects.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5"
              >
                <div className="flex flex-wrap items-baseline gap-2 text-[10px]">
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {formatUtc(e.event_at)}
                  </span>
                  <span
                    className={`rounded px-1 py-0.5 ${severityClass(e.severity)}`}
                  >
                    {e.severity}
                  </span>
                  <span className="font-mono text-foreground">
                    {String(e.payload.decision ?? "—")}
                  </span>
                </div>
                <div className="mt-0.5 break-words font-mono text-[10px] text-muted-foreground">
                  {truncate(JSON.stringify(e.payload), 80)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent ai-router rejects. */}
      <div className="border-t border-border/60 pt-2">
        <div className="mb-1 text-xs font-medium text-foreground">
          الرفض من الموجّه
        </div>
        {d.recentAiRouterRejects.length === 0 ? (
          <InlineEmpty messageAr="لا توجد عمليات رفض حديثة" />
        ) : (
          <ul className="space-y-1">
            {d.recentAiRouterRejects.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5"
              >
                <div className="flex flex-wrap items-baseline gap-2 text-[10px]">
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {formatUtc(e.event_at)}
                  </span>
                  <span className="font-mono text-foreground">
                    {String(e.payload.task_kind ?? "—")}
                  </span>
                </div>
                <div className="mt-0.5 break-words text-[10px] text-muted-foreground">
                  {truncate(String(e.payload.reason ?? ""), 80)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  )
}
