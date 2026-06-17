/**
 * `/admin/ops` — the admin home: a unified command dashboard.
 *
 * Server component. Calls `takeOpsSnapshot()` server-side (no API route).
 *
 * Visual system: a LIGHT, Apple-clean workspace scoped to this page. The admin
 * shell (sidebar/header) stays dark — dark rail + light workspace is a
 * deliberate premium pattern. We flip the KHAT design tokens to a cool light
 * palette on the page container (`LIGHT_TOKENS`); because every primitive reads
 * `bg-card`/`text-foreground`/`border-border`/… the whole subtree recolors
 * cohesively without per-component rewrites. Layout is rebuilt for whitespace,
 * a calm hierarchy, and soft-shadowed white cards.
 *
 * Auth + RBAC: handled by the admin layout. Read-only — reload to refresh.
 */

import type { CSSProperties, ReactNode } from "react"
import Link from "next/link"
import {
  Compass,
  Telescope,
  PlayCircle,
  Mic,
  Mail,
  Inbox,
  ListChecks,
  Skull,
  Cpu,
  CircleDollarSign,
  ArrowUpLeft,
  type LucideIcon,
} from "lucide-react"
import { takeOpsSnapshot } from "@/lib/ops/snapshot"
import { formatUtc } from "@/lib/ops/format"
import { QueueHealthSection } from "./_components/queue-health-section"
import { SystemEventsSection } from "./_components/system-events-section"
import { AiRouterSection } from "./_components/ai-router-section"
import { EirPipelineSection } from "./_components/eir-pipeline-section"
import { RecentActivitySection } from "./_components/recent-activity-section"

export const dynamic = "force-dynamic"

/** Apple-clean light palette, scoped to this page via inline CSS variables. */
const LIGHT_TOKENS = {
  "--background": "210 20% 98%",
  "--foreground": "222 47% 11%",
  "--card": "0 0% 100%",
  "--card-foreground": "222 47% 11%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "222 47% 11%",
  "--primary": "38 46% 47%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "210 20% 96%",
  "--secondary-foreground": "222 47% 11%",
  "--muted": "210 20% 96%",
  "--muted-foreground": "215 16% 47%",
  "--accent": "266 40% 50%",
  "--accent-foreground": "0 0% 100%",
  "--destructive": "0 72% 51%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "214 20% 91%",
  "--input": "214 20% 91%",
  "--ring": "38 46% 47%",
} as CSSProperties

// ─── Apple-clean tone accents (subtle, used sparingly) ───────────────────────

type StatTone = "neutral" | "gold" | "purple" | "good" | "warn" | "bad"

const STAT_ICON: Record<StatTone, string> = {
  neutral: "bg-slate-100 text-slate-500",
  gold: "bg-amber-50 text-amber-600",
  purple: "bg-violet-50 text-violet-600",
  good: "bg-emerald-50 text-emerald-600",
  warn: "bg-amber-50 text-amber-600",
  bad: "bg-rose-50 text-rose-600",
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string
  value: ReactNode
  hint?: string
  icon: LucideIcon
  tone?: StatTone
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-slate-500">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${STAT_ICON[tone]}`}>
          <Icon className="h-[15px] w-[15px]" />
        </span>
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
        {value}
      </div>
      {hint ? <div className="mt-2 text-[11.5px] text-slate-400">{hint}</div> : null}
    </div>
  )
}

function QuickTile({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string
  icon: LucideIcon
  label: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-14px_rgba(15,23,42,0.18)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-slate-900 group-hover:text-white">
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-slate-900">{label}</span>
        <span className="block truncate text-[11px] text-slate-400">{description}</span>
      </span>
      <ArrowUpLeft className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
    </Link>
  )
}

