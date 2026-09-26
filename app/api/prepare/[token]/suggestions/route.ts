import type { NextRequest } from "next/server"
import { fieldErrors, guestSuggestionSchema } from "@/lib/validation/guest-link"
import { createGuestSuggestion } from "@/lib/guest-link/service"
import { guestJson, rateLimited, readGuestJson, resolveUsable } from "@/lib/guest-link/route-helpers"

/**
 * POST /api/prepare/[token]/suggestions — «عندك إضافة؟».
 *
 * Lands in the admin inbox as `new`; nothing in the prep changes until the
 * team accepts it. The target is resolved against the PUBLISHED snapshot and
 * its text copied server-side — the client only names an opaque ref.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimited(request, "suggestion")
  if (limited) return limited
  const body = await readGuestJson(request)
  if (!body.ok) return body.response

  const { token } = await params
  const resolved = await resolveUsable(token)
  if (!resolved.ok) return resolved.response
  const { row } = resolved.link
  if (!row.questionnaire_submitted_at) return guestJson({ error: "أكمل الاستبيان أولاً" }, 409)

  const parsed = guestSuggestionSchema.safeParse(body.body)
  if (!parsed.success) {
    return guestJson({ error: "راجع النص", fields: fieldErrors(parsed.error) }, 422)
  }

  const r = await createGuestSuggestion(row, parsed.data)
  if (!r.ok) {
    const map = {
      not_published: [409, "التفاصيل لسه ما وصلت"],
      bad_target: [422, "مرجع الاقتراح غير صالح"],
      too_many: [429, "وصلتنا اقتراحات كثيرة، بنراجعها ونرجع لك"],
      gone: [410, "الرابط لم يعد متاحاً"],
    } as const
    const [status, error] = map[r.reason]
    return guestJson({ error }, status)
  }
  return guestJson({ ok: true, id: r.id }, 201)
}
