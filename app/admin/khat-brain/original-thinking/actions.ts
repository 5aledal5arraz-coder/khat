"use server"

import { revalidatePath } from "next/cache"
import {
  markOriginalTopicConsumed,
  expireOldOriginalTopics,
} from "@/lib/original-thinking/bank"
import { requireActionRole } from "@/lib/api-utils"
import { enqueueJobOnce } from "@/lib/jobs/queue"
import {
  ORIGINAL_GENERATE_TOPICS_JOB,
  originalTopicsDedupeKey,
} from "@/lib/jobs/original-jobs"

export interface GenerateActionResult {
  /** The job was queued (or was already running). The generation's own outcome is the job's result. */
  ok: boolean
  message: string
  jobId?: string
  alreadyRunning?: boolean
}

/**
 * «إنشاء ١٠ مواضيع جديدة» — enqueue `original.generate_topics` and return its
 * jobId in milliseconds. The generator (one long editorial AI call over the
 * corpus) runs in the worker; it used to run right here, behind nginx's 120s
 * cut. The button's status card watches the job and shows the tally.
 */
export async function generateOriginalTopicsAction(
  language: "ar" | "en" = "ar",
  count: number = 10,
): Promise<GenerateActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  try {
    const q = await enqueueJobOnce(
      ORIGINAL_GENERATE_TOPICS_JOB,
      { language, count },
      {
        dedupeKey: originalTopicsDedupeKey(language),
        maxAttempts: 1,
        priority: 10,
      },
    )
    return {
      ok: true,
      message: q.alreadyRunning
        ? "توليد المواضيع جارٍ بالفعل — نعرض لك حالته."
        : "بدأ توليد المواضيع في الخلفية.",
      jobId: q.job.id,
      alreadyRunning: q.alreadyRunning,
    }
  } catch (err) {
    console.error("[generateOriginalTopicsAction] enqueue failed:", err)
    return { ok: false, message: "تعذّر جدولة توليد المواضيع. أعد المحاولة بعد قليل." }
  }
}

export async function markConsumedAction(id: string): Promise<{ ok: boolean }> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false }
  const ok = await markOriginalTopicConsumed(id)
  revalidatePath("/admin/khat-brain/original-thinking")
  return { ok }
}

export async function expireOldAction(): Promise<{
  ok: boolean
  expired: number
  error?: string
}> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, expired: 0, error: gate.error }
  const r = await expireOldOriginalTopics()
  revalidatePath("/admin/khat-brain/original-thinking")
  return { ok: true, expired: r.expired }
}
