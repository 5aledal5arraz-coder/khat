"use client"

import { useState } from "react"
import { Rss, RefreshCw, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDateDDMMYYYY } from "@/lib/admin/date"
import type { RssSyncStatus } from "@/lib/queries/audio-platforms"

interface Props {
  initialStatus: RssSyncStatus | null
}

export function RssSyncClient({ initialStatus }: Props) {
  const [syncStatus, setSyncStatus] = useState(initialStatus)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/admin/rss/sync", { method: "POST" })
      const json = await res.json()
      if (res.ok) {
        setSyncStatus(json.data || json)
        showToast("success", json.data?.message || json.message || "تمت المزامنة")
      } else {
        showToast("error", json.error || "فشلت المزامنة")
      }
    } catch {
      showToast("error", "فشل الاتصال بالخادم")
    } finally {
      setSyncing(false)
    }
  }

  const feedUrl =
    process.env.NEXT_PUBLIC_RSS_FEED_URL || "https://media.rss.com/khatpodcast/feed.xml"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Rss className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">مزامنة RSS</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          يقرأ هذا السكريبت خلاصة RSS الخاصة بالبودكاست ويُحدّث حقول الصوت (رابط الملف،
          المدة، guid) في الحلقات الموجودة بمطابقة العنوان وتاريخ النشر (نافذة ±7 أيام).
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm",
            toast.type === "success"
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {toast.text}
        </div>
      )}

      {/* Card */}
      <div className="rounded-xl border border-border/30 bg-card/50">
        <div className="flex items-center justify-between border-b border-border/20 px-5 py-4">
          <h2 className="font-semibold">حالة المزامنة</h2>
          <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? "جاري المزامنة..." : "مزامنة الآن"}
          </Button>
        </div>

        <div className="space-y-4 p-5">
          {/* Feed URL */}
          <div>
            <label className="text-xs text-muted-foreground">رابط RSS Feed</label>
            <div
              className="mt-1 rounded-lg border border-border/30 bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
              dir="ltr"
            >
              {feedUrl}
            </div>
          </div>

          {/* Sync Status */}
          {syncStatus ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border/20 bg-muted/20 p-3 text-center">
                  <p className="text-2xl font-bold">{syncStatus.totalItems}</p>
                  <p className="text-[11px] text-muted-foreground">عناصر RSS</p>
                </div>
                <div className="rounded-lg border border-border/20 bg-emerald-500/5 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{syncStatus.matched}</p>
                  <p className="text-[11px] text-muted-foreground">تم ربطها</p>
                </div>
                <div className="rounded-lg border border-border/20 bg-muted/20 p-3 text-center">
                  <p className="text-2xl font-bold">{syncStatus.skipped}</p>
                  <p className="text-[11px] text-muted-foreground">تم تخطيها</p>
                </div>
                <div className="rounded-lg border border-border/20 bg-muted/20 p-3 text-center">
                  <p className="text-2xl font-bold">{syncStatus.errors?.length || 0}</p>
                  <p className="text-[11px] text-muted-foreground">أخطاء</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {syncStatus.status === "success" ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                )}
                <span>آخر مزامنة: {formatDateDDMMYYYY(syncStatus.syncedAt)}</span>
                {syncStatus.message && (
                  <span className="text-muted-foreground/60">— {syncStatus.message}</span>
                )}
              </div>

              {syncStatus.errors && syncStatus.errors.length > 0 && (
                <details className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-amber-600">
                    {syncStatus.errors.length} أخطاء
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground" dir="ltr">
                    {syncStatus.errors.map((err, i) => (
                      <li key={i} className="break-all">• {err}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              لم يتم إجراء أي مزامنة بعد. اضغط &ldquo;مزامنة الآن&rdquo; لبدء الربط.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
