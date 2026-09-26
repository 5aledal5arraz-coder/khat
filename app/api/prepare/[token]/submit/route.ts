import type { NextRequest } from "next/server"
import { fieldErrors, guestQuestionnaireSubmitSchema } from "@/lib/validation/guest-link"
import { submitGuestQuestionnaire } from "@/lib/guest-link/service"
import { guestJson, rateLimited, readGuestJson, resolveUsable } from "@/lib/guest-link/route-helpers"
import type { GuestLinkQuestionnaire } from "@/types/database"

/**
 * POST /api/prepare/[token]/submit — «نسخة الضيف» questionnaire submission
 * (also used for «تعديل إجاباتي»). Field errors come back keyed by field so
 * the form can show each one next to its input.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimited(request, "submit")
  if (limited) return limited
  const body = await readGuestJson(request)
  if (!body.ok) return body.response

  const { token } = await params
  const resolved = await resolveUsable(token)
  if (!resolved.ok) return resolved.response

  const parsed = guestQuestionnaireSubmitSchema.safeParse(body.body)
  if (!parsed.success) {
    return guestJson({ error: "راجع الحقول المطلوبة", fields: fieldErrors(parsed.error) }, 422)
  }

  const q: GuestLinkQuestionnaire = parsed.data
  const ok = await submitGuestQuestionnaire(resolved.link.row.id, q)
  if (!ok) return guestJson({ error: "الرابط لم يعد متاحاً" }, 410)
  return guestJson({ ok: true })
}
