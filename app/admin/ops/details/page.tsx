/**
 * `/admin/ops/details` — the full operational telemetry view.
 *
 * This is the deep "ops console": the five dense sections that used to
 * live on the `/admin/ops` home (queue & worker health, system events,
 * AI router & rate-limit, the EIR pipeline, and the raw activity feed).
 * They were moved off the home so the home can stay a calm launchpad;
 * this page keeps every metric an operator relies on, one click away.
 *
 * Server component. Calls the SAME `takeOpsSnapshot()` the home calls —
 * no new data layer. Read-only; reload to refresh. The sections recolor
 * to the admin light surface via the design tokens they already read.
 */

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { takeOpsSnapshot } from "@/lib/ops/snapshot"
import { formatUtc } from "@/lib/ops/format"
import { QueueHealthSection } from "../_components/queue-health-section"
import { SystemEventsSection } from "../_components/system-events-section"
import { AiRouterSection } from "../_components/ai-router-section"
import { EirPipelineSection } from "../_components/eir-pipeline-section"
import { RecentActivitySection } from "../_components/recent-activity-section"

export const dynamic = "force-dynamic"

export default async function OpsDetailsPage() {
  const snap = await takeOpsSnapshot()

  return (
    <div dir="rtl" lang="ar">
      {/* Hero with a back link to the calm home. */}
      <header className="mb-8">
        <Link
          href="/admin/ops"
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          العودة إلى مركز التشغيل
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
              تفاصيل التشغيل
            </h1>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground">
              المؤشّرات الكاملة — الطابور والعمال، أحداث النظام، موجّه الذكاء
              الاصطناعي، ومسار الحلقات
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-[11.5px] text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <span className="admin-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="font-mono tabular-nums">{formatUtc(snap.taken_at)}</span>
            <span>•</span>
            <span className="font-mono tabular-nums">{snap.duration_ms}ms</span>
          </div>
        </div>
      </header>

      {/* The five operational sections — recolored light by scoped tokens. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <QueueHealthSection result={snap.queue} />
        <SystemEventsSection result={snap.systemEvents} />
        <AiRouterSection result={snap.aiRouter} />
        <EirPipelineSection result={snap.eirPipeline} takenAt={snap.taken_at} />
        <RecentActivitySection result={snap.recentActivity} />
      </div>
    </div>
  )
}
