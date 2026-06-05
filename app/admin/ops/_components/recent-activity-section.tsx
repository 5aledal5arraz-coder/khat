/**
 * Phase 2.5 (P2.5.b) — Section 5: Recent Activity Feed.
 *
 * Last 20 events across all sources. Full-width on lg screens. Stacks
 * to a single column on mobile.
 */

import { formatUtc, severityClass, truncate } from "@/lib/ops/format"
import type {
  RecentActivity,
  SectionResult,
} from "@/lib/ops/snapshot"
import { InlineEmpty, SectionCard } from "./section-card"

export function RecentActivitySection({
  result,
}: {
  result: SectionResult<RecentActivity>
}) {
  if (!result.ok) {
    return (
      <SectionCard
        titleAr="النشاط الأخير"
        subtitleAr="آخر 20 حدثًا عبر جميع المصادر"
        fullWidth
        errorMode={{ error: result.error }}
      />
    )
  }
  const events = result.data.events

  return (
    <SectionCard
      titleAr="النشاط الأخير"
      subtitleAr="آخر 20 حدثًا عبر جميع المصادر"
      fullWidth
    >
      {events.length === 0 ? (
        <InlineEmpty messageAr="لا يوجد نشاط حديث" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="py-1 text-start font-medium">الوقت</th>
                <th className="px-2 py-1 text-start font-medium">الخطورة</th>
                <th className="px-2 py-1 text-start font-medium">المصدر</th>
                <th className="px-2 py-1 text-start font-medium">الموضوع</th>
                <th className="px-2 py-1 text-start font-medium">المنفّذ</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const subject =
                  e.subject_kind && e.subject_id
                    ? `${e.subject_kind}:${truncate(e.subject_id, 20)}`
                    : "—"
                return (
                  <tr
                    key={e.id}
                    className="border-b border-border/30 align-baseline"
                  >
                    <td className="py-1 text-start font-mono text-muted-foreground">
                      {formatUtc(e.event_at)}
                    </td>
                    <td className="px-2 py-1 text-start">
                      <span
                        className={`rounded px-1 py-0.5 text-[10px] font-mono ${severityClass(e.severity)}`}
                      >
                        {e.severity}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-start font-mono">
                      {e.source}.{e.event_type}
                    </td>
                    <td className="px-2 py-1 text-start font-mono text-muted-foreground break-words">
                      {subject}
                    </td>
                    <td className="px-2 py-1 text-start font-mono text-muted-foreground">
                      {truncate(e.actor, 24)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}
