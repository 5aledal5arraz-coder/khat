import { NextRequest } from "next/server"
import { requireAdminAPI, successResponse } from "@/lib/api-utils"
import { getJob, findInFlightJobByPayload } from "@/lib/jobs"
import { CANDIDATE_ANALYZE_JOB } from "@/lib/jobs/candidate-jobs"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/admin/guest-candidates/[id]/analyze/status?jobId=<id>
 *
 * Thin poll endpoint for the candidate-analysis job (POST .../analyze enqueues
 * it). Reports the job's status + error so the poller can tell "still running"
 * apart from "failed". The analysis result itself lands on the candidate row —
 * the UI calls router.refresh() on completion rather than reading it here.
 *
 * RE-ATTACH: the jobId lives only in React state, so a page refresh loses it.
 * Called WITHOUT a jobId, we look up the latest in-flight analysis job for this
 * candidate and return it, so a refreshed tab resumes its "جاري التحليل" state
 * instead of falling back to idle.
 */
export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth

  const { id } = await ctx.params
  const jobId = new URL(request.url).searchParams.get("jobId")

  const job = jobId
    ? await getJob(jobId)
    : await findInFlightJobByPayload(CANDIDATE_ANALYZE_JOB, "candidateId", id)

  return successResponse({
    jobId: job?.id ?? null,
    jobStatus: job?.status ?? null,
    jobError: job?.error_message ?? null,
    startedAt: job?.started_at ?? null,
  })
}
