import { NextRequest } from 'next/server'
import { requireRole, errorResponse, successResponse } from '@/lib/api-utils'
import { getMemberById } from '@/lib/admin/queries'
import { sendDirectEmail } from '@/lib/email/send'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole('admin')
  if (auth.error) return auth.error

  const { id } = await params
  const { subject, body } = await request.json()

  if (!subject?.trim() || !body?.trim()) {
    return errorResponse('الموضوع والمحتوى مطلوبان', 422)
  }

  const member = await getMemberById(id)
  if (!member) return errorResponse('العضو غير موجود', 404)
  if (!member.email) return errorResponse('لا يوجد بريد إلكتروني لهذا العضو', 400)

  try {
    await sendDirectEmail(
      member.email,
      member.display_name || 'عزيزي العضو',
      subject.trim(),
      body.trim(),
      auth.profile.display_name || 'إدارة خط'
    )
    return successResponse({ success: true })
  } catch (error: any) {
    console.error('Failed to send direct email:', error)
    return errorResponse('فشل إرسال البريد', 500)
  }
}
