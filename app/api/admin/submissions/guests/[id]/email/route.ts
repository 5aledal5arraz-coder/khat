import { NextRequest } from 'next/server'
import { requireRole, errorResponse, successResponse } from '@/lib/api-utils'
import { getGuestApplicationById } from '@/lib/admin/queries'
import { sendDirectEmail } from '@/lib/email/send'
import { logActivity } from '@/lib/crm'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole('ADMIN')
  if (auth.error) return auth.error

  const { id } = await params
  const { subject, body } = await request.json()

  if (!subject?.trim() || !body?.trim()) {
    return errorResponse('الموضوع والمحتوى مطلوبان', 422)
  }

  const application = await getGuestApplicationById(id)
  if (!application) return errorResponse('الطلب غير موجود', 404)
  if (!application.email) return errorResponse('لا يوجد بريد إلكتروني لهذا المتقدم', 400)

  try {
    await sendDirectEmail(
      application.email,
      application.name || 'عزيزي المتقدم',
      subject.trim(),
      body.trim(),
      'إدارة خط'
    )
    await logActivity('guest', id, {
      type: 'email_sent',
      summary: `أُرسل بريد: ${subject.trim()}`,
      actor: `admin:${auth.user.email}`,
      metadata: { to: application.email },
    })
    return successResponse({ success: true })
  } catch (error: unknown) {
    console.error('Failed to send guest application email:', error)
    return errorResponse('فشل إرسال البريد', 500)
  }
}