export default async function OpsDashboardPage() {
  const snap = await takeOpsSnapshot()

  const queue = snap.queue.ok ? snap.queue.data : null
  const ai = snap.aiRouter.ok ? snap.aiRouter.data : null

  const activeJobs = queue
    ? (queue.countsByStatus.pending ?? 0) + (queue.countsByStatus.running ?? 0)
    : null
  const deadJobs = queue ? queue.recentDead.length : null
  const aiSucceeded = ai ? (ai.ai_runs_status_counts_24h.succeeded ?? 0) : null
  const aiFailed = ai
    ? (ai.ai_runs_status_counts_24h.failed ?? 0) + (ai.ai_runs_status_counts_24h.timed_out ?? 0)
    : null
  const aiCost = ai
    ? Object.values(ai.tiers).reduce((s, t) => s + (t.daily_cost_usd ?? 0), 0)
    : null

  return (
    <div
      dir="rtl"
      lang="ar"
      style={LIGHT_TOKENS}
      className="rounded-[28px] bg-background p-6 text-foreground ring-1 ring-slate-200/70 sm:p-8 lg:p-10"
    >
      {/* Hero */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
            مركز التشغيل
          </h1>
          <p className="mt-1.5 text-[14px] text-slate-500">
            نبض المنظومة كاملة في شاشة واحدة — حدّث المتصفح لتحديث اللقطة
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[11.5px] text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <span className="admin-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="font-mono tabular-nums text-slate-700">{formatUtc(snap.taken_at)}</span>
          <span className="text-slate-300">•</span>
          <span className="font-mono tabular-nums">{snap.duration_ms}ms</span>
        </div>
      </header>

      {/* Headline stats */}
      <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="مهام نشطة"
          value={activeJobs ?? "—"}
          icon={ListChecks}
          tone={activeJobs && activeJobs > 0 ? "gold" : "neutral"}
          hint="قيد الانتظار + قيد التنفيذ"
        />
        <StatTile
          label="مهام متعثّرة"
          value={deadJobs ?? "—"}
          icon={Skull}
          tone={deadJobs && deadJobs > 0 ? "bad" : "good"}
          hint="آخر ٢٤ ساعة"
        />
        <StatTile
          label="استدعاءات الذكاء الاصطناعي"
          value={aiSucceeded ?? "—"}
          icon={Cpu}
          tone={aiFailed && aiFailed > 0 ? "warn" : "neutral"}
          hint={
            aiFailed !== null
              ? aiFailed > 0
                ? `${aiFailed} فشل خلال ٢٤ ساعة`
                : "بلا أخطاء خلال ٢٤ ساعة"
              : undefined
          }
        />
        <StatTile
          label="كلفة الذكاء الاصطناعي اليوم"
          value={aiCost !== null ? `$${aiCost.toFixed(2)}` : "—"}
          icon={CircleDollarSign}
          tone="purple"
          hint="مجموع المستويين"
        />
      </div>

      {/* Daily workflow */}
      <div className="mb-9">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          سير العمل اليومي
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <QuickTile href="/admin/khat-brain/seasons" icon={Compass} label="المواسم" description="تخطيط وتوليد" />
          <QuickTile href="/admin/discovery-v2" icon={Telescope} label="اكتشاف الضيوف" description="بحث ذكي" />
          <QuickTile href="/admin/khat-brain/episodes" icon={PlayCircle} label="الحلقات" description="خط الإنتاج" />
          <QuickTile href="/admin/studio" icon={Mic} label="الاستديو" description="معالجة المحتوى" />
          <QuickTile href="/admin/newsletter" icon={Mail} label="النشرة" description="حملات بريدية" />
          <QuickTile href="/admin/submissions" icon={Inbox} label="الطلبات" description="وارد الموقع" />
        </div>
      </div>

      {/* Operational sections — recolored light by the scoped tokens */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <QueueHealthSection result={snap.queue} />
        <SystemEventsSection result={snap.systemEvents} />
        <AiRouterSection result={snap.aiRouter} />
        <EirPipelineSection result={snap.eirPipeline} takenAt={snap.taken_at} />
        <RecentActivitySection result={snap.recentActivity} />
      </div>
    </div>
  )
}
