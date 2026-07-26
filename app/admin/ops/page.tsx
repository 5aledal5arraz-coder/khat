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
 * Auth: the admin layout only AUTHENTICATES (valid session → render); it
 * performs no role check, and the proxy only checks that the session
 * cookie exists. RBAC is therefore enforced HERE, and the page gate is
 * deliberately the LOWEST role: `/admin` redirects here, so this page is
 * where every session lands after login — gating it above VIEWER left a
 * read-only account with no reachable landing page at all, and
 * contradicted the read/write split stated in `lib/api-utils.ts`
 * (GET-style reads are open to VIEWER). Sensitive material stays behind
 * its OWN, unchanged ADMIN gates rather than behind the page gate:
 *   • the AI-cost tile        → `canSeeCost`  (spend is not crew data)
 *   • `/admin/ops/details`    → ADMIN, enforced in that page + its link
 *     is hidden here for lower roles (worker identities, dead-job error
 *     text, rate-limit ceilings).
 * Read-only — reload to refresh.
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
import {
  deriveAiActivity,
  deriveAiAlerts,
  deriveAiHealthSentence,
  deriveAiHint,
  deriveCostCapLine,
  deriveCostStatus,
  deriveQueueStatus,
  deriveSystemHealth,
  deriveWorkerSentence,
  type AiActivity,
  type SystemHealth,
} from "@/lib/ops/home-metrics"
import type { WorkerHeartbeat } from "@/lib/ops/diagnostics"
import { getEpisodes } from "@/lib/queries/episodes"
import { getRecentActiveEirs } from "@/lib/eir/service"
import { getStaleEirs } from "@/lib/khat-brain/staleness"
import { buildAttentionQueue } from "@/lib/khat-brain/attention"
import { formatUtc } from "@/lib/ops/format"
import { PHASE_LABEL } from "@/lib/khat-brain/phase-labels"
import { EPISODE_PHASES, type EpisodePhase } from "@/lib/db/schema/eir"
import { checkPageRole, hasRole } from "@/lib/api-utils"
import { getInboxCounts, buildInboxChannels, totalWaiting } from "@/lib/ops/inbox"
import { HomeAttention } from "./_components/home-attention"
import { InboxSection } from "./_components/inbox-section"
import { NoAccess } from "./_components/no-access"

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
  className = "",
}: {
  label: string
  value: ReactNode
  /** ReactNode so a card can qualify its number on more than one line
   *  (e.g. the cost tile's "this is a lower bound" caveat). */
  hint?: ReactNode
  icon: LucideIcon
  tone?: StatTone
  /** Grid-placement escape hatch so a role-trimmed row never ends with a
   *  half-width orphan tile (reads as a card that failed to load). */
  className?: string
}) {
  return (
    <div
      className={
        "rounded-2xl border border-border/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] " +
        className
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${STAT_ICON[tone]}`}
        >
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
 * System-health band — the single "is everything OK?" answer.
 *
 * Green is EARNED, not the default: it requires all seven snapshot
 * sections to have resolved, a CONFIRMED-live job worker, AND zero
 * issues. "No AI calls at all" is stated as a fact in the subtitle
 * rather than dressed up as "no errors" — a silent system must not read
 * as a healthy one, and neither must an unreachable one.
 */
function SystemHealthBand({
  health,
  aiActivity,
  worker,
  canSeeDetails,
}: {
  health: SystemHealth
  aiActivity: AiActivity
  /** The raw heartbeat — the band names the exact worker state. */
  worker: WorkerHeartbeat | null
  /**
   * `/admin/ops/details` requires ADMIN. Below that role, BOTH the link
   * and the copy that points at it are withheld — sending a user to a
   * page that is guaranteed to refuse them is the opposite of the
   * "leave them somewhere they can read" contract in `checkPageRole`.
   */
  canSeeDetails: boolean
}) {
  // Unknown covers both "a section failed" and "we can't confirm the
  // worker is alive"; the subtitle below names which one it was.
  const known = health.level !== "unknown"
  const healthy = health.level === "healthy"
  const issues = health.issues

  // The two halves of the green subtitle, each stated honestly per state.
  const aiSentence = deriveAiHealthSentence(aiActivity)
  const workerSentence = deriveWorkerSentence(worker)

  // A confirmed-dead worker means production is STOPPED — nothing new is
  // processed at all. Dressing that in the same amber as "one job got
  // stuck" trains the operator to read both as routine, so it earns its
  // own red state. Red is reserved for exactly this: `workerAlive === false`,
  // which now requires a MISSED HEARTBEAT — not merely a quiet queue. An
  // idle worker is alive and is never painted red.
  const workerDead = health.workerAlive === false

  // A critical AI alert is the same class of event as a dead worker —
  // the provider refused us, or an enforcing cap is about to bite, and
  // nothing AI-powered will run until a human acts. Painting it amber
  // next to "one job got stuck" is exactly how a real outage gets read as
  // routine, so it earns the same red band.
  const stopped = workerDead || health.hasCritical

  const tone = stopped
    ? {
        wrap: "border-red-200 bg-gradient-to-l from-red-50/80 to-white",
        chip: "bg-red-100 text-red-700",
        title: "text-foreground",
        sub: "text-muted-foreground",
        issueChip: "border-red-200 text-red-800",
      }
    : !known
      ? {
          wrap: "border-border bg-white",
          chip: "bg-muted text-muted-foreground",
          title: "text-foreground",
          sub: "text-muted-foreground",
          // A neutral/white band with amber chips inside it was two
          // conflicting signals in one box; the chips follow the band.
          issueChip: "border-border text-muted-foreground",
        }
      : healthy
        ? {
            wrap: "border-emerald-200/70 bg-gradient-to-l from-emerald-50/70 to-white",
            chip: "bg-emerald-100 text-emerald-700",
            title: "text-foreground",
            sub: "text-muted-foreground",
            issueChip: "border-border text-muted-foreground",
          }
        : {
            wrap: "border-amber-200/80 bg-gradient-to-l from-amber-50/80 to-white",
            chip: "bg-amber-100 text-amber-700",
            title: "text-foreground",
            sub: "text-muted-foreground",
            issueChip: "border-amber-200 text-amber-800",
          }

  const Icon = stopped || (known && !healthy) ? AlertTriangle : known ? CheckCircle2 : Gauge

  // Chips are rendered whenever we have any — including in the unknown
  // state, so an unconfirmable worker never hides a stalled queue.
  const showIssues = issues.length > 0

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
            {workerDead
              ? "الإنتاج متوقف — عامل المهام ميت"
              : health.hasCritical
                ? // Names the CLASS of failure, not the detail — the chips
                  // below carry the specifics (which provider, which cap).
                  "الذكاء الاصطناعي متوقف — يحتاج تدخّل الآن"
                : !known
                  ? "تعذّر التأكد من حالة الأنظمة"
                  : healthy
                    ? "كل الأنظمة تعمل بسلاسة"
                    : "هناك ما يحتاج انتباهك"}
          </div>
          {!known ? (
            <div className={`mt-0.5 text-[12.5px] ${tone.sub}`}>
              {!health.allSectionsOk
                ? canSeeDetails
                  ? "تعذّر جلب بعض المؤشّرات — راجع تفاصيل التشغيل لمعرفة المصدر"
                  : "تعذّر جلب بعض المؤشّرات — أعِد تحميل الصفحة، وإذا استمر بلّغ مدير النظام"
                : // Names WHICH unknown it is (no beat yet / unreadable / DB
                  // down) instead of a vague "ما قدرنا نتأكد".
                  workerSentence}
            </div>
          ) : healthy ? (
            <div className={`mt-0.5 text-[12.5px] ${tone.sub}`}>
              {/* Was a hard-coded «العامل نشط», which could not tell a busy
                  worker from an idle one — the exact distinction the red
                  false-alarm hinged on. */}
              {workerSentence} · لا مهام متعثّرة · {aiSentence}
            </div>
          ) : !workerDead ? (
            /* Amber "something needs attention". The worker line is stated
               here too: the issue chips below describe the PROBLEM, and
               without this the operator has no way to see whether production
               is still moving while they read them. Skipped in the red
               branch, where the title AND a chip already say it. */
            <div className={`mt-0.5 text-[12.5px] ${tone.sub}`}>{workerSentence}</div>
          ) : null}
          {showIssues ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {issues.map((it) => (
                <span
                  key={it.label}
                  // rounded-xl/py-1, not a pill: the longest chip
                  // ("العامل (worker) ما يرد — آخر نبض منذ 21 يوم") sits a
                  // few px under the available width at 390px, and a pill
                  // that wraps to two lines renders as a deformed blob.
                  //
                  // A critical chip keeps its red regardless of the band's
                  // tone: in a mixed state the band can only be one colour,
                  // and the operator still has to be able to tell WHICH
                  // chip is the outage.
                  className={
                    "inline-flex items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1 text-[11.5px] font-medium " +
                    (it.severity === "critical"
                      ? "border-red-200 text-red-800"
                      : tone.issueChip)
                  }
                >
                  {/* Counts read before the label ("5 مهام متعثّرة");
                      qualitative values read after it ("… منذ 21 يوم").
                      An empty value renders the label alone — some alerts
                      are a statement, not a measurement. */}
                  {typeof it.value === "number" ? (
                    <>
                      <span className="tabular-nums">{it.value}</span>
                      {it.label}
                    </>
                  ) : it.value === "" ? (
                    it.label
                  ) : (
                    <>
                      {it.label}
                      <span>{it.value}</span>
                    </>
                  )}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {canSeeDetails ? (
        <Link
          href="/admin/ops/details"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-2 text-[12.5px] font-semibold text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-border hover:text-foreground"
        >
          تفاصيل التشغيل
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  )
}

export default async function OpsDashboardPage() {
  // Gate BEFORE any data work: an unauthorized visitor must not cost us
  // the snapshot fan-out, let alone see it. VIEWER is the floor — this is
  // the post-login landing page (see the header comment); at this level
  // the only sessions refused are unauthenticated or deactivated ones.
  const gate = await checkPageRole("VIEWER")
  if (!gate.ok) return <NoAccess roleLabelAr="مشاهد" />
  // Money is an owner/admin concern, not production-crew context.
  const canSeeCost = hasRole(gate.user.role, "ADMIN")
  // The deep telemetry view is ADMIN-only; don't advertise it below that.
  const canSeeDetails = hasRole(gate.user.role, "ADMIN")

  // "حلقات منشورة" counts the published-episode ARCHIVE (what an operator
  // reads the label to mean), NOT the EIR production pipeline. Fetched in
  // parallel with the ops snapshot; the pipeline's own published-phase count
  // still appears in the production-pipeline section below.
  // NOTE: getEpisodes({}) is the MERGED archive (episodes table + YouTube-
  // only episodes not materialized in the DB), so this number is larger
  // than the analytics dashboard's «إجمالي الحلقات (قاعدة الموقع)», which
  // counts the episodes table alone. Both cards state their source.
  const [snap, publishedEpisodes, recentEirs, staleEirs, inboxCounts] = await Promise.all([
    takeOpsSnapshot(),
    getEpisodes({}).then((eps) => eps.length).catch(() => null),
    getRecentActiveEirs(),
    getStaleEirs(),
    // The four human channels in ONE statement (lib/ops/inbox.ts); it swallows
    // its own errors into `null`, so it can never blank the page.
    getInboxCounts(),
  ])

  const queue = snap.queue.ok ? snap.queue.data : null
  const ai = snap.aiRouter.ok ? snap.aiRouter.data : null
  const eir = snap.eirPipeline.ok ? snap.eirPipeline.data : null

  // "ما يحتاج انتباهك" — merged in from the retired Khat Brain command center
  // (Phase 2.2). ONE deduped list: `recentEirs` and `staleEirs` overlap by
  // construction (stale rows are a subset of the recently-touched ones), and
  // rendering them as two sections drew the same episode twice. The merge is
  // keyed by `eir.id` — see lib/khat-brain/attention.ts.
  const attentionQueue = buildAttentionQueue({ recent: recentEirs, stale: staleEirs })

  // Every headline number is derived in `lib/ops/home-metrics.ts` — pure,
  // unit-tested, and the single place the "absence ≠ success" rule lives.
  // Nothing on this page computes a metric inline.
  const queueStatus = deriveQueueStatus(queue)
  const aiActivity = deriveAiActivity(ai)
  const cost = deriveCostStatus(ai)
  // The five silent-failure alerts. Exceptions-first: this is an empty array
  // on a healthy system and nothing renders. The cost-derived one is
  // ADMIN-only, same rule as the cost tile — so health is derived from
  // exactly the alerts this viewer can actually see.
  const aiAlerts = deriveAiAlerts(snap, { includeCost: canSeeCost })
  const health = deriveSystemHealth(snap, { aiAlerts })

  // "Active" = due now + running. Future-scheduled pending jobs are
  // reported separately instead of padding this number.
  const activeJobs =
    queueStatus.dueNow !== null && queueStatus.running !== null
      ? queueStatus.dueNow + queueStatus.running
      : null
  // The stalled-queue age deliberately does NOT appear here: the health
  // band directly above already states it verbatim, and repeating it
  // pushed this hint to four lines on a 390px screen — shoving the
  // "ابدأ من هنا" launchpad below the fold.
  const activeJobsHint = [
    "مستحقة الآن + قيد التنفيذ",
    queueStatus.scheduled && queueStatus.scheduled > 0
      ? `${queueStatus.scheduled} مجدولة لاحقًا`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const aiHint = deriveAiHint(aiActivity)
  const costCapLine = deriveCostCapLine(cost)

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
          health={health}
          aiActivity={aiActivity}
          worker={snap.worker.ok ? snap.worker.data : null}
          canSeeDetails={canSeeDetails}
        />
      </div>

      {/* الوارد — the four HUMAN channels. Above the attention queue on
          purpose: an unanswered person outranks a stalled record. */}
      <InboxSection
        channels={buildInboxChannels(inboxCounts)}
        total={totalWaiting(inboxCounts)}
      />

      {/* ما يحتاج انتباهك — one card per episode, stalls shown as a badge */}
      <HomeAttention queue={attentionQueue} />

      {/* Headline stats. The cost tile is ADMIN-only and is REMOVED from
          the grid for lower roles — a permanent "—" placeholder would
          read as a broken metric. The track count follows the tile
          count so the row never ends ragged. */}
      <div
        className={
          "mb-8 grid grid-cols-2 gap-4 " + (canSeeCost ? "lg:grid-cols-4" : "sm:grid-cols-3")
        }
      >
        <StatTile
          label="مهام نشطة"
          value={activeJobs ?? "—"}
          icon={ListChecks}
          tone={activeJobs && activeJobs > 0 ? "gold" : "neutral"}
          // A hint that describes what the number is made of must not
          // survive the number itself going unreadable.
          hint={queue === null ? "تعذّر قراءة الطابور" : activeJobsHint}
        />
        <StatTile
          label="استدعاءات الذكاء الاصطناعي (24 ساعة)"
          value={aiActivity.state === "unavailable" ? "—" : aiActivity.total24h}
          icon={Cpu}
          tone="neutral"
          hint={aiHint}
        />
        {canSeeCost ? (
          <StatTile
            label="كلفة الذكاء الاصطناعي اليوم"
            value={cost.totalUsd !== null ? `$${cost.totalUsd.toFixed(2)}` : "—"}
            icon={CircleDollarSign}
            tone={cost.totalUsd !== null && cost.level !== "ok" ? "gold" : "neutral"}
            hint={
              cost.totalUsd === null ? undefined : (
                <>
                  {/* The zone is printed ONLY when the DB actually reported
                      one — a guessed "UTC" next to a money figure is a fact
                      we never read. */}
                  <span className="block">
                    {cost.tz ? `إجمالي اليوم (بتوقيت ${cost.tz})` : "إجمالي اليوم"}
                  </span>
                  {costCapLine ? <span className="block">{costCapLine}</span> : null}
                  {cost.mode === "enforce" && cost.level === "danger" ? (
                    <span className="block">قريب من السقف — الاستدعاءات راح تتوقف</span>
                  ) : null}
                  {cost.unpricedCount > 0 ? (
                    <span className="block">
                      الرقم حدّ أدنى — {cost.unpricedCount} استدعاء بلا كلفة مسجّلة
                    </span>
                  ) : null}
                </>
              )
            }
          />
        ) : null}
        <StatTile
          label="حلقات منشورة"
          value={publishedEpisodes ?? "—"}
          icon={Sparkles}
          tone="accent"
          hint="الأرشيف الكامل مع يوتيوب"
          // Without the cost tile the row is 3 tiles; on the 2-column
          // mobile grid the third would sit alone at half width and read
          // as a card that dropped out. Full-width below `sm` instead.
          className={canSeeCost ? "" : "max-sm:col-span-2"}
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
