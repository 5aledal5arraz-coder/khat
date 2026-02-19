import { pool } from '@/lib/db'
import { NewsletterComposer } from './newsletter-composer'

export const dynamic = 'force-dynamic'

async function getSubscriberCount(): Promise<number> {
  if (!pool) return 0
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM newsletter_subscribers WHERE status = 'active'`
  )
  return parseInt(rows[0]?.count || '0', 10)
}

async function getRecentSends() {
  if (!pool) return []
  const { rows } = await pool.query(
    `SELECT id, subject, recipient_count, sent_at
     FROM newsletter_sends
     ORDER BY sent_at DESC
     LIMIT 20`
  )
  return rows
}

export default async function NewsletterAdminPage() {
  const [subscriberCount, recentSends] = await Promise.all([
    getSubscriberCount(),
    getRecentSends(),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">النشرة البريدية</h1>
        <p className="text-muted-foreground mt-1">
          إرسال رسائل بريدية لجميع المشتركين
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <span className="text-lg">📧</span>
          </div>
          <div>
            <p className="text-2xl font-bold">{subscriberCount}</p>
            <p className="text-sm text-muted-foreground">مشترك نشط</p>
          </div>
        </div>
      </div>

      <NewsletterComposer subscriberCount={subscriberCount} recentSends={recentSends} />
    </div>
  )
}
