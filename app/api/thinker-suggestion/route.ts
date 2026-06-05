import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { thinkerSuggestions } from "@/lib/db/schema"
import { validateMutation } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { stripHtml } from "@/lib/sanitize"

export async function POST(request: NextRequest) {
  // CSRF check
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  // Rate limit: 3 submissions per hour per IP
  const rateLimit = checkIpRateLimit(request, "thinker_suggestion", 3, 60 * 60 * 1000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "لقد أرسلت عدة اقتراحات. يرجى المحاولة لاحقًا." },
      { status: 429 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
  }

  const { thinker_name, research_field, reason, social_links, phone } = body

  // Validate required fields
  if (typeof thinker_name !== "string" || !thinker_name.trim()) {
    return NextResponse.json({ error: "اسم المفكّر مطلوب" }, { status: 400 })
  }
  if (typeof research_field !== "string" || !research_field.trim()) {
    return NextResponse.json({ error: "مجال البحث مطلوب" }, { status: 400 })
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "سبب الاقتراح مطلوب" }, { status: 400 })
  }

  // Length limits
  if (thinker_name.trim().length > 200) {
    return NextResponse.json({ error: "اسم المفكّر طويل جداً (الحد 200 حرف)" }, { status: 400 })
  }
  if (research_field.trim().length > 200) {
    return NextResponse.json({ error: "مجال البحث طويل جداً (الحد 200 حرف)" }, { status: 400 })
  }
  if (reason.trim().length > 2000) {
    return NextResponse.json({ error: "السبب طويل جداً (الحد 2000 حرف)" }, { status: 400 })
  }

  // Sanitize
  const sanitizedName = stripHtml(thinker_name.trim().slice(0, 200))
  const sanitizedField = stripHtml(research_field.trim().slice(0, 200))
  const sanitizedReason = stripHtml(reason.trim().slice(0, 2000))
  const sanitizedLinks = typeof social_links === "string" && social_links.trim()
    ? stripHtml(social_links.trim().slice(0, 1000))
    : null
  const sanitizedPhone = typeof phone === "string" && phone.trim()
    ? stripHtml(phone.trim().slice(0, 30))
    : null

  if (!db) {
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 })
  }

  try {
    await db.insert(thinkerSuggestions).values({
      thinker_name: sanitizedName,
      research_field: sanitizedField,
      reason: sanitizedReason,
      social_links: sanitizedLinks,
      phone: sanitizedPhone,
      status: "new",
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Thinker suggestion insert error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء إرسال الاقتراح" },
      { status: 500 }
    )
  }
}
