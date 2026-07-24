import { NextRequest } from "next/server"
import {
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import { enqueueJob, findInFlightJobByPayload } from "@/lib/jobs"
import {
  CANDIDATE_ANALYZE_JOB,
  type CandidateAnalyzeJobPayload,
} from "@/lib/jobs/candidate-jobs"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/admin/guest-candidates/[id]/analyze
 *
 * Enqueues the candidate profile-analysis job and returns its jobId immediately
 * (202). The editorial AI call runs in the worker — never inline — so it can't
 * cross the nginx 120s wall. The UI polls .../analyze/status?jobId for the
 * result; the analysis is persisted onto the candidate row by the handler.
 *
 * DEDUP: a double-click (or refresh-then-click) must not spawn a second analysis
 * for the same candidate. If a non-terminal job is already in flight we adopt it
 * (200 `alreadyRunning`) instead of enqueuing again.
 *
 * Requires the worker (`npm run worker` / `npm run dev:all`); without it the job
 * sits pending forever.
 */
export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params

  const inFlight = await findInFlightJobByPayload(CANDIDATE_ANALYZE_JOB, "candidateId", id)
  if (inFlight) {
    return successResponse({ jobId: inFlight.id, status: inFlight.status, alreadyRunning: true }, 200)
  }

  const payload: CandidateAnalyzeJobPayload = { candidateId: id }
  const job = await enqueueJob(CANDIDATE_ANALYZE_JOB, payload)
  return successResponse({ jobId: job.id, status: job.status }, 202)
}
