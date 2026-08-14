/**
 * `/admin/ops` — the admin home: what needs attention today, in one screen.
 *
 * NOT a launchpad. It was one, and the «ابدأ من هنا» block of six stateless
 * links was deleted (see below) precisely because a wall of links duplicating
 * the always-visible sidebar is not a home — it is a second navigation. What
 * earns space here is anything carrying a number, a queue, or a decision.
 *
 * Server component. Calls `takeOpsSnapshot()` server-side (no API route).
 *
 * Design intent: the home is read top-down, and the order IS the priority —
 *   1. ملخّص اليوم    — one computed sentence: who is waiting, what is due,
 *      is the machine healthy (lib/ops/day-summary.ts; no AI call).
 *   2. شريط الحالة    — the System-Health band. Green is EARNED, never default.
 *   3. الوارد         — the four human queues. A person waiting outranks a record.
 *   4. ما يحتاج انتباهك — the deduped episode attention queue.
 *   5. الأيام الجاية  — every dated commitment.
 *   6. نبض التشغيل    — THREE machine indicators. Deliberately down here: it is
 *      the least actionable block on the page («حلقات منشورة ٤١» asks nothing).
 *   7. خط إنتاج الحلقات — the five-stage funnel, each stage a filtered link.
 *
 * The «ابدأ من هنا» launchpad was DELETED: six tiles with no state and no
 * count, each a verbatim duplicate of an always-visible sidebar item, costing
 * 558px at 390px. Omar's rule — a link with a number beats a link without one
 * — and «الوارد» took its place in practice. Every destination it held is
 * still in the sidebar (locked by tests/ops/home-structure.test.ts).
 *
 * The deep operational telemetry (queue/events/AI-router/the full per-phase
 * pipeline breakdown/feed) lives one click away at `/admin/ops/details` —
 * nothing was removed, only rolled up.
 *
 * Visual system: a LIGHT, Apple-clean workspace. The admin shell already
 * flips KHAT tokens to the light surface; bespoke tiles here use a calm
 * slate palette with a single, sparing accent. No motion — quietly premium.
 *
 * TYPE SCALE — six steps, and nothing off them. This screen used to carry
 * SIXTEEN distinct sizes (9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15, 16, 17,
 * 26, 28, 30, 32 + `text-xs`/`text-sm`), most of them half-pixel apart. At
 * those deltas a size stops encoding hierarchy and just reads as inconsistency.
 * The floor also mattered on its own: an Arabic glyph body is ~74% of the
 * equivalent Latin x-height, so Arabic needs a LARGER minimum than a Latin UI,
 * not a smaller one — and this screen bottomed out at 9px.
 *   30px  display  — the page title, once per page
 *   26px  metric   — headline numerals (KPI values, pipeline total, inbox)
 *   17px  lead     — health-band title, funnel numeral
 *   15px  section  — h2 headings + the «ملخّص اليوم» lead sentence
 *   13px  body     — labels, row titles, CTAs, links, sentences
 *   11px  meta     — badges, timestamps, hints. Hard floor.
 * Sizes only — no element moved, no layout changed.
 *
 * `tracking-*` is gone from every Arabic run on this page (see the h1). It is
 * kept on the numerals, which are Latin and pair with `tabular-nums`.
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
  Activity,
  ListChecks,
  CircleDollarSign,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react"
import { takeOpsSnapshot, OPS_HOME_SECTIONS } from "@/lib/ops/snapshot"
import {
  deriveAiActivity,
  deriveAiAlerts,
  deriveAiHealthSentence,
  deriveCostCapLine,
  deriveCostStatus,
  derivePipelineFunnel,
  derivePipelineSummary,
  deriveQueueStatus,
  deriveSystemHealth,
  deriveWorkerSentence,
  type AiActivity,
  type SystemHealth,
} from "@/lib/ops/home-metrics"
import { deriveDaySummary } from "@/lib/ops/day-summary"
import type { WorkerHeartbeat } from "@/lib/ops/diagnostics"
import { countArchiveEpisodes } from "@/lib/queries/episodes"
import { getRecentActiveEirs } from "@/lib/eir/service"
import { getStaleEirs } from "@/lib/khat-brain/staleness"
import { buildAttentionQueue } from "@/lib/khat-brain/attention"
import { formatUtc } from "@/lib/ops/format"
import { PHASE_LABEL } from "@/lib/khat-brain/phase-labels"
import { TERMINAL_PHASES } from "@/lib/khat-brain/pipeline-stages"
import { arabicPluralNoun, formatArabicCount } from "@/lib/shared/formatters"
import { checkPageRole, hasRole } from "@/lib/api-utils"
import { getInboxCounts, buildInboxChannels, totalWaiting } from "@/lib/ops/inbox"
import { getAgendaRows, buildAgenda } from "@/lib/ops/agenda"
import { HomeAttention } from "./_components/home-attention"
import { AgendaSection } from "./_components/agenda-section"
import { InboxSection } from "./_components/inbox-section"
import { NoAccess } from "./_components/no-access"

export const dynamic = "force-dynamic"

// `TERMINAL_PHASES` — the phases that have LEFT the pipeline — now lives in
// `lib/khat-brain/pipeline-stages.ts`, next to the five-stage grouping the
// funnel below renders. They describe the same scope and must not be able to
// drift apart in two files.

// ─── Calm tone accents (used sparingly) ──────────────────────────────────────

type StatTone = "neutral" | "accent" | "gold"

// `-700`, not `-600`: the admin is a single forced-light surface and its
// colored text floor is documented by `ui-kit.tsx` (TONE_ICON/TONE_VALUE) —
// `-600` on a `-50` tint lands under 4.5:1 at these sizes.
const STAT_ICON: Record<StatTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-primary/5 text-primary",
  gold: "bg-amber-50 text-amber-700",
}

/**
 * NOT `StatCard` from `app/admin/components/ui-kit.tsx`. Checked, and kept
 * local for two behavioural reasons, not for taste:
 *   • `hint` is a `ReactNode` here. The cost tile renders FOUR stacked
 *     `<span className="block">` caveats (timezone, cap line, enforce
 *     warning, "this is a lower bound"). `StatCard.hint` is typed `string`
 *     and would collapse all four into one run — losing the qualification
 *     that keeps that number honest.
 *   • The layouts genuinely differ: `StatCard` puts the icon in a 40px square
 *     at the inline-start with the text beside it; this tile puts label and
 *     icon on a header row with a 26px numeral beneath. Swapping would be a
 *     re-layout of the KPI row, which this pass is explicitly not doing.
 * `className` (the grid escape hatch) is the third gap, and the cheapest to
 * close — but on its own it does not justify the merge. If `StatCard.hint`
 * ever widens to `ReactNode` AND this row is redesigned, revisit.
 */
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
        "rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] " +
        className
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${STAT_ICON[tone]}`}
        >
          <Icon className="h-[15px] w-[15px]" />
        </span>
      </div>
      <div className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
        {value}
      </div>
      {hint ? <div className="mt-2 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
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
        issueChip: "border-red-200 text-red-700",
      }
    : !known
      ? {
          wrap: "border-border bg-card",
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
            issueChip: "border-amber-200 text-amber-700",
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
          <div className={`text-[17px] font-semibold ${tone.title}`}>
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
            <div className={`mt-0.5 text-[13px] ${tone.sub}`}>
              {!health.allSectionsOk
                ? canSeeDetails
                  ? "تعذّر جلب بعض المؤشّرات — راجع تفاصيل التشغيل لمعرفة المصدر"
                  : "تعذّر جلب بعض المؤشّرات — أعِد تحميل الصفحة، وإذا استمر بلّغ مدير النظام"
                : // Names WHICH unknown it is (no beat yet / unreadable / DB
                  // down) instead of a vague "ما قدرنا نتأكد".
                  workerSentence}
            </div>
          ) : healthy ? (
            <div className={`mt-0.5 text-[13px] ${tone.sub}`}>
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
            <div className={`mt-0.5 text-[13px] ${tone.sub}`}>{workerSentence}</div>
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
                    "inline-flex items-center gap-1.5 rounded-xl border bg-card px-2.5 py-1 text-[11px] font-medium tabular-nums " +
                    (it.severity === "critical"
                      ? "border-red-200 text-red-700"
                      : tone.issueChip)
                  }
                >
                  {/* The label is the whole sentence and already carries its
                      own count, agreeing in number («3 مهام متعثّرة»,
                      «مهمتان متعثّرتان») — see lib/ops/home-metrics.ts. The
                      old numeric branch printed «{value}{label}» over a fixed
                      singular and produced «1 مهام متعثّرة»; `value` is now
                      typed `string` so that shape cannot come back.
                      A qualitative value still reads AFTER the label
                      («العامل … ما يرد — آخر نبض · منذ 21 يوم»). */}
                  {it.label}
                  {it.value === "" ? null : <span>{it.value}</span>}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {canSeeDetails ? (
        <Link
          href="/admin/ops/details"
          // 37px tall before this — under the 44px pointer floor (WCAG 2.5.5,
          // and short of the 24px minimum of 2.5.8 only by luck). Mobile gets
          // the full target; the compact desktop chrome is unchanged at `sm`.
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-border hover:text-foreground sm:min-h-0"
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
  const [snap, publishedEpisodes, recentEirs, staleEirs, inboxCounts, agendaRows] =
    await Promise.all([
      // Exactly the five sections this page reads. `systemEvents` and
      // `recentActivity` render only on /admin/ops/details, and the
      // guest-identity counters render nowhere at all — fetching them here
      // cost nine Postgres round-trips per load for data that was thrown
      // away. The list is `OPS_HOME_SECTIONS`, next to the section
      // definitions, so it can be checked against them.
      takeOpsSnapshot({ sections: OPS_HOME_SECTIONS }),
      countArchiveEpisodes(),
      getRecentActiveEirs(),
      getStaleEirs(),
      // The four human channels in ONE statement (lib/ops/inbox.ts); it swallows
      // its own errors into `null`, so it can never blank the page.
      getInboxCounts(),
      // Every dated commitment in ONE statement (lib/ops/agenda.ts). Same
      // contract: errors become `null`, never a blank or a false "nothing due".
      getAgendaRows(),
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
  // pushed this hint to four lines on a 390px screen.
  const activeJobsHint = [
    "مستحقة الآن + قيد التنفيذ",
    queueStatus.scheduled && queueStatus.scheduled > 0
      ? // «1 مجدولة لاحقًا» / «15 مجدولة» before this. The adjective agrees
        // with the noun in Arabic, so both travel together through the shared
        // table («مهمة مجدولة»); «لاحقًا» is an adverb and stays outside it.
        `${formatArabicCount(queueStatus.scheduled, "مهمة مجدولة")} لاحقًا`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const costCapLine = deriveCostCapLine(cost)

  // ── Episode pipeline summary ───────────────────────────────────────────────
  // Derived in `lib/ops/home-metrics.ts` so the headline and the grid under it
  // are computed ONCE, from one scope. They used to be built separately here:
  // the headline summed non-terminal phases, the grid rendered everything
  // except `archived`, and the cells therefore never added up to the number
  // printed above them in the same card.
  const pipeline = derivePipelineSummary(eir, PHASE_LABEL, TERMINAL_PHASES)

  // The five-stage funnel the card renders. Σ groups === `pipeline.inPipeline`
  // by construction — see lib/khat-brain/pipeline-stages.ts.
  const funnel = pipeline ? derivePipelineFunnel(pipeline) : null

  // The agenda: rows in → capped, sorted, overdue-flagged items out. `null`
  // propagates as "unreadable" and renders as such.
  const agenda = buildAgenda(agendaRows)

  // The header sentence. Derived LAST because it reads the three things
  // already computed above — the inbox total, the nearest agenda item, and the
  // health verdict — rather than re-deriving any of them.
  const inboxTotal = totalWaiting(inboxCounts)
  const daySummary = deriveDaySummary({ inboxTotal, agenda, health })

  return (
    <div dir="rtl" lang="ar">
      {/* Hero */}
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* No `tracking-tight` on Arabic: negative letter-spacing fights
              the cursive join. Chrome no-ops it on a pure-Arabic run, but it
              applies the moment a Latin token lands on the same line — so the
              SAME heading style renders two different ways depending on its
              content. Removed everywhere Arabic is the content; numerals keep
              theirs (they are Latin and it is what `tabular-nums` expects). */}
          <h1 className="text-[30px] font-semibold leading-tight text-foreground">
            الرئيسية
          </h1>
          {/* «ملخّص اليوم» — computed, never generated. Three clauses, each a
              direct read of a number rendered further down this page, so the
              headline and the sections can never disagree. See the rationale
              (and why an AI summary was rejected) in lib/ops/day-summary.ts. */}
          <p className="mt-1.5 text-[15px] text-muted-foreground" data-day-summary>
            {daySummary.text}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-[11px] text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <span className="admin-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {/* «2026-05-26 14:23:45Z» — the space between date and time is a
              bidi-neutral, so inside the RTL page UAX#9 handed it to the
              surrounding run and painted the TIME before the DATE. The
              duration span next to it needs no pin: it has no internal
              neutral to reorder. */}
          <span className="font-mono tabular-nums" dir="ltr">
            {formatUtc(snap.taken_at)}
          </span>
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
      <InboxSection channels={buildInboxChannels(inboxCounts)} total={inboxTotal} />

      {/* ما يحتاج انتباهك — one card per episode, stalls shown as a badge */}
      <HomeAttention queue={attentionQueue} />

      {/* الأيام الجاية — recordings, scheduled content, and due follow-ups */}
      <AgendaSection agenda={agenda} />

      {/* نبض التشغيل — THREE indicators, deliberately not four.
          «استدعاءات الذكاء الاصطناعي (24 ساعة)» was removed: it is an activity
          counter with no decision attached to it — 69 calls or 690 change
          nothing the operator would do — and the ONE actionable thing in it,
          failures, is exceptions-first material that the health band above
          already raises by itself.
          The cost tile is ADMIN-only and is REMOVED from the grid for lower
          roles; a permanent "—" placeholder would read as a broken metric. The
          track count follows the tile count so the row never ends ragged. */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <Activity className="h-4 w-4 text-primary" />
          نبض التشغيل
        </h2>
        <div
          className={
            // Was `lg:grid-cols-4` over four tiles, which made every card
            // NARROWER at 1024px than at 640px. Three tiles, and the column
            // count never goes down as the viewport grows.
            "grid grid-cols-2 gap-4 " + (canSeeCost ? "sm:grid-cols-3" : "")
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
                  {/* No `ltrIsolate` here, and that was CHECKED, not assumed:
                      an A/B of both strings in the live RTL page renders
                      «)Asia/Kuwait» identically with and without it. A zone id
                      is letters plus `/`, which resolves to one strong-L run
                      on its own — unlike «$30.00» (see `deriveCostCapLine`),
                      where `$` is a bidi EUROPEAN TERMINATOR and really does
                      migrate. Isolating this one would be a no-op wrapped in a
                      comment claiming a bug that isn't there. */}
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
          value={publishedEpisodes?.count ?? "—"}
          icon={Sparkles}
          tone="accent"
          // Names its source, because the pipeline card below carries a
          // SECOND «منشورة» number with a different (smaller) definition.
          // The label follows the SOURCE the count actually came from: when
          // the YouTube snapshot is unavailable the number really is the
          // database alone, and claiming «مع يوتيوب» over it would be a
          // smaller archive wearing a bigger label.
          hint={
            publishedEpisodes === null ? (
              "تعذّر قراءة الأرشيف"
            ) : (
              <>
                <span className="block">
                  {publishedEpisodes.source === "merged"
                    ? "الأرشيف الكامل مع يوتيوب — غير عدّاد المرحلة في بطاقة خط الإنتاج"
                    : "قاعدة الموقع فقط (لقطة يوتيوب غير متوفرة) — غير عدّاد المرحلة في بطاقة خط الإنتاج"}
                </span>
                {/* Reading this tile no longer REFRESHES the YouTube snapshot
                    — a page render must not fire an external API call — so on
                    the rare load where the snapshot has aged past its 12h TTL
                    the number says so rather than quietly under-reporting. */}
                {publishedEpisodes.stale ? (
                  <span className="block">لقطة يوتيوب قديمة — الرقم قد يكون متأخرًا</span>
                ) : null}
              </>
            )
          }
          // Without the cost tile the row is 3 tiles; on the 2-column
          // mobile grid the third would sit alone at half width and read
          // as a card that dropped out. Full-width below `sm` instead.
          // With the cost tile the row is 3 tiles; on the 2-column mobile grid
          // the third would sit alone at half width and read as a card that
          // dropped out. Full-width below `sm` instead. WITHOUT the cost tile
          // the row is exactly 2 and needs no escape hatch.
          className={canSeeCost ? "max-sm:col-span-2" : ""}
        />
        </div>
      </section>

      {/* Episode pipeline — headline count + the five-stage funnel */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[15px] font-semibold text-foreground">
            خط إنتاج الحلقات
          </h2>
          <Link
            href="/admin/khat-brain/episodes"
            // Bare text + icon, so its hit box was the 19px line box — it
            // failed even the 24px floor of WCAG 2.5.8, let alone 2.5.5's 44.
            // Padding is negative-margined away on `sm` so the desktop header
            // keeps its exact optical alignment with the heading beside it.
            className="-my-2 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground sm:my-0 sm:min-h-0"
          >
            كل الحلقات
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>

        {pipeline === null || funnel === null ? (
          <p className="mt-4 text-[13px] text-muted-foreground">تعذّر جلب بيانات المسار.</p>
        ) : (
          <div className="mt-4">
            <div className="flex items-baseline gap-3">
              <div
                className="text-[26px] font-semibold leading-none tracking-tight text-foreground tabular-nums"
                data-pipeline-total
              >
                {pipeline.inPipeline}
              </div>
              {/* The published figure is named by its SOURCE. There is a second
                  «منشورة» number on this page — the KPI tile above — and it is
                  legitimately larger: that one counts the public archive
                  (episodes + YouTube), this one counts production records that
                  reached the `published` PHASE. Two different questions; both
                  now say which one they answer. */}
              <div className="text-[13px] text-muted-foreground">
                {/* The numeral is the 26px element beside this caption, so the
                    caption carries the NOUN only — `arabicPluralNoun`, not
                    `formatArabicCount`, or the digit would print twice.
                    Was a fixed «حلقة»: «2 حلقة», «7 حلقة». */}
                {arabicPluralNoun(pipeline.inPipeline, "حلقة")} داخل خط الإنتاج
                <span className="text-muted-foreground">
                  {" "}
                  {/* Was «{n} سجل وصل …» — «3 سجل», and the verb «وصل» could
                      not agree either. Phrased with a preposition so the count
                      is the only thing that has to inflect. */}
                  · {formatArabicCount(pipeline.publishedCount, "سجل")} في مرحلة «منشورة»
                </span>
              </div>
            </div>

            {/* The funnel — FIVE stages, in lifecycle order, each one a link
                that lands on exactly the episodes it counted.

                It replaces a 13-cell grid whose bars were `count / peak`: a
                ratio with no statistical meaning (one record in every phase
                painted thirteen full bars), on a grid that wrapped to four
                rows at `lg` — destroying the pipeline ORDER, which is the one
                thing this view exists to show. `sharePct` below is
                `count / inPipeline`, a real share; the five bars sum to 100%.

                Nothing was lost: the full per-phase breakdown still renders in
                `EirPipelineSection` on /admin/ops/details.

                Five columns at EVERY width. A stack on mobile would keep the
                order but not the shape, and the shape is the point — so the
                labels are allowed two lines instead. */}
            <div className="mt-5 grid grid-cols-5 gap-1.5 sm:gap-2" data-pipeline-funnel>
              {funnel.map((g) => (
                <Link
                  key={g.key}
                  href={g.href}
                  data-funnel-stage={g.key}
                  data-funnel-count={g.count}
                  className={
                    "rounded-xl border p-2.5 transition-colors " +
                    (g.count > 0
                      ? "border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/40"
                      : "border-border/40 bg-muted/20 hover:border-border")
                  }
                >
                  <div className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">
                    {g.label}
                  </div>
                  <div className="mt-1 text-[17px] font-bold leading-none tabular-nums text-foreground">
                    {g.count}
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/40">
                    <div
                      className={"h-full " + (g.count > 0 ? "bg-primary" : "bg-transparent")}
                      style={{ width: `${g.sharePct}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
