import { env } from "@/lib/env"
import { getHealthStats } from "@/lib/newsletter/queries"
import Link from "next/link"
import { ArrowRight, CheckCircle2, XCircle, Database, Settings } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function NewsletterHealthPage() {
  const stats = await getHealthStats()

  const envChecks = [
    {
      label: "RESEND_API_KEY",
      ok: !!env.RESEND_API_KEY,
      detail: env.RESEND_API_KEY ? "مُعيّن" : "غير مُعيّن",
    },
    {
      label: "NEXT_PUBLIC_APP_URL",
      ok: !!process.env.NEXT_PUBLIC_APP_URL,
      detail: process.env.NEXT_PUBLIC_APP_URL || "غير مُعيّن (يستخدم الافتراضي)",
    },
    {
      label: "RESEND_FROM_EMAIL",
      ok: true,
      detail: env.RESEND_FROM_EMAIL || "noreply@khatpodcast.com (افتراضي)",
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">صحة النظام</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">حالة البنية التحتية للنشرة البريدية</p>
        </div>
        <Link
          href="/admin/newsletter"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          العودة
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Environment Config */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">إعدادات البيئة</h2>
        </div>
        <div className="space-y-3">
          {envChecks.map((check) => (
            <div key={check.label} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3">
              <div className="flex items-center gap-3">
                {check.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-green-700" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-700" />
                )}
                <span className="font-mono text-sm">{check.label}</span>
              </div>
              <span className="text-sm text-muted-foreground">{check.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* DB Stats */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">إحصائيات قاعدة البيانات</h2>
        </div>
        {stats ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-border/50 p-4 text-center">
              <p className="text-2xl font-bold">{stats.activeSubscribers}</p>
              <p className="text-xs text-muted-foreground mt-1">مشترك نشط</p>
            </div>
            <div className="rounded-lg border border-border/50 p-4 text-center">
              <p className="text-2xl font-bold">{stats.totalCampaigns}</p>
              <p className="text-xs text-muted-foreground mt-1">حملة</p>
            </div>
            <div className="rounded-lg border border-border/50 p-4 text-center">
              <p className="text-2xl font-bold">{stats.totalDeliveries}</p>
              <p className="text-xs text-muted-foreground mt-1">رسالة مُسلّمة</p>
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-4">قاعدة البيانات غير متصلة</p>
        )}
      </div>
    </div>
  )
}
