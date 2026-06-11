/**
 * Phase 2.5 (P2.5.b) — Section 1: Queue & Worker Health.
 *
 * Consumes SectionResult<QueueHealth> from `lib/ops/snapshot.ts`. Job
 * status enum values stay English (technical identifiers per operator
 * §2 of the planning doc); labels around them are Arabic.
 */

import { humanizeAge, truncate } from "@/lib/ops/format"
import type { SectionResult } from "@/lib/ops/snapshot"
import type { QueueHealth } from "@/lib/ops/snapshot"
import { InlineEmpty, KvRow, SectionCard } from "./section-card"

const JOB_STATUS_ORDER = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead",
  "cancelled",
] as const

export function QueueHealthSection({
  result,
}: {
  result: SectionResult<QueueHealth>
}) {
  if (!result.ok) {
    return (
      <SectionCard
        titleAr="صحة الطابور والعمال"
        subtitleAr="حالة المهام المجدولة والجارية"
        errorMode={{ error: result.error }}
      />
    )
  }
  const d = result.data
  const total = Object.values(d.countsByStatus).reduce((a, b) => a + b, 0)

  return (
    <SectionCard
      titleAr="صحة الطابور والعمال"
      subtitleAr="حالة المهام المجدولة والجارية"
    >
      {/* Counts by status. */}
      <div>
        <div className="mb-1 text-xs font-medium text-foreground">
          العدد حسب الحالة
        </div>
        {total === 0 ? (
          <InlineEmpty messageAr="لا توجد مهام في الطابور" />
        ) : (
          <ul className="space-y-0.5">
            {JOB_STATUS_ORDER.map((s) => (
              <li key={s}>
                <KvRow
                  labelAr={s}
                  value={d.countsByStatus[s].toLocaleString("en-US")}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Oldest pending. */}
      <div className="border-t border-border/60 pt-2">
        <div className="mb-1 text-xs font-medium text-foreground">
          أقدم مهمة في الانتظار
        </div>
        {d.oldestPending ? (
          <div className="space-y-0.5">
            <KvRow labelAr="النوع" value={d.oldestPending.type} />
            <KvRow
              labelAr="العمر"
              value={humanizeAge(d.oldestPending.age_ms)}
            />
          </div>
        ) : (
          <InlineEmpty messageAr="لا يوجد" />
        )}
      </div>

      {/* Oldest running. */}
      <div className="border-t border-border/60 pt-2">
        <div className="mb-1 text-xs font-medium text-foreground">
          أقدم مهمة قيد التنفيذ
        </div>
        {d.oldestRunning ? (
          <div className="space-y-0.5">
            <KvRow labelAr="النوع" value={d.oldestRunning.type} />
            {d.oldestRunning.age_ms !== null ? (
              <KvRow
                labelAr="العمر"
                value={humanizeAge(d.oldestRunning.age_ms)}
              />
            ) : null}
            {d.oldestRunning.locked_by ? (
              <KvRow
                labelAr="متلقّاة من"
                value={d.oldestRunning.locked_by}
              />
            ) : null}
          </div>
        ) : (
          <InlineEmpty messageAr="لا يوجد" />
        )}
      </div>

      {/* Stale-lease. */}
      <div className="border-t border-border/60 pt-2">
        <KvRow
          labelAr="مهام بإيجار منتهٍ (5+ دقائق)"
          value={d.staleLeaseCount.toLocaleString("en-US")}
        />
      </div>

      {/* Recent dead. */}
      <div className="border-t border-border/60 pt-2">
        <div className="mb-1 text-xs font-medium text-foreground">
          المهام الميتة (24 ساعة)
        </div>
        {d.recentDead.length === 0 ? (
          <InlineEmpty messageAr="لا يوجد" />
        ) : (
          <ul className="space-y-1">
            {d.recentDead.map((j) => (
              <li
                key={j.id}
                className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-foreground">
                    {j.type}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {j.attempts}/{j.max_attempts}
                  </span>
                </div>
                <div className="mt-0.5 break-words text-[11px] text-muted-foreground">
                  {truncate(j.error_message, 120)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  )
}
