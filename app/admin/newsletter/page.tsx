import { db } from '@/lib/db'
import { newsletterSubscribers, newsletterCampaigns } from '@/lib/db/schema'
import { eq, count, desc } from 'drizzle-orm'
import { NewsletterComposer } from './newsletter-composer'
import Link from 'next/link'
import { BarChart3, Users, HeartPulse } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getSubscriberCount(): Promise<number> {
  if (!db) return 0
  const result = await db.select({ count: count() })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, 'active'))
  return result[0]?.count ?? 0
}

async function getRecentCampaigns() {
  if (!db) return []
  const rows = await db.select({
    id: newsletterCampaigns.id,
    subject: newsletterCampaigns.subject,
    status: newsletterCampaigns.status,
    total_recipients: newsletterCampaigns.total_recipients,
    total_sent: newsletterCampaigns.total_sent,
    total_opened: newsletterCampaigns.total_opened,
    total_clicked: newsletterCampaigns.total_clicked,
    sent_at: newsletterCampaigns.sent_at,
  })
    .from(newsletterCampaigns)
    .orderBy(desc(newsletterCampaigns.created_at))
    .limit(20)
  return rows.map(r => ({
    id: r.id,
    subject: r.subject,
    status: r.status,
    total_recipients: r.total_recipients ?? 0,
    total_sent: r.total_sent ?? 0,
    total_opened: r.total_opened ?? 0,
    total_clicked: r.total_clicked ?? 0,
    sent_at: r.sent_at?.toISOString() ?? new Date().toISOString(),
  }))
}

export default async function NewsletterAdminPage() {
  const [subscriberCount, recentCampaigns] = await Promise.all([
    getSubscriberCount(),
    getRecentCampaigns(),
  ])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">النشرة البريدية</h1>
          <p className="text-muted-foreground mt-1">
            إرسال رسائل بريدية لجميع المشتركين
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/newsletter/metrics"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <BarChart3 className="h-4 w-4" />
            الإحصائيات
          </Link>
          <Link
            href="/admin/newsletter/subscribers"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Users className="h-4 w-4" />
            المشتركون
          </Link>
          <Link
            href="/admin/newsletter/health"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <HeartPulse className="h-4 w-4" />
            الصحة
          </Link>
        </div>
      </div>

      <NewsletterComposer
        subscriberCount={subscriberCount}
        recentCampaigns={recentCampaigns}
      />
    </div>
  )
}
