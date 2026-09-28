"use server"

/**
 * «أعد المحاولة» on a background-job status card — re-enqueue a FINISHED job
 * with exactly the payload it ran with (same type, same dedupe key, same
 * attempts budget and priority). One action for every card, so a retry can
 * never drift from what the original click asked for (a course-format
 * regeneration retries as a course, a force transcription retries forced).
 *
 * Only the slow-AI job types the admin UI shows are retryable here — never an
 * arbitrary job id (a newsletter send, a scheduler tick). If a run for the
 * same key is already in flight, the retry attaches to it instead of paying
 * twice (enqueueJobOnce).
 */

import { requireActionRole } from "@/lib/api-utils"
import { enqueueJobOnce, getJob } from "@/lib/jobs/queue"
import { PREP_GENERATE_V2_JOB } from "@/lib/jobs/prep-jobs"
import {
  SEASON_BATCH_GENERATE_JOB,
  SEASON_HYBRID_GENERATE_JOB,
} from "@/lib/jobs/season-jobs"
import { ORIGINAL_GENERATE_TOPICS_JOB } from "@/lib/jobs/original-jobs"
import { STUDIO_TRANSCRIBE_JOB } from "@/lib/jobs/studio-transcribe-jobs"

const RETRYABLE_TYPES = new Set<string>([
  PREP_GENERATE_V2_JOB,
  SEASON_HYBRID_GENERATE_JOB,
  SEASON_BATCH_GENERATE_JOB,
  ORIGINAL_GENERATE_TOPICS_JOB,
  STUDIO_TRANSCRIBE_JOB,
])

export interface RetryJobResult {
  ok: boolean
  message: string
  jobId?: string
  alreadyRunning?: boolean
}

export async function retryJobAction(jobId: string): Promise<RetryJobResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  try {
    const job = await getJob(jobId)
    if (!job) return { ok: false, message: "المهمة غير موجودة." }
    if (!RETRYABLE_TYPES.has(job.type) || !job.dedupe_key) {
      return { ok: false, message: "لا يمكن إعادة هذه المهمة من هنا." }
    }
    if (job.status === "pending" || job.status === "running") {
      return { ok: true, message: "المهمة ما زالت قائمة.", jobId: job.id, alreadyRunning: true }
    }
    const q = await enqueueJobOnce(job.type, job.payload, {
      dedupeKey: job.dedupe_key,
      maxAttempts: job.max_attempts,
      priority: job.priority,
    })
    return {
      ok: true,
      message: q.alreadyRunning ? "تشغيل آخر لنفس المهمة جارٍ — نعرض حالته." : "أُعيدت المهمة إلى الطابور.",
      jobId: q.job.id,
      alreadyRunning: q.alreadyRunning,
    }
  } catch (err) {
    console.error("[retryJobAction]", err)
    return { ok: false, message: "تعذّر إعادة جدولة المهمة. أعد المحاولة بعد قليل." }
  }
}
