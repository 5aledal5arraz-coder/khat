import { NextRequest } from 'next/server'
import { requireRole, errorResponse, successResponse } from '@/lib/api-utils'
import { getSponsorshipLeadById } from '@/lib/admin/queries'
import { sendDirectEmail } from '@/lib/email/send'

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

  const lead = await getSponsorshipLeadById(id)
  if (!lead) return errorResponse('الطلب غير موجود', 404)
  if (!lead.email) return errorResponse('لا يوجد بريد إلكتروني لهذا الشريك', 400)

  try {
    await sendDirectEmail(
      lead.email,
      lead.contact_name || 'عزيزي الشريك',
      subject.trim(),
      body.trim(),
      'إدارة خط'
    )
    return successResponse({ success: true })
  } catch (error: unknown) {
    console.error('Failed to send sponsor email:', error)
    return errorResponse('فشل إرسال البريد', 500)
  }
}
