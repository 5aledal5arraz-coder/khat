import { getNewsletterMetrics, getTopCampaigns } from "@/lib/newsletter/queries"
import Link from "next/link"
import { ArrowRight, Mail, Users, Send, MousePointerClick, Eye, AlertTriangle } from "lucide-react"

export const dynamic = "force-dynamic"

function pct(n: number, total: number): string {
  if (total === 0) return "0%"
  return `${Math.round((n / total) * 100)}%`
}

export default async function NewsletterMetricsPage() {
  const [metrics, topCampaigns] = await Promise.all([
    getNewsletterMetrics(),
    getTopCampaigns(5),
  ])

  if (!metrics) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">قاعدة البيانات غير متصلة</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">إحصائيات النشرة البريدية</h1>
          <p className="text-muted-foreground mt-1">نظرة عامة على أداء حملاتك</p>
        </div>
        <Link
          href="/admin/newsletter"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          العودة
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="h-4 w-4" />
            <span className="text-xs">المشتركون النشطون</span>
          </div>
          <p className="text-2xl font-bold">{metrics.activeSubscribers}</p>
          <p className="text-xs text-muted-foreground">من {metrics.totalSubscribers} إجمالي</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Mail className="h-4 w-4" />
            <span className="text-xs">الحملات المُرسلة</span>
          </div>
          <p className="text-2xl font-bold">{metrics.campaignsSent}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Send className="h-4 w-4" />
            <span className="text-xs">إجمالي الرسائل</span>
          </div>
          <p className="text-2xl font-bold">{metrics.totalEmailsSent}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">الشكاوى</span>
          </div>
          <p className="text-2xl font-bold">{metrics.totalComplaints}</p>
        </div>
      </div>

      {/* Rate Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <RateCard label="معدل التوصيل" value={metrics.deliveryRate} color="green" />
        <RateCard label="معدل الفتح" value={metrics.openRate} color="blue" />
        <RateCard label="معدل النقر" value={metrics.clickRate} color="purple" />
        <RateCard label="معدل الارتداد" value={metrics.bounceRate} color="red" />
      </div>

      {/* Top Campaigns */}
      {topCampaigns.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">أفضل الحملات حسب الفتح</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">الموضوع</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">المُرسل</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">الفتح</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">النقر</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {topCampaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="px-4 py-2.5 max-w-[200px] truncate">
                      <Link href={`/admin/newsletter/campaigns/${c.id}`} className="text-primary hover:underline">
                        {c.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{c.total_sent}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {c.total_opened} <span className="text-muted-foreground">({pct(c.total_opened, c.total_sent)})</span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {c.total_clicked} <span className="text-muted-foreground">({pct(c.total_clicked, c.total_sent)})</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {c.sent_at ? new Date(c.sent_at).toLocaleDateString("en-GB", {
                        year: "numeric", month: "short", day: "numeric",
                      }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function RateCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    green: "text-green-400",
    blue: "text-blue-400",
    purple: "text-purple-400",
    red: "text-red-400",
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <p className={`text-3xl font-bold ${colorMap[color] || ""}`}>{value}%</p>
    </div>
  )
}
