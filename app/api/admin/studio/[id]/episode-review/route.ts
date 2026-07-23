import { NextResponse } from "next/server"
import {
  getStudioSession,
  getProjectByEditedSession,
  getEpisodeMap,
  getTimedSegments,
} from "@/lib/studio"
import { enqueueJob, findInFlightJobByPayload } from "@/lib/jobs/queue"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * POST /api/admin/studio/[id]/episode-review
 *
 * Enqueues the Phase-2 EDIT REVIEW job for a linked EDITED session and returns
 * its jobId immediately. The heavy work (whisper-1 timestamped transcription of
 * the full edited recording + the deterministic verdict) runs in the worker —
 * this route NEVER runs the AI inline. Poll the status endpoint (or the job)
 * for the result.
 *
 * Fails fast on the doomed cases so the UI gets a clear 400 instead of a job
 * that dies in the worker: the session must be the edited session of a project,
 * that project's RAW Phase-1 (map + timed segments) must be complete, and the
 * edited audio must be uploaded. The handler re-checks all of these (the route
 * check is a snapshot; the handler is correct on its own).
 *
 * Requires the worker to be running (`npm run worker` / `npm run dev:all`);
 * without it the job sits pending forever.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params

  const session = await getStudioSession(id)
  if (!session) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }
  if (!session.audio_filename) {
    return NextResponse.json(
      { error: "لا يوجد ملف صوتي معدّل مرفوع لهذه الجلسة" },
      { status: 400 },
    )
  }

  // Must be the EDITED session of a project — the review compares against the
  // project's raw Phase-1 artifacts.
  const project = await getProjectByEditedSession(id)
  if (!project || !project.raw_session_id) {
    return NextResponse.json(
      { error: "هذه الجلسة ليست نسخة معدّلة مرتبطة بمشروع" },
      { status: 400 },
    )
  }

  // Raw Phase-1 (map + timed segments) must be complete before we can review.
  const [map, rawTimed] = await Promise.all([
    getEpisodeMap(project.raw_session_id),
    getTimedSegments(project.raw_session_id),
  ])
  if (!map || !rawTimed || rawTimed.segments.length === 0) {
    return NextResponse.json(
      { error: "لم تكتمل المرحلة الأولى (الخريطة الزمنية) للتسجيل الأصلي بعد" },
      { status: 400 },
    )
  }

  // Dedup: adopt an already-running review job for this edited session instead
  // of enqueuing a second one (refresh-then-click / double click). Checked after
  // the fail-fast guards so a doomed session still gets its clear 400.
  const inFlight = await findInFlightJobByPayload(
    "studio.episode_review",
    "editedSessionId",
    id,
  )
  if (inFlight) {
    return NextResponse.json(
      { jobId: inFlight.id, status: inFlight.status, alreadyRunning: true },
      { status: 200 },
    )
  }

  const job = await enqueueJob("studio.episode_review", { editedSessionId: id })

  return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 })
}
