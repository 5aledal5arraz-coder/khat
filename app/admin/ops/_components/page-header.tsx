/**
 * Phase 2.5 (P2.5.b) — Ops dashboard page header.
 *
 * Top strip rendered once per page. Shows the title, the snapshot
 * timestamp in fixed UTC, the snapshot wall-clock duration, and an
 * Arabic refresh hint. No interactivity.
 */

import { formatUtc } from "@/lib/ops/format"

interface PageHeaderProps {
  takenAt: Date
  durationMs: number
}

export function PageHeader({ takenAt, durationMs }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-bold text-foreground">لوحة العمليات</h1>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          آخر تحديث:{" "}
          <span className="font-mono text-foreground tabular-nums">
            {formatUtc(takenAt)}
          </span>
        </span>
        <span>
          المدة:{" "}
          <span className="font-mono text-foreground tabular-nums">
            {durationMs} ms
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        لقطة لحظية للنظام — اضغط تحديث المتصفح لتحديث البيانات
      </p>
    </header>
  )
}
