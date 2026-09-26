import type { NextRequest } from "next/server"
import { guestQuestionnaireDraftSchema } from "@/lib/validation/guest-link"
import { saveGuestDraft } from "@/lib/guest-link/service"
import { guestJson, rateLimited, readGuestJson, resolveUsable } from "@/lib/guest-link/route-helpers"

/**
 * POST /api/prepare/[token]/draft — «نسخة الضيف» questionnaire autosave.
 * Called on step change, so a guest who closes the tab resumes where they were.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimited(request, "draft")
  if (limited) return limited
  const body = await readGuestJson(request)
  if (!body.ok) return body.response

  const { token } = await params
  const resolved = await resolveUsable(token)
  if (!resolved.ok) return resolved.response

  const parsed = guestQuestionnaireDraftSchema.safeParse(body.body)
  if (!parsed.success) return guestJson({ error: "بيانات غير صالحة" }, 422)

  const ok = await saveGuestDraft(resolved.link.row.id, parsed.data.step, parsed.data.draft)
  if (!ok) return guestJson({ error: "الرابط لم يعد متاحاً" }, 410)
  return guestJson({ ok: true })
}
