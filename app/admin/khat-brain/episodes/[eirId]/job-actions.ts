"use server"

/**
 * UX-5.4 — Workspace-native job triggers.
 *
 * Each action wraps an existing primitive that previously was reachable
 * only from a CLI script:
 *
 *   regeneratePrepV2Action       → enqueue `prep.generate_v2` (the worker runs
 *                                  runPrepV2Pipeline; this returns a jobId)
 *   recomputePerformanceAction   → analyzeEirPerformance()
 *   refreshYoutubePerformanceAction → enqueueJob("youtube.refresh_performance")
 *
 * No new logic — just admin-gated wrappers + revalidatePath so the
 * workspace tab reflects the new state on the next render.
 */

import { revalidatePath } from "next/cache"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { episodes as episodesTable } from "@/lib/db/schema/episodes"
import { requireActionRole } from "@/lib/api-utils"
import { enqueuePrepV2Generation } from "@/lib/preparation/v2/enqueue"
import {
  ROOM_LIVE_REGENERATION_MESSAGE,
  hasActiveRecordingForPreparation,
} from "@/lib/recording-v2/live-guard"
import {
  coerceCourseTargetChoice,
  coercePrepFormat,
} from "@/lib/preparation/v2/format"
import { analyzeEirPerformance } from "@/lib/khat-brain/performance-learning"
import { enqueueJob } from "@/lib/jobs"

function extractYoutubeId(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0]
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
    }
    if (u.hostname.endsWith("youtube.com")) {
      const v = u.searchParams.get("v")
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v
      const m = u.pathname.match(/\/(?:embed|v|shorts)\/([A-Za-z0-9_-]{11})/)
      if (m) return m[1]
    }
    return null
  } catch {
    return null
  }
}

export interface JobActionResult {
  ok: boolean
  message: string
  /** Set when the action ENQUEUED work — the UI watches this job. */
  jobId?: string
  /** The job was already in flight (a second click attached to it). */
  alreadyRunning?: boolean
}

// ─── Prep V2 regeneration ────────────────────────────────────────────

export async function regeneratePrepV2Action(
  eirId: string,
  /** "story" (default) | "course". Untrusted client input — coerced. */
  formatInput?: string,
  /**
   * Course only — explicit length in minutes. Untrusted: only a value in
   * COURSE_TARGET_CHOICES survives; anything else means "auto from the goal".
   */
  targetMinutes?: unknown,
): Promise<JobActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  if (!db) return { ok: false, message: "قاعدة البيانات غير متوفرة." }

  const [prep] = await db
    .select({ id: episodePreparations.id })
    .from(episodePreparations)
    .where(eq(episodePreparations.eir_id, eirId))
    .orderBy(desc(episodePreparations.updated_at))
    .limit(1)
  if (!prep) {
    return {
      ok: false,
      message: "لا يوجد سجلّ إعداد مرتبط بهذه الحلقة.",
    }
  }

  // The live-recording guard, checked up front so a refusal is instant and
  // costs nothing. The pipeline checks again when the job starts AND at write
  // time (a take can start while it is queued) — the job then completes with
  // this same message as its result, never as a retry.
  if (await hasActiveRecordingForPreparation(prep.id)) {
    return { ok: false, message: ROOM_LIVE_REGENERATION_MESSAGE }
  }

  try {
    const format = coercePrepFormat(formatInput)
    const q = await enqueuePrepV2Generation({
      preparationId: prep.id,
      eirId,
      language: "ar",
      force: true,
      format,
      targetMinutes: coerceCourseTargetChoice(targetMinutes),
      trigger: "regenerate",
      requestedBy: gate.user.id,
    })
    revalidatePath(`/admin/khat-brain/episodes/${eirId}`)
    return {
      ok: true,
      message: q.alreadyRunning
        ? attachedRunMessage(q.job.payload, format)
        : "بدأ توليد الإعداد في الخلفية.",
      jobId: q.job.id,
      alreadyRunning: q.alreadyRunning,
    }
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `تعذّر جدولة توليد الإعداد: ${err.message}`
          : "تعذّر جدولة توليد الإعداد.",
    }
  }
}

/**
 * A regeneration clicked while another generation for the same prep is in
 * flight ATTACHES to it (one dedupe key per prep — two runs would race to
 * overwrite each other and pay twice). The operator must not think their
 * format/length choice is what's running: say which run it is, and what to do.
 */
function attachedRunMessage(
  running: Record<string, unknown>,
  requestedFormat: string | undefined,
): string {
  const runningFormat = running.format === "course" ? "course" : "story"
  const label = (f: string) => (f === "course" ? "دورة مصغّرة" : "قصة")
  const origin = running.trigger === "regenerate" ? "إعادة توليد سابقة" : "تحويل الحلقة إلى الإعداد"
  const differs = (requestedFormat ?? "story") !== runningFormat
  return (
    `لم تُبدأ عملية جديدة: توليد جارٍ بالفعل لهذا الإعداد (من ${origin}، بصيغة «${label(runningFormat)}») — نعرض لك حالته.` +
    (differs || running.targetMinutes
      ? ` بعد اكتماله أعد التوليد إذا أردت صيغة «${label(requestedFormat ?? "story")}» أو مدة مختلفة.`
      : "")
  )
}

// ─── Performance recompute (analyzeEirPerformance) ───────────────────

export async function recomputePerformanceAction(
  eirId: string,
): Promise<JobActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  if (!db) return { ok: false, message: "قاعدة البيانات غير متوفرة." }

  try {
    const r = await analyzeEirPerformance(eirId)
    revalidatePath(`/admin/khat-brain/episodes/${eirId}`)
    if (!r.ok) {
      return {
        ok: false,
        message:
          r.reason === "no snapshots"
            ? "لا توجد لقطات أداء بعد. شغّل «تحديث بيانات الأداء» أولاً."
            : r.reason === "EIR not found"
              ? "لم يُعثر على EIR."
              : `لا تكفي البيانات لاحتساب الإشارة (${r.reason ?? "—"}).`,
      }
    }
    return { ok: true, message: "تم احتساب الإشارة التحريرية." }
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "تعذّر إعادة حساب الأداء.",
    }
  }
}

// ─── YouTube performance refresh (enqueue job) ───────────────────────

export async function refreshYoutubePerformanceAction(
  eirId: string,
): Promise<JobActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  if (!db) return { ok: false, message: "قاعدة البيانات غير متوفرة." }

  const [row] = await db
    .select({
      episode_id: episodesTable.id,
      youtube_url: episodesTable.youtube_url,
    })
    .from(episodesTable)
    .where(eq(episodesTable.eir_id, eirId))
    .limit(1)
  if (!row) {
    return {
      ok: false,
      message: "لا توجد حلقة مربوطة بهذا EIR.",
    }
  }
  const videoId = extractYoutubeId(row.youtube_url)
  if (!videoId) {
    return {
      ok: false,
      message: "الحلقة لا تملك رابط YouTube صالحاً.",
    }
  }

  try {
    const job = await enqueueJob("youtube.refresh_performance", {
      eir_id: eirId,
      episode_id: row.episode_id,
      video_id: videoId,
    })
    revalidatePath(`/admin/khat-brain/episodes/${eirId}`)
    return {
      ok: true,
      message: `تمت جدولة لقطة جديدة (job ${job.id.slice(0, 8)}). ستظهر بعد دورة العامل.`,
    }
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "تعذّر جدولة المهمة.",
    }
  }
}
