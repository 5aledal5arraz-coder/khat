import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAPI, getAuthUser } from '@/lib/api-utils'
import { pool } from '@/lib/db'
import { getResend, FROM_EMAIL } from '@/lib/email/resend'
import { newsletterHtml } from '@/lib/email/templates'

export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  if (!pool) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  let body: { subject: string; body: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: 'الموضوع والمحتوى مطلوبان' }, { status: 400 })
  }

  // Fetch active subscribers
  const { rows: subscribers } = await pool.query(
    `SELECT email, unsubscribe_token FROM newsletter_subscribers WHERE status = 'active'`
  )

  if (subscribers.length === 0) {
    return NextResponse.json({ error: 'لا يوجد مشتركين نشطين' }, { status: 400 })
  }

  const resend = getResend()
  let sentCount = 0
  const BATCH_SIZE = 50

  // Send in batches of 50
  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE)
    const emails = batch.map((sub) => ({
      from: FROM_EMAIL,
      to: sub.email,
      subject: body.subject.trim(),
      html: newsletterHtml(
        body.body.trim(),
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://khatpodcast.com'}/api/unsubscribe/newsletter?token=${sub.unsubscribe_token}`
      ),
    }))

    try {
      await resend.batch.send(emails)
      sentCount += batch.length
    } catch (err) {
      console.error(`[newsletter] Batch ${i / BATCH_SIZE} failed:`, err)
    }
  }

  // Log the send
  const user = await getAuthUser()
  await pool.query(
    `INSERT INTO newsletter_sends (subject, body, recipient_count, sent_by) VALUES ($1, $2, $3, $4)`,
    [body.subject.trim(), body.body.trim(), sentCount, user?.id || null]
  )

  return NextResponse.json({ success: true, sent: sentCount, total: subscribers.length })
}
