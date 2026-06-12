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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            مركز التشغيل
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            نبض المنظومة كاملة في شاشة واحدة — حدّث المتصفح لتحديث اللقطة
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="admin-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
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
      </div>
    </header>
  )
}
