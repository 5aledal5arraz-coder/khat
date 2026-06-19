import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { createCampaignRecord } from '@/lib/newsletter/sender'
import { enqueueJob } from '@/lib/jobs/queue'

// Only sets up the campaign + delivery rows; the actual send runs in the
// background worker, so this stays fast and never times out on big lists.
export const maxDuration = 60

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
    // Create the campaign + queued deliveries synchronously (fast)…
    const created = await createCampaignRecord({
      subject: body.subject,
      body: body.body,
      sentBy: user.id,
    })

    // …then hand the actual delivery to the background job worker.
    if (created.queued) {
      await enqueueJob("newsletter.send_campaign", { campaignId: created.campaignId })
    }

    return NextResponse.json({
      success: true,
      campaignId: created.campaignId,
      total: created.total,
      queued: created.queued,
    })
  } catch (err) {
    console.error('[newsletter-send]', err)
    const message = err instanceof Error ? err.message : 'فشل الإرسال'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
