"use client"

/**
 * Market Signals status card.
 *
 * Operator-facing read of `getMarketFreshness()` + a "تحديث الآن"
 * button that fires the same job pipeline the daily scheduler uses.
 * Never surfaces npm commands, script names, or env-var hints. When
 * the data is empty, surfaces a reassuring "auto-refresh in progress"
 * line + the manual button as a power option.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, Clock } from "lucide-react"
import { toast } from "@/lib/use-toast"
import { refreshMarketIntelligenceAction } from "./market-actions"
import type { MarketFreshness } from "@/lib/market-intelligence/freshness"

export interface MarketSignalsCardProps {
  seasonId: string
  freshness: MarketFreshness
}

const STATUS_COPY: Record<
  MarketFreshness["status"],
  {
    label: string
    detail: string
    badgeCls: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  fresh: {
    label: "حديثة",
    detail: "إشارات السوق محدّثة خلال آخر ٤٨ ساعة.",
    badgeCls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    icon: CheckCircle2,
  },
  stale: {
    label: "تحتاج تحديث",
    detail: "مرّ أكثر من أسبوع منذ آخر تحديث — سيُحدَّث تلقائياً قريباً.",
    badgeCls: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    icon: AlertTriangle,
  },
  empty: {
    label: "غير متوفرة",
    detail:
      "لا توجد إشارات سوق بعد. سيتم تحديث إشارات السوق تلقائياً، أو اضغط «تحديث الآن».",
    badgeCls: "border-slate-500/30 bg-slate-500/10 text-slate-200",
    icon: Activity,
  },
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—"
  const delta = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(delta) || delta < 0) return "—"
  if (delta < 60_000) return "قبل دقائق"
  if (delta < 3_600_000) return `قبل ${Math.floor(delta / 60_000)} دقيقة`
  if (delta < 86_400_000) return `قبل ${Math.floor(delta / 3_600_000)} ساعة`
  return `قبل ${Math.floor(delta / 86_400_000)} يوم`
}

export function MarketSignalsCard({ seasonId, freshness }: MarketSignalsCardProps) {
  const copy = STATUS_COPY[freshness.status]
  const Icon = copy.icon
  const [pending, start] = useTransition()
  const [acknowledged, setAcknowledged] = useState(false)
  const router = useRouter()

  const isRefreshing = pending || freshness.refreshInFlight

  const onRefresh = () => {
    setAcknowledged(false)
    start(async () => {
      const r = await refreshMarketIntelligenceAction({ seasonId })
      if (!r.ok) {
        toast({
          title: "تعذّر بدء التحديث",
          description: r.message,
          variant: "error",
        })
        return
      }
      if (r.status === "already_in_flight") {
        toast({
          title: "التحديث جارٍ بالفعل",
          description: "ستظهر النتائج خلال دقائق.",
          variant: "default",
          duration: 2200,
        })
      } else {
        toast({
          title: "بدأ تحديث إشارات السوق",
          description: "ستظهر النتائج خلال دقائق.",
          variant: "success",
          duration: 2200,
        })
      }
      setAcknowledged(true)
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card/30 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Activity className="h-3 w-3" /> إشارات السوق
          </div>
          <h3 className="text-base font-semibold">حالة بيانات السوق</h3>
        </div>
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] " +
            copy.badgeCls
          }
        >
          <Icon className="h-3 w-3" />
          {copy.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Mini label="عدد الإشارات" value={freshness.signalCount} />
        <Mini label="عدد العناقيد" value={freshness.clusterCount} />
        <Mini
          label="آخر تحديث"
          value={formatRelative(
            freshness.lastSuccessfulCollectAt ?? freshness.lastSignalAt,
          )}
        />
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-foreground/85">
        {copy.detail}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          data-refresh-market
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] font-medium text-violet-200 transition-colors hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={
              "h-3.5 w-3.5 " + (isRefreshing ? "animate-spin" : "")
            }
          />
          {isRefreshing ? "جارٍ التحديث..." : "تحديث الآن"}
        </button>
        {freshness.refreshInFlight && !acknowledged && (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            عملية تحديث جارية في الخلفية الآن.
          </span>
        )}
      </div>

      <p className="mt-2 text-[10.5px] text-muted-foreground/70">
        يتم تحديث إشارات السوق تلقائياً يومياً وتُعاد عنقدتها أسبوعياً.
      </p>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-center">
      <div className="text-[16px] font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground/80">
        {label}
      </div>
    </div>
  )
}
