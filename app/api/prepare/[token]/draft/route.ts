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
  // The link was usable a moment ago (resolveUsable), so a refused draft means
  // the answers are already submitted — a late autosave/keepalive flush. Not
  // an error the guest should ever read.
  if (!ok) return guestJson({ ok: false, error: "تم إرسال الإجابات" }, 409)
  return guestJson({ ok: true })
}
