/**
 * `/admin/ops` — the admin home: a calm, launchpad-style command dashboard.
 *
 * Server component. Calls `takeOpsSnapshot()` server-side (no API route).
 *
 * Design intent (redesign): the home answers three questions at a glance —
 *   1. Is everything OK?      → one System-Health band (green by default,
 *      flips to an attention banner ONLY when something is actually wrong).
 *   2. What needs me / what's the pulse? → a tidy 4-KPI row + a compact
 *      episode-pipeline summary (active phases only, not a 15-cell grid).
 *   3. What do I want to go do? → a promoted "ابدأ من هنا" launchpad of the
 *      six daily workflows.
 * The deep operational telemetry (queue/events/AI-router/pipeline/feed) now
 * lives one click away at `/admin/ops/details` — nothing was removed.
 *
 * Visual system: a LIGHT, Apple-clean workspace. The admin shell already
 * flips KHAT tokens to the light surface; bespoke tiles here use a calm
 * slate palette with a single, sparing accent. No motion — quietly premium.
 *
 * Auth + RBAC: handled by the admin layout. Read-only — reload to refresh.
 */

import type { ReactNode } from "react"
import Link from "next/link"
import {
  Compass,
  Telescope,
  PlayCircle,
  Mic,
  Mail,
  Inbox,
  ListChecks,
  Cpu,
  CircleDollarSign,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  ArrowUpLeft,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react"
import { takeOpsSnapshot } from "@/lib/ops/snapshot"
import { getEpisodes } from "@/lib/queries/episodes"
import { getRecentActiveEirs } from "@/lib/eir/service"
import { getStaleEirs } from "@/lib/khat-brain/staleness"
import { buildNextActionQueue } from "@/lib/khat-brain/next-action"
import { formatUtc } from "@/lib/ops/format"
import { PHASE_LABEL } from "@/lib/khat-brain/phase-labels"
import { EPISODE_PHASES, type EpisodePhase } from "@/lib/db/schema/eir"
import { HomeAttention } from "./_components/home-attention"

export const dynamic = "force-dynamic"

// Phases that represent live work "in the pipeline" — everything except the
// terminal published/archived buckets (published is celebrated separately).
const TERMINAL_PHASES: ReadonlySet<EpisodePhase> = new Set<EpisodePhase>([
  "published",
  "archived",
])

// ─── Calm tone accents (used sparingly) ──────────────────────────────────────

type StatTone = "neutral" | "accent" | "gold"

const STAT_ICON: Record<StatTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-violet-50 text-violet-600",
  gold: "bg-amber-50 text-amber-600",
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
    <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${STAT_ICON[tone]}`}>
          <Icon className="h-[15px] w-[15px]" />
        </span>
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
        {value}
      </div>
      {hint ? <div className="mt-2 text-[11.5px] text-muted-foreground">{hint}</div> : null}
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
      className="group flex items-center gap-3.5 rounded-2xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-muted-foreground/30 hover:bg-muted/60"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-white">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-foreground">{label}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">{description}</span>
      </span>
      <ArrowUpLeft className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
    </Link>
  )
}

/**
 * System-health band — the single "is everything OK?" answer. Green and
 * reassuring by default; surfaces an attention banner with the specific
 * non-zero problems ONLY when something is actually wrong (exceptions-first).
 */
function SystemHealthBand({
  healthy,
  metricsAvailable,
  issues,
}: {
  healthy: boolean
  metricsAvailable: boolean
  issues: Array<{ label: string; value: number }>
}) {
  const tone = !metricsAvailable
    ? {
        wrap: "border-border bg-white",
        chip: "bg-muted text-muted-foreground",
        title: "text-foreground",
        sub: "text-muted-foreground",
      }
    : healthy
      ? {
          wrap: "border-emerald-200/70 bg-gradient-to-l from-emerald-50/70 to-white",
          chip: "bg-emerald-100 text-emerald-700",
          title: "text-foreground",
          sub: "text-muted-foreground",
        }
      : {
          wrap: "border-amber-200/80 bg-gradient-to-l from-amber-50/80 to-white",
          chip: "bg-amber-100 text-amber-700",
          title: "text-foreground",
          sub: "text-muted-foreground",
        }

  const Icon = !metricsAvailable ? Gauge : healthy ? CheckCircle2 : AlertTriangle

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${tone.wrap}`}
    >
      <div className="flex items-center gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone.chip}`}>
          <Icon className="h-[22px] w-[22px]" />
        </span>
        <div>
          <div className={`text-[16px] font-semibold tracking-tight ${tone.title}`}>
            {!metricsAvailable
              ? "تعذّر جلب بعض المؤشّرات"
              : healthy
                ? "كل الأنظمة تعمل بسلاسة"
                : "هناك ما يحتاج انتباهك"}
          </div>
          {!metricsAvailable ? (
            <div className={`mt-0.5 text-[12.5px] ${tone.sub}`}>
              راجع تفاصيل التشغيل لمعرفة المصدر
            </div>
          ) : healthy ? (
            <div className={`mt-0.5 text-[12.5px] ${tone.sub}`}>
              لا مهام متعثّرة · لا أخطاء في الذكاء الاصطناعي خلال ٢٤ ساعة
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {issues.map((it) => (
                <span
                  key={it.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-[11.5px] font-medium text-amber-800"
                >
                  <span className="tabular-nums">{it.value}</span>
                  {it.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <Link
        href="/admin/ops/details"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-2 text-[12.5px] font-semibold text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-border hover:text-foreground"
      >
        تفاصيل التشغيل
        <ArrowLeft className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

export default async function OpsDashboardPage() {
  // "حلقات منشورة" counts the published-episode ARCHIVE (what an operator
  // reads the label to mean), NOT the EIR production pipeline. Fetched in
  // parallel with the ops snapshot; the pipeline's own published-phase count
  // still appears in the production-pipeline section below.
  // NOTE: getEpisodes({}) is the MERGED archive (episodes table + YouTube-
  // only episodes not materialized in the DB), so this number is larger
  // than the analytics dashboard's «إجمالي الحلقات (قاعدة الموقع)», which
  // counts the episodes table alone. Both cards state their source.
  const [snap, publishedEpisodes, recentEirs, staleEirs] = await Promise.all([
    takeOpsSnapshot(),
    getEpisodes({}).then((eps) => eps.length).catch(() => null),
    getRecentActiveEirs(),
    getStaleEirs(),
  ])

  const queue = snap.queue.ok ? snap.queue.data : null
  const ai = snap.aiRouter.ok ? snap.aiRouter.data : null
  const eir = snap.eirPipeline.ok ? snap.eirPipeline.data : null

  // "ما يحتاج انتباهك" — merged in from the retired Khat Brain command center
  // (Phase 2.2). Top 8 keeps the home scannable.
  const nextActionQueue = buildNextActionQueue(recentEirs).slice(0, 8)

  const activeJobs = queue
    ? (queue.countsByStatus.pending ?? 0) + (queue.countsByStatus.running ?? 0)
    : null
  const deadJobs = queue ? queue.recentDead.length : null
  const staleLease = queue ? queue.staleLeaseCount : null
  const aiSucceeded = ai ? (ai.ai_runs_status_counts_24h.succeeded ?? 0) : null
  const aiFailed = ai
    ? (ai.ai_runs_status_counts_24h.failed ?? 0) + (ai.ai_runs_status_counts_24h.timed_out ?? 0)
    : null
  const aiCost = ai
    ? Object.values(ai.tiers).reduce((s, t) => s + (t.daily_cost_usd ?? 0), 0)
    : null

  // ── Episode pipeline summary (active phases only) ──────────────────────────
  const publishedCount = eir ? (eir.countByPhase.published ?? 0) : null
  const activePhases = eir
    ? EPISODE_PHASES.filter((p) => !TERMINAL_PHASES.has(p) && (eir.countByPhase[p] ?? 0) > 0).map(
        (p) => ({ phase: p, label: PHASE_LABEL[p], count: eir.countByPhase[p] ?? 0 }),
      )
    : []
  const inPipeline = activePhases.reduce((s, p) => s + p.count, 0)

  // Full phase distribution (all 14 non-archived stages, incl. empty ones) —
  // merged in from the retired command center (P2.2). Empty stages render
  // dimmed so the operator sees the whole pipeline shape, not just active work.
  const allPhases = eir
    ? EPISODE_PHASES.filter((p) => p !== "archived").map((p) => ({
        phase: p,
        label: PHASE_LABEL[p],
        count: eir.countByPhase[p] ?? 0,
      }))
    : []
  const phasePeak = Math.max(1, ...allPhases.map((p) => p.count))

  // ── System health (exceptions-first) ───────────────────────────────────────
  const metricsAvailable = snap.queue.ok && snap.aiRouter.ok
  const issues: Array<{ label: string; value: number }> = []
  if (deadJobs && deadJobs > 0) issues.push({ label: "مهام متعثّرة", value: deadJobs })
  if (staleLease && staleLease > 0)
    issues.push({ label: "مهام بإيجار منتهٍ", value: staleLease })
  if (aiFailed && aiFailed > 0)
    issues.push({ label: "فشل في الذكاء الاصطناعي", value: aiFailed })
  const healthy = metricsAvailable && issues.length === 0

  return (
    <div dir="rtl" lang="ar">
      {/* Hero */}
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-foreground">
            الرئيسية
          </h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            كل أدواتك في مكان واحد — لمحة سريعة، ثم انطلق إلى العمل
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-white px-3.5 py-1.5 text-[11.5px] text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <span className="admin-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="font-mono tabular-nums">{formatUtc(snap.taken_at)}</span>
          <span>•</span>
          <span className="font-mono tabular-nums">{snap.duration_ms}ms</span>
        </div>
      </header>

      {/* System health band */}
      <div className="mb-6">
        <SystemHealthBand
          healthy={healthy}
          metricsAvailable={metricsAvailable}
          issues={issues}
        />
      </div>

      {/* ما يحتاج انتباهك + حلقات متوقفة — merged from the command center (P2.2) */}
      <HomeAttention queue={nextActionQueue} staleEirs={staleEirs} />

      {/* Headline stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="مهام نشطة"
          value={activeJobs ?? "—"}
          icon={ListChecks}
          tone={activeJobs && activeJobs > 0 ? "gold" : "neutral"}
          hint="قيد الانتظار + قيد التنفيذ"
        />
        <StatTile
          label="استدعاءات الذكاء الاصطناعي"
          value={aiSucceeded ?? "—"}
          icon={Cpu}
          tone="neutral"
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
          tone="neutral"
          hint="إجمالي اليوم"
        />
        <StatTile
          label="حلقات منشورة"
          value={publishedEpisodes ?? "—"}
          icon={Sparkles}
          tone="accent"
          hint="الأرشيف الكامل مع يوتيوب"
        />
      </div>

      {/* Launchpad — the daily workflows, promoted */}
      <div className="mb-8">
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          ابدأ من هنا
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuickTile href="/admin/khat-brain/seasons" icon={Compass} label="المواسم" description="تخطيط وتوليد المواسم" />
          <QuickTile href="/admin/discovery-v2" icon={Telescope} label="اكتشاف الضيوف" description="بحث ذكي عن ضيوف" />
          <QuickTile href="/admin/khat-brain/episodes" icon={PlayCircle} label="خط الإنتاج" description="خط إنتاج الحلقات" />
          <QuickTile href="/admin/studio" icon={Mic} label="الاستوديو" description="معالجة المحتوى" />
          <QuickTile href="/admin/newsletter" icon={Mail} label="النشرة" description="حملات بريدية" />
          <QuickTile href="/admin/submissions" icon={Inbox} label="الطلبات" description="وارد الموقع" />
        </div>
      </div>

      {/* Episode pipeline summary — headline count + full phase distribution */}
      <div className="rounded-2xl border border-border/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            خط إنتاج الحلقات
          </h2>
          <Link
            href="/admin/khat-brain/episodes"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            كل الحلقات
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>

        {eir === null ? (
          <p className="mt-4 text-[12.5px] text-muted-foreground">تعذّر جلب بيانات المسار.</p>
        ) : (
          <div className="mt-4">
            <div className="flex items-baseline gap-3">
              <div className="text-[32px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
                {inPipeline}
              </div>
              <div className="text-[12px] text-muted-foreground">
                حلقة في خط الإنتاج
                {publishedCount !== null ? (
                  <span className="text-muted-foreground"> · {publishedCount} منشورة</span>
                ) : null}
              </div>
            </div>

            {/* Full phase distribution — the 14 stages, compact (P2.2). */}
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {allPhases.map((p) => {
                const pct = (p.count / phasePeak) * 100
                return (
                  <div
                    key={p.phase}
                    className={
                      "rounded-xl border p-2.5 transition-colors " +
                      (p.count > 0
                        ? "border-border bg-white"
                        : "border-border/40 bg-muted/20 opacity-60")
                    }
                  >
                    <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                      {p.label}
                    </div>
                    <div className="mt-0.5 text-[17px] font-bold tabular-nums text-foreground">
                      {p.count}
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/40">
                      <div
                        className={"h-full " + (p.count > 0 ? "bg-primary" : "bg-transparent")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
