import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAPI, getAdminAuthUser } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { sendCampaign } from '@/lib/newsletter/sender'

export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError

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
    const user = await getAdminAuthUser()
    const result = await sendCampaign({
      subject: body.subject,
      body: body.body,
      sentBy: user?.id || null,
    })

    return NextResponse.json({
      success: true,
      campaignId: result.campaignId,
      sent: result.sent,
      total: result.total,
    })
  } catch (err) {
    console.error('[newsletter-send]', err)
    return NextResponse.json({ error: 'فشل الإرسال' }, { status: 500 })
  }
}
