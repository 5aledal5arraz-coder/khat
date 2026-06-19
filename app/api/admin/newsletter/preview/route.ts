import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-utils'
import { getResend, FROM_DISPLAY, REPLY_TO } from '@/lib/email/resend'
import { newsletterHtml } from '@/lib/email/templates'

export async function POST(request: NextRequest) {
  const auth = await requireRole('ADMIN')
  if (auth.error) return auth.error

  let body: { subject: string; body: string; email: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  if (!body.subject?.trim() || !body.body?.trim() || !body.email?.trim()) {
    return NextResponse.json({ error: 'الموضوع والمحتوى والبريد مطلوبين' }, { status: 400 })
  }

  try {
    await getResend().emails.send({
      from: FROM_DISPLAY,
      replyTo: REPLY_TO,
      to: body.email.trim(),
      subject: `[معاينة] ${body.subject.trim()}`,
      html: newsletterHtml(body.body.trim(), '#'),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[newsletter-preview]', err)
    return NextResponse.json({ error: 'فشل إرسال المعاينة' }, { status: 500 })
  }
}
