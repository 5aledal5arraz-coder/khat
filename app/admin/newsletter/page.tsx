import { db } from '@/lib/db'
import { newsletterSubscribers, newsletterSends } from '@/lib/db/schema'
import { eq, count, desc } from 'drizzle-orm'
import { getNewsletterSubscribers } from '@/lib/admin/queries'
import { NewsletterComposer } from './newsletter-composer'

export const dynamic = 'force-dynamic'

async function getSubscriberCount(): Promise<number> {
  if (!db) return 0
  const result = await db.select({ count: count() })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, 'active'))
  return result[0]?.count ?? 0
}

async function getRecentSends() {
  if (!db) return []
  const rows = await db.select({
    id: newsletterSends.id,
    subject: newsletterSends.subject,
    recipient_count: newsletterSends.recipient_count,
    sent_at: newsletterSends.sent_at,
  })
    .from(newsletterSends)
    .orderBy(desc(newsletterSends.sent_at))
    .limit(20)
  return rows.map(r => ({
    id: r.id,
    subject: r.subject,
    recipient_count: r.recipient_count ?? 0,
    sent_at: r.sent_at?.toISOString() ?? new Date().toISOString(),
  }))
}

export default async function NewsletterAdminPage() {
  const [subscriberCount, recentSends, allSubscribers] = await Promise.all([
    getSubscriberCount(),
    getRecentSends(),
    getNewsletterSubscribers(),
  ])

  const activeSubscribers = allSubscribers
    .filter((s: any) => !s.status || s.status === 'active')
    .map((s: any) => ({ email: s.email, created_at: s.created_at }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">النشرة البريدية</h1>
        <p className="text-muted-foreground mt-1">
          إرسال رسائل بريدية لجميع المشتركين
        </p>
      </div>

      <NewsletterComposer
        subscriberCount={subscriberCount}
        recentSends={recentSends}
        subscribers={activeSubscribers}
      />
    </div>
  )
}
