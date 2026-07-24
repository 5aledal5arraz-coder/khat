import { NextRequest } from "next/server"
import { requireAdminAPI, successResponse } from "@/lib/api-utils"
import { getJob, findInFlightJobByPayload } from "@/lib/jobs"
import {
  CANDIDATE_OUTREACH_GENERATE_JOB,
  type CandidateOutreachJobResult,
} from "@/lib/jobs/candidate-jobs"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/admin/guest-candidates/[id]/outreach/status?jobId=<id>
 *
 * Thin poll endpoint for the outreach-draft job (POST .../outreach action=generate
 * enqueues it). Reports job status/error, and — on success — the persisted draft
 * (subject + body) so the UI can drop it straight into the draft editor. The
 * draft is ALSO saved as a version row, so it survives even if the client never
 * reads this back.
 *
 * RE-ATTACH: called WITHOUT a jobId (page refresh lost the React-state jobId), we
 * return the latest in-flight generation job for this candidate so the UI resumes
 * its "جاري التوليد" state.
 */
export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth

  const { id } = await ctx.params
  const jobId = new URL(request.url).searchParams.get("jobId")

  const job = jobId
    ? await getJob(jobId)
    : await findInFlightJobByPayload(CANDIDATE_OUTREACH_GENERATE_JOB, "candidateId", id)

  const result = (job?.status === "succeeded" ? job.result : null) as
    | CandidateOutreachJobResult
    | null

  return successResponse({
    jobId: job?.id ?? null,
    jobStatus: job?.status ?? null,
    jobError: job?.error_message ?? null,
    startedAt: job?.started_at ?? null,
    draft: result
      ? { subject_line: result.subject_line, message_body: result.message_body }
      : null,
  })
}
