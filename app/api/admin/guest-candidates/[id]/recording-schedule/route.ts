/**
 * POST /api/admin/guest-candidates/:id/recording-schedule
 *
 * Sets (or clears) the RECORDING date/time on the candidate's linked
 * production EIR. This is the internal filming schedule — NOT publish
 * (publish lives on episodes.release_date / scheduled_for). Admin-only;
 * never surfaced on any public page.
 *
 * Requires the candidate to already be in production (has a linked EIR) —
 * i.e. it was promoted via "نقل للإنتاج" first.
 *
 * Minimum admin role: EDITOR.
 */

import { NextRequest } from "next/server"
import { revalidatePath } from "next/cache"

import {
  errorResponse,
  requireRole,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import { db } from "@/lib/db"
import { getEirForCandidate } from "@/lib/guest-candidates"
import { setEpisodeRecordingSchedule } from "@/lib/eir"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params
  if (!db) return errorResponse("قاعدة البيانات غير مهيأة", 500)

  let body: { recording_scheduled_at?: unknown }
  try {
    body = await request.json()
  } catch {
    return errorResponse("صيغة البيانات غير صحيحة", 400)
  }

  // null / empty clears the schedule; a string must parse to a valid date.
  let value: string | null = null
  const raw = body.recording_scheduled_at
  if (raw != null && raw !== "") {
    if (typeof raw !== "string" || Number.isNaN(Date.parse(raw))) {
      return errorResponse("تاريخ التصوير غير صالح", 422)
    }
    value = new Date(raw).toISOString()
  }

  try {
    const eir = await getEirForCandidate(id)
    if (!eir) {
      return errorResponse("انقل المرشّح للإنتاج أولاً لتحديد موعد التصوير", 409)
    }
    await setEpisodeRecordingSchedule({ eir_id: eir.id, recording_scheduled_at: value })
    revalidatePath(`/admin/guest-candidates/${id}`)
    revalidatePath(`/admin/khat-brain/episodes/${eir.id}`)
    return successResponse({ eir_id: eir.id, recording_scheduled_at: value })
  } catch (err) {
    console.error("[guest-candidates/recording-schedule] failed:", err)
    return errorResponse("فشل تحديد موعد التصوير", 500)
  }
}
