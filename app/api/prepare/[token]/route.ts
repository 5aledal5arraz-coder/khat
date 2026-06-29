import { NextRequest, NextResponse } from "next/server"
import { validateOrigin } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import {
  getPrepFormByToken,
  validatePrepToken,
  submitPrepResponse,
} from "@/lib/guest-prep"
import { sendGuestPrepConfirm } from "@/lib/email/send"
import { logActivity } from "@/lib/crm"
import type { GuestPrepResponse } from "@/types/database"

/**
 * GET /api/prepare/[token]
 * Fetch form data for the guest (used by the client component).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const form = await getPrepFormByToken(token)
  const validation = validatePrepToken(form)

  if (!validation.valid) {
    return NextResponse.json({ error: validation.reason }, { status: 404 })
  }

  const { form: validForm } = validation

  return NextResponse.json({
    guest_name: validForm.guest_name,
    status: validForm.status,
    response: validForm.response,
    editable: validForm.status === "pending" || validForm.status === "submitted",
  })
}

/**
 * POST /api/prepare/[token]
 * Submit questionnaire response.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Origin validation (CSRF protection for public form)
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 403 })
  }

  // Rate limit: this writes to the DB AND sends a confirmation email, so an
  // unthrottled token holder is an email-amplification surface. 10/hour/IP is
  // generous for a real guest editing their answers.
  const rate = checkIpRateLimit(request, "guest_prep_submit", 10, 60 * 60 * 1000)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "عدد محاولات كثيرة. يرجى المحاولة لاحقًا." },
      { status: 429 },
    )
  }

  const { token } = await params

  let body: { response: GuestPrepResponse }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
  }

  const { response } = body
  if (!response) {
    return NextResponse.json({ error: "يجب تعبئة الاستبيان" }, { status: 400 })
  }

  // Validate required fields
  if (!response.preferred_name?.trim()) {
    return NextResponse.json({ error: "يجب كتابة الاسم المفضل" }, { status: 422 })
  }
  if (!response.phone_whatsapp?.trim()) {
    return NextResponse.json({ error: "يجب كتابة رقم الهاتف" }, { status: 422 })
  }
  if (!response.preferred_drink?.trim()) {
    return NextResponse.json({ error: "يجب اختيار المشروب المفضل" }, { status: 422 })
  }
  if (!response.preferred_filming_days || response.preferred_filming_days.length === 0) {
    return NextResponse.json({ error: "يجب اختيار أيام التصوير المفضلة" }, { status: 422 })
  }
  if (!response.preferred_filming_time?.trim()) {
    return NextResponse.json({ error: "يجب اختيار وقت التصوير المفضل" }, { status: 422 })
  }
  if (!response.topics_excited_about?.trim()) {
    return NextResponse.json({ error: "يجب كتابة المواضيع التي تتحمس للحديث عنها" }, { status: 422 })
  }
  if (response.arrival_confirmation !== true) {
    return NextResponse.json({ error: "يجب تأكيد الحضور قبل ٣٠ دقيقة" }, { status: 422 })
  }
  if (response.location_confirmation !== true) {
    return NextResponse.json({ error: "يجب تأكيد حضور الاستوديو" }, { status: 422 })
  }

  const result = await submitPrepResponse(token, response)

  if (!result.success) {
    const statusMap: Record<string, number> = {
      not_found: 404,
      expired: 410,
      revoked: 410,
      locked: 403,
    }
    const errorMessages: Record<string, string> = {
      not_found: "الرابط غير صالح",
      expired: "انتهت صلاحية الرابط",
      revoked: "تم إلغاء الرابط",
      locked: "لا يمكن تعديل الاستبيان بعد القفل",
    }
    return NextResponse.json(
      { error: errorMessages[result.error!] || "حدث خطأ" },
      { status: statusMap[result.error!] || 400 }
    )
  }

  // Confirm to the applicant (not just the admin) + record on the casting
  // timeline. Best-effort — never fail the submission on these.
  try {
    const form = await getPrepFormByToken(token)
    if (form) {
      if (form.guest_email) void sendGuestPrepConfirm(form.guest_email, form.guest_name).catch(() => {})
      void logActivity("guest", form.application_id, {
        type: "prep_submitted",
        summary: "أكمل الضيف استبيان التحضير",
        actor: "public",
      })
    }
  } catch {
    /* non-blocking */
  }

  return NextResponse.json({ success: true })
}
