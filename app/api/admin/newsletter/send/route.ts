import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { sendCampaign } from '@/lib/newsletter/sender'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  // Newsletter send is destructive (emails all subscribers), require ADMIN+
  const auth = await requireRole('ADMIN')
  if (auth.error) return auth.error
  const user = auth.user

  if (!db) {
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

  try {
    const result = await sendCampaign({
      subject: body.subject,
      body: body.body,
      sentBy: user.id,
    })

    return NextResponse.json({
      success: true,
      campaignId: result.campaignId,
      sent: result.sent,
      total: result.total,
    })
  } catch (err) {
    console.error('[newsletter-send]', err)
    const message = err instanceof Error ? err.message : 'فشل الإرسال'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
