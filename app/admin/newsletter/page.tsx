import { getActiveSubscriberCount, getRecentCampaigns } from '@/lib/newsletter/queries'
import { NewsletterComposer } from './newsletter-composer'
import Link from 'next/link'
import { BarChart3, Users, HeartPulse } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function NewsletterAdminPage() {
  const [subscriberCount, recentCampaigns] = await Promise.all([
    getActiveSubscriberCount(),
    getRecentCampaigns(),
  ])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">النشرة البريدية</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            إرسال رسائل بريدية لجميع المشتركين
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/newsletter/metrics"
            className="flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-[13px] transition-all duration-200 hover:bg-muted/40"
          >
            <BarChart3 className="h-4 w-4" />
            الإحصائيات
          </Link>
          <Link
            href="/admin/newsletter/subscribers"
            className="flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-[13px] transition-all duration-200 hover:bg-muted/40"
          >
            <Users className="h-4 w-4" />
            المشتركون
          </Link>
          <Link
            href="/admin/newsletter/health"
            className="flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-1.5 text-[13px] transition-all duration-200 hover:bg-muted/40"
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
