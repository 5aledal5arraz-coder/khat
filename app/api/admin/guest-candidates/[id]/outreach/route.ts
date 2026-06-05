import { NextRequest } from "next/server"
import {
  errorResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import {
  generateOutreachDraft,
  listOutreachMessages,
  saveOutreachMessage,
} from "@/lib/guest-candidates"
import type { OutreachChannel, OutreachTone } from "@/types/database"
import { revalidatePath } from "next/cache"

export const maxDuration = 60

const VALID_CHANNELS: OutreachChannel[] = ["whatsapp", "email", "dm"]
const VALID_TONES: OutreachTone[] = ["formal", "warm", "concise", "premium"]
const VALID_LENGTHS = ["short", "medium", "long"] as const

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth

  const { id } = await ctx.params
  try {
    const messages = await listOutreachMessages(id)
    return successResponse({ messages })
  } catch (err) {
    console.error("[outreach] list failed:", err)
    return errorResponse("فشل تحميل الرسائل", 500)
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params

  let body: {
    action?: "generate" | "save"
    channel?: string
    tone?: string
    length?: string
    customNote?: string
    subject_line?: string | null
    message_body?: string
    generated_by_ai?: boolean
    edited_by_admin?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return errorResponse("صيغة البيانات غير صحيحة", 400)
  }

  if (!body.channel || !VALID_CHANNELS.includes(body.channel as OutreachChannel)) {
    return errorResponse("القناة غير صحيحة", 422)
  }
  if (!body.tone || !VALID_TONES.includes(body.tone as OutreachTone)) {
    return errorResponse("النبرة غير صحيحة", 422)
  }

  const action = body.action || "generate"

  if (action === "generate") {
    const length = (body.length && (VALID_LENGTHS as readonly string[]).includes(body.length))
      ? (body.length as "short" | "medium" | "long")
      : "medium"

    const outcome = await generateOutreachDraft({
      candidateId: id,
      channel: body.channel as OutreachChannel,
      tone: body.tone as OutreachTone,
      length,
      customNote: body.customNote,
    })
    if (!outcome.ok) return errorResponse(outcome.error, 500)
    return successResponse({ draft: outcome.draft, runId: outcome.runId })
  }

  if (action === "save") {
    if (!body.message_body || typeof body.message_body !== "string" || body.message_body.trim().length < 10) {
      return errorResponse("نص الرسالة قصير جداً", 422)
    }
    try {
      const saved = await saveOutreachMessage({
        candidateId: id,
        channel: body.channel as OutreachChannel,
        tone: body.tone as OutreachTone,
        subject_line: body.subject_line ?? null,
        message_body: body.message_body.trim(),
        generated_by_ai: !!body.generated_by_ai,
        edited_by_admin: !!body.edited_by_admin,
      })
      revalidatePath(`/admin/guest-candidates/${id}`)
      return successResponse({ message: saved })
    } catch (err) {
      console.error("[outreach] save failed:", err)
      return errorResponse("فشل حفظ الرسالة", 500)
    }
  }

  return errorResponse("الإجراء غير معروف", 400)
}
