/**
 * Phase 2.5 (P2.5.b) — Section 4: EIR Pipeline.
 *
 * 15 phase chips with counts, recent transitions list, invalid
 * transition attempt summary. Phase names stay English (enum
 * identifiers per operator §2).
 */

import { formatUtc, humanizeAge } from "@/lib/ops/format"
import type {
  EirPipelineSnapshot,
  SectionResult,
} from "@/lib/ops/snapshot"
import { InlineEmpty, KvRow, SectionCard } from "./section-card"

const EPISODE_PHASE_ORDER = [
  "idea",
  "guest_discovery",
  "guest_assigned",
  "approved",
  "researching",
  "prepared",
  "ready_to_record",
  "recording",
  "recorded",
  "producing",
  "ready_to_publish",
  "published",
  "analyzing",
  "learned",
  "archived",
] as const

export function EirPipelineSection({
  result,
  takenAt,
}: {
  result: SectionResult<EirPipelineSnapshot>
  /**
   * Stable wall-clock reference from the snapshot. Used to compute
   * relative age of the most recent invalid attempt. Threaded from
   * `page.tsx` so the render is pure — calling `Date.now()` inside a
   * server component breaks impurity rules and yields different
   * values across the render lifecycle.
   */
  takenAt: Date
}) {
  if (!result.ok) {
    return (
      <SectionCard
        titleAr="مسار سجلات ذكاء الحلقات"
        errorMode={{ error: result.error }}
      />
    )
  }
  const d = result.data
  const totalEir = EPISODE_PHASE_ORDER.reduce(
    (a, p) => a + (d.countByPhase[p] ?? 0),
    0,
  )

  return (
    <SectionCard titleAr="مسار سجلات ذكاء الحلقات">
      {/* Phase counts grid. */}
      <div>
        <div className="mb-1 text-xs font-medium text-foreground">
          العدد حسب المرحلة
        </div>
        {totalEir === 0 ? (
          <InlineEmpty messageAr="لا يوجد نشاط في مسار الحلقات" />
        ) : (
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {EPISODE_PHASE_ORDER.map((p) => {
              const n = d.countByPhase[p] ?? 0
              return (
                <div
                  key={p}
                  className={`rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] ${
                    n > 0 ? "bg-muted/40" : "bg-transparent text-muted-foreground"
                  }`}
                >
                  <div className="font-mono">{p}</div>
                  <div className="text-end font-mono tabular-nums">
                    {n.toLocaleString("en-US")}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent transitions. */}
      <div className="border-t border-border/60 pt-2">
        <div className="mb-1 text-xs font-medium text-foreground">
          الانتقالات الأخيرة
        </div>
        {d.recentTransitions.length === 0 ? (
          <InlineEmpty messageAr="لا توجد انتقالات حديثة" />
        ) : (
          <ul className="space-y-1">
            {d.recentTransitions.map((e) => {
              const from = String(e.payload.from_phase ?? "—")
              const to = String(e.payload.to_phase ?? "—")
              return (
                <li
                  key={e.id}
                  className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5"
                >
                  <div className="flex flex-wrap items-baseline gap-2 text-[11px]">
                    <span className="font-mono text-muted-foreground tabular-nums">
                      {formatUtc(e.event_at)}
                    </span>
                    <span className="font-mono text-foreground">
                      {from} → {to}
                    </span>
                  </div>
                  {e.subject_id ? (
                    <div className="mt-0.5 break-words font-mono text-[10px] text-muted-foreground">
                      eir: {e.subject_id}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Invalid transition attempts. */}
      <div className="border-t border-border/60 pt-2">
        <div className="mb-1 text-xs font-medium text-foreground">
          محاولات الانتقال غير الصالحة (24 ساعة)
        </div>
        <KvRow
          labelAr="العدد"
          value={d.invalid_attempts_24h.toLocaleString("en-US")}
        />
        {d.most_recent_invalid_attempt_at ? (
          <KvRow
            labelAr="آخر محاولة"
            value={
              <>
                <span className="block">
                  {formatUtc(d.most_recent_invalid_attempt_at)}
                </span>
                <span className="block text-muted-foreground">
                  {humanizeAge(
                    takenAt.getTime() -
                      d.most_recent_invalid_attempt_at.getTime(),
                  )}
                </span>
              </>
            }
          />
        ) : (
          <InlineEmpty messageAr="لا توجد محاولات غير صالحة" />
        )}
      </div>
    </SectionCard>
  )
}
