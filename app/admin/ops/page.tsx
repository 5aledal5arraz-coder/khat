/**
 * Phase 2.5 (P2.5.b) — `/admin/ops` operational dashboard.
 *
 * Server component. Calls `takeOpsSnapshot()` server-side (no API
 * route, per operator §4 of P2.5 plan). Renders 5 read-only sections.
 *
 * Auth + RBAC: handled by the existing admin layout — the parent
 * `app/admin/layout.tsx` verifies the `__admin_session` cookie and
 * redirects to /admin/login on failure. Minimum role: VIEWER.
 *
 * No interactivity. No mutations. No polling. Reload to refresh.
 */

import { takeOpsSnapshot } from "@/lib/ops/snapshot"
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

  return (
    <div dir="rtl" lang="ar" className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <PageHeader takenAt={snap.taken_at} durationMs={snap.duration_ms} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QueueHealthSection result={snap.queue} />
        <SystemEventsSection result={snap.systemEvents} />
        <AiRouterSection result={snap.aiRouter} />
        <EirPipelineSection
          result={snap.eirPipeline}
          takenAt={snap.taken_at}
        />
        <RecentActivitySection result={snap.recentActivity} />
      </div>
    </div>
  )
}
