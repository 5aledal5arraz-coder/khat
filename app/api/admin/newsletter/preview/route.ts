import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-utils'
import { getResend, FROM_DISPLAY, REPLY_TO } from '@/lib/email/resend'
import { getEmailSocialLinks } from '@/lib/email/social'
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
    const result = await getResend().emails.send({
      from: FROM_DISPLAY,
      replyTo: REPLY_TO,
      to: body.email.trim(),
      subject: `[معاينة] ${body.subject.trim()}`,
      html: newsletterHtml(body.body.trim(), '#', await getEmailSocialLinks()),
    })

    // Resend RESOLVES with `{ data: null, error }` on a refusal — it does not
    // reject. Without this the operator got «تم» for a preview that was never
    // accepted, and then waited on an inbox that would stay empty. The preview
    // exists to prove the mail works, so a silent one defeats its own purpose.
    if (result.error) {
      console.error('[newsletter-preview]', result.error)
      return NextResponse.json(
        { error: `فشل إرسال المعاينة — ${result.error.message || result.error.name}` },
        { status: 502 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[newsletter-preview]', err)
    return NextResponse.json({ error: 'فشل إرسال المعاينة' }, { status: 500 })
  }
}
