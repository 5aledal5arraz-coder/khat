/**
 * `/admin` lands on the Operational dashboard (`/admin/ops`).
 *
 * Phase B1 — the operator's daily-first surface is the ops snapshot
 * (system health, queue depth, AI-degraded state). The Khat Brain
 * Command Center remains one click away via the sidebar; this page
 * stays a thin redirect-only stub.
 *
 * History: prior to B1 this redirected to `/admin/khat-brain`. The
 * change reflects the "calm daily operating" priority from the
 * launch-readiness audit — operators start on observability, not on
 * planning. `smoke-khat-brain-ux1` Case 5 is updated in lockstep.
 */

import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function AdminRootPage() {
  redirect("/admin/ops")
}
