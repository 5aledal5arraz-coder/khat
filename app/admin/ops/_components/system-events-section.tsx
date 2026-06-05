/**
 * Phase 2.5 (P2.5.b) — Section 2: System Events Overview (24h).
 *
 * Source × severity matrix + top 5 warn/error events. Sources +
 * severity + event_type values stay English as enum identifiers.
 */

import { formatUtc, severityClass, truncate } from "@/lib/ops/format"
import type { SystemEventsOverview, SectionResult } from "@/lib/ops/snapshot"
import { InlineEmpty, SectionCard } from "./section-card"

const SEVERITIES = ["info", "warn", "error"] as const
const SOURCES = [
  "eir",
  "jobs",
  "ai-router",
  "rate-limit",
  "sweeper",
  "schedule",
] as const

export function SystemEventsSection({
  result,
}: {
  result: SectionResult<SystemEventsOverview>
}) {
  if (!result.ok) {
    return (
      <SectionCard
        titleAr="نظرة عامة على أحداث النظام (24 ساعة)"
        errorMode={{ error: result.error }}
      />
    )
  }
  const d = result.data

  // Build a quick lookup from the sparse matrix.
  const cell: Record<string, number> = {}
  for (const r of d.matrix) cell[`${r.source}|${r.severity}`] = r.count

  return (
    <SectionCard titleAr="نظرة عامة على أحداث النظام (24 ساعة)">
      {d.grand_total === 0 ? (
        <InlineEmpty messageAr="لا توجد أحداث خلال آخر 24 ساعة" />
      ) : (
        <>
          {/* Source × severity matrix. */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="py-1 text-start font-medium">المصدر</th>
                  {SEVERITIES.map((s) => (
                    <th
                      key={s}
                      className="px-2 py-1 text-end font-medium font-mono"
                    >
                      {s}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-end font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((src) => {
                  const row = SEVERITIES.map((sev) => cell[`${src}|${sev}`] ?? 0)
                  const rowTotal = row.reduce((a, b) => a + b, 0)
                  if (rowTotal === 0) return null
                  return (
                    <tr key={src} className="border-b border-border/30">
                      <td className="py-1 text-start font-mono">{src}</td>
                      {row.map((n, i) => (
                        <td key={i} className="px-2 py-1 text-end">
                          {n.toLocaleString("en-US")}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-end font-medium">
                        {rowTotal.toLocaleString("en-US")}
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t border-border font-medium">
                  <td className="py-1 text-start">المجموع الكلي</td>
                  <td
                    colSpan={SEVERITIES.length + 1}
                    className="px-2 py-1 text-end"
                  >
                    {d.grand_total.toLocaleString("en-US")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Top errors. */}
          <div className="border-t border-border/60 pt-2">
            <div className="mb-1 text-xs font-medium text-foreground">
              أبرز الأحداث الحرجة
            </div>
            {d.topErrors.length === 0 ? (
              <InlineEmpty messageAr="لا يوجد" />
            ) : (
              <ul className="space-y-1.5">
                {d.topErrors.map((e) => {
                  const subject =
                    e.subject_kind && e.subject_id
                      ? `${e.subject_kind}:${e.subject_id}`
                      : "—"
                  const payloadPreview = truncate(
                    JSON.stringify(e.payload),
                    60,
                  )
                  return (
                    <li
                      key={e.id}
                      className="rounded border border-border/60 bg-muted/30 px-2 py-1"
                    >
                      <div className="flex flex-wrap items-baseline gap-2 text-[11px]">
                        <span className="font-mono text-muted-foreground tabular-nums">
                          {formatUtc(e.event_at)}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${severityClass(e.severity)}`}
                        >
                          {e.severity}
                        </span>
                        <span className="font-mono text-foreground">
                          {e.source}.{e.event_type}
                        </span>
                        <span className="text-muted-foreground">{subject}</span>
                      </div>
                      <div className="mt-0.5 break-words font-mono text-[10px] text-muted-foreground">
                        {payloadPreview}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </SectionCard>
  )
}
