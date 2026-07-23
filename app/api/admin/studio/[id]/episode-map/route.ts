import { NextResponse } from "next/server"
import { getStudioSession } from "@/lib/studio"
import { enqueueJob, findInFlightJobByPayload } from "@/lib/jobs/queue"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * POST /api/admin/studio/[id]/episode-map
 *
 * Enqueues the raw-episode TIME MAP job and returns its jobId immediately.
 * The heavy work (whisper-1 timestamped transcription of a full recording +
 * ffmpeg break detection + the analysis call) runs in the worker — this route
 * NEVER runs the AI inline, which is the whole point of the queue for
 * minutes-long work. Poll the job (or the transcript record) for the result.
 *
 * DEDUP: a refresh-then-click (or a double click) must not spawn a second job
 * re-transcribing the same audio — wasted cost + confusion. Before enqueuing we
 * check for a non-terminal job already in flight for THIS session and, if one
 * exists, return it (200 `alreadyRunning`) so the UI just adopts that jobId.
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
  // Fail fast on a doomed job — the handler needs uploaded raw audio.
  if (!session.audio_filename) {
    return NextResponse.json(
      { error: "لا يوجد ملف صوتي مرفوع لهذه الجلسة" },
      { status: 400 },
    )
  }

  // Dedup: adopt an already-running job for this session instead of enqueuing a
  // second one (refresh-then-click / double click).
  const inFlight = await findInFlightJobByPayload("studio.episode_map", "sessionId", id)
  if (inFlight) {
    return NextResponse.json(
      { jobId: inFlight.id, status: inFlight.status, alreadyRunning: true },
      { status: 200 },
    )
  }

  const job = await enqueueJob("studio.episode_map", { sessionId: id })

  return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 })
}
