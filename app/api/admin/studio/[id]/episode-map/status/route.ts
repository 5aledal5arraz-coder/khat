import { NextResponse } from "next/server"
import { getEpisodeMap } from "@/lib/studio"
import { getJob, findInFlightJobByPayload } from "@/lib/jobs"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * GET /api/admin/studio/[id]/episode-map/status?jobId=<id>
 *
 * The read side of the raw-episode time map. The heavy work runs in the worker
 * (POST .../episode-map enqueues it); this is the thin endpoint the UI polls.
 *
 * Always returns the currently-persisted `map` (so a session that already has a
 * map hydrates it on open, with no job in flight). When `jobId` is supplied it
 * also reports that job's status + error, so the poller can tell "still running"
 * apart from "failed" instead of spinning forever waiting for a map that will
 * never arrive.
 *
 * RE-ATTACH: the jobId lives only in the client's React state, so a page refresh
 * loses it. When the UI hydrates it calls this WITHOUT a jobId; if there's no
 * persisted map yet we look up the latest in-flight job for this session and
 * return its `{ jobId, jobStatus, progress, startedAt }` so the UI can resume
 * its progress bar instead of falling back to idle and re-triggering a duplicate
 * transcription (the whole reason the counter used to vanish on refresh).
 *
 * Reuses existing primitives only — `getJob` / `findInFlightJobByPayload`
 * (lib/jobs) + `getEpisodeMap` (lib/studio). No new persistence, and the POST
 * route it complements is untouched.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const jobId = new URL(request.url).searchParams.get("jobId")

  const map = await getEpisodeMap(id)

  // The job we report on: the one the client is actively polling (jobId given),
  // OR — on a fresh hydrate with no jobId and no saved map — the in-flight job
  // for this session, so a refresh re-attaches instead of orphaning the run.
  const job = jobId
    ? await getJob(jobId)
    : map
      ? null
      : await findInFlightJobByPayload("studio.episode_map", "sessionId", id)

  return NextResponse.json({
    map,
    jobId: job?.id ?? null,
    jobStatus: job?.status ?? null,
    jobError: job?.error_message ?? null,
    // Live progress heartbeat (stage / % / chunk / ETA) written by the running
    // handler — surfaced so the poller can render a determinate bar instead of a
    // bare elapsed counter. Null when there's no job or it hasn't reported yet.
    progress: job?.progress ?? null,
    // Job start time — lets the client resume its wall-clock elapsed counter
    // from when the run ACTUALLY started (the honest value) after a refresh.
    startedAt: job?.started_at ?? null,
  })
}
