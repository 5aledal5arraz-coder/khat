import { NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getJobSnapshot, getWorkerSnapshot } from "@/lib/jobs/status-service"
import type { JobStatusPayload } from "@/lib/jobs/status-view"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/jobs/status?jobId=<id>
 * GET /api/admin/jobs/status?key=<dedupe key>
 *
 * The one endpoint every background-job status card polls (useJobStatus). The
 * heavy work runs in the worker; this is a thin read: the job row (trimmed to
 * `JobSnapshot`) plus the worker's liveness from its own heartbeat, so the card
 * can say «عامل المهام لا يعمل» instead of spinning on a job nobody will claim.
 *
 * `key` re-attaches after a reload: it returns the in-flight job for that key,
 * or the latest one that finished in the last 30 minutes (a failure the
 * operator hasn't read must survive the reload). `job: null` = nothing to show.
 */
export async function GET(request: Request) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const url = new URL(request.url)
  const jobId = url.searchParams.get("jobId")
  const key = url.searchParams.get("key")
  if (!jobId && !key) {
    return NextResponse.json({ error: "jobId أو key مطلوب" }, { status: 400 })
  }

  const [job, worker] = await Promise.all([
    getJobSnapshot({ jobId, dedupeKey: key }),
    getWorkerSnapshot(),
  ])
  const body: JobStatusPayload = { job, worker }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
