import { getCampaignById, getCampaignDeliveries } from "@/lib/newsletter/queries"
import { pct, formatDateTime, formatTime } from "@/lib/newsletter/format"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Mail, Send, Eye, MousePointerClick, XCircle } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [campaign, deliveries] = await Promise.all([
    getCampaignById(id),
    getCampaignDeliveries(id),
  ])

  if (!campaign) notFound()

  const stats = [
    { label: "المستلمون", value: campaign.total_recipients ?? 0, icon: Mail },
    { label: "المُرسل", value: `${campaign.total_sent ?? 0} (${pct(campaign.total_sent ?? 0, campaign.total_recipients ?? 0)})`, icon: Send },
    { label: "المفتوح", value: `${campaign.total_opened ?? 0} (${pct(campaign.total_opened ?? 0, campaign.total_sent ?? 0)})`, icon: Eye },
    { label: "النقرات", value: `${campaign.total_clicked ?? 0} (${pct(campaign.total_clicked ?? 0, campaign.total_sent ?? 0)})`, icon: MousePointerClick },
    { label: "الفاشل", value: campaign.total_failed ?? 0, icon: XCircle },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{campaign.subject}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground/60">
            {campaign.sent_at
              ? formatDateTime(campaign.sent_at)
              : "لم يُرسل بعد"
            }
          </p>
        </div>
        <Link
          href="/admin/newsletter"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          العودة
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <stat.icon className="h-4 w-4" />
              <span className="text-xs">{stat.label}</span>
            </div>
            <p className="text-lg font-bold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Delivery Log */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">سجل التسليم</h2>
        {deliveries.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">لا توجد عمليات تسليم</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">البريد</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">الحالة</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">أُرسل</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">فتح</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">نقر</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">آخر حدث</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-border/50">
                    <td className="px-4 py-2.5 font-mono text-xs" dir="ltr">{d.email}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        d.status === "sent" || d.status === "delivered"
                          ? "bg-green-500/10 text-green-400"
                          : d.status === "opened"
                          ? "bg-blue-500/10 text-blue-400"
                          : d.status === "clicked"
                          ? "bg-purple-500/10 text-purple-400"
                          : d.status === "failed" || d.status === "bounced"
                          ? "bg-red-500/10 text-red-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {d.status === "sent" ? "مُرسل" :
                         d.status === "delivered" ? "مُوصّل" :
                         d.status === "opened" ? "مفتوح" :
                         d.status === "clicked" ? "منقور" :
                         d.status === "failed" ? "فشل" :
                         d.status === "bounced" ? "مرتد" :
                         d.status === "queued" ? "في الانتظار" : d.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {d.sent_at ? formatTime(d.sent_at) : "—"}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{d.open_count}</td>
                    <td className="px-4 py-2.5 tabular-nums">{d.click_count}</td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {d.last_event_at ? formatDateTime(d.last_event_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
