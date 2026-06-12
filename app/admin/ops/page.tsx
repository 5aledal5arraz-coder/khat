/**
 * `/admin/ops` — the admin home: a unified command dashboard.
 *
 * Server component. Calls `takeOpsSnapshot()` server-side (no API
 * route). Top: greeting + headline stats derived from the snapshot +
 * quick links into the daily workflow. Below: the five operational
 * sections (queue, events, AI router, EIR pipeline, activity).
 *
 * Auth + RBAC: handled by the admin layout (cookie check + redirect).
 * Read-only — reload to refresh.
 */

import {
  Compass,
  Telescope,
  PlayCircle,
  Mic,
  Mail,
  Inbox,
  ListChecks,
  Skull,
  Cpu,
  CircleDollarSign,
} from "lucide-react"
import { takeOpsSnapshot } from "@/lib/ops/snapshot"
import { StatCard, QuickLink } from "../components/ui-kit"
import { PageHeader } from "./_components/page-header"
import { QueueHealthSection } from "./_components/queue-health-section"
import { SystemEventsSection } from "./_components/system-events-section"
import { AiRouterSection } from "./_components/ai-router-section"
import { EirPipelineSection } from "./_components/eir-pipeline-section"
import { RecentActivitySection } from "./_components/recent-activity-section"

// Snapshot freshness matters more than caching — force dynamic render
// so each browser reload reflects the current DB state.
export const dynamic = "force-dynamic"

export default async function OpsDashboardPage() {
  const snap = await takeOpsSnapshot()

  // Headline numbers — every section is a SectionResult union, so each
  // stat degrades to "—" when its section failed rather than breaking
  // the page.
  const queue = snap.queue.ok ? snap.queue.data : null
  const ai = snap.aiRouter.ok ? snap.aiRouter.data : null

  const activeJobs = queue
    ? (queue.countsByStatus.pending ?? 0) + (queue.countsByStatus.running ?? 0)
    : null
  const deadJobs = queue ? queue.recentDead.length : null
  const aiSucceeded = ai ? (ai.ai_runs_status_counts_24h.succeeded ?? 0) : null
  const aiFailed = ai
    ? (ai.ai_runs_status_counts_24h.failed ?? 0) +
      (ai.ai_runs_status_counts_24h.timed_out ?? 0)
    : null
  const aiCost = ai
    ? Object.values(ai.tiers).reduce((s, t) => s + (t.daily_cost_usd ?? 0), 0)
    : null

  return (
    <div dir="rtl" lang="ar">
      <PageHeader takenAt={snap.taken_at} durationMs={snap.duration_ms} />

      {/* Headline stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="مهام نشطة"
          value={activeJobs ?? "—"}
          icon={ListChecks}
          tone={activeJobs && activeJobs > 0 ? "gold" : "default"}
          hint="قيد الانتظار + قيد التنفيذ"
        />
        <StatCard
          label="مهام متعثّرة"
          value={deadJobs ?? "—"}
          icon={Skull}
          tone={deadJobs && deadJobs > 0 ? "danger" : "success"}
          hint="آخر ٢٤ ساعة"
        />
        <StatCard
          label="استدعاءات الذكاء الاصطناعي"
          value={aiSucceeded ?? "—"}
          icon={Cpu}
          tone={aiFailed && aiFailed > 0 ? "warning" : "default"}
          hint={
            aiFailed !== null
              ? aiFailed > 0
                ? `${aiFailed} فشل خلال ٢٤ ساعة`
                : "بلا أخطاء خلال ٢٤ ساعة"
              : undefined
          }
        />
        <StatCard
          label="كلفة الذكاء الاصطناعي اليوم"
          value={aiCost !== null ? `$${aiCost.toFixed(2)}` : "—"}
          icon={CircleDollarSign}
          tone="purple"
          hint="مجموع المستويين"
        />
      </div>

      {/* Daily workflow quick links */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <QuickLink href="/admin/khat-brain/seasons" icon={Compass} label="المواسم" description="تخطيط وتوليد" tone="gold" />
        <QuickLink href="/admin/discovery-v2" icon={Telescope} label="اكتشاف الضيوف" description="بحث ذكي" tone="purple" />
        <QuickLink href="/admin/khat-brain/episodes" icon={PlayCircle} label="الحلقات" description="خط الإنتاج" tone="default" />
        <QuickLink href="/admin/studio" icon={Mic} label="الاستديو" description="معالجة المحتوى" tone="default" />
        <QuickLink href="/admin/newsletter" icon={Mail} label="النشرة" description="حملات بريدية" tone="default" />
        <QuickLink href="/admin/submissions" icon={Inbox} label="الطلبات" description="وارد الموقع" tone="default" />
      </div>

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
