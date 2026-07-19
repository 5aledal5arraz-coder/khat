/**
 * UX-2 — Season Workspace.
 *
 *   /admin/khat-brain/seasons/[seasonId]
 *
 * One coherent page for everything an operator does at the season
 * level: see market freshness, kick off Hybrid topic generation, review
 * pending candidates, and navigate to accepted episodes.
 *
 * Composition:
 *   - Server-rendered shell (this file) loads season + market signals +
 *     accepted candidates + pending candidates + EIR phases.
 *   - Mounts the existing v2 wizard (`WizardClient`) for the candidate
 *     review stack so accept/reject/alternative server actions keep
 *     working unchanged. Legacy "Generate Batch" is hidden by default
 *     (KHAT_LEGACY_BATCH_ENABLED gate from Phase A).
 *   - Adds new UX-2 surfaces above the wizard:
 *       * MarketFreshness widget (signals_last_7d + top clusters)
 *       * Hybrid generation panel (the existing button, repositioned
 *         and explained)
 *       * Accepted-episodes panel with per-EIR Next Action CTAs.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import {
  Compass,
  Sparkles,
  Activity,
  ArrowRight,
  AlertTriangle,
  Telescope,
  Lightbulb,
} from "lucide-react"
import { requireAdmin } from "@/lib/api-utils"
import { getSeasonById } from "@/lib/khat-map/core/queries"
import {
  getSeasonProgressAction,
  listPendingCardsAction,
  listAcceptedCardsAction,
  listSeasonProductionStatusAction,
} from "../actions"
import { WizardClient } from "./_components/wizard-client"
import { PhaseBPanel } from "./_components/phase-b-panel"
import { HybridGenerateButton } from "./_components/hybrid-button"
import { MarketSignalsCard } from "./_components/market-signals-card"
import { WhatWorkedCard } from "./_components/what-worked-card"
import { HybridDiagnosticsPanel } from "./_components/hybrid-diagnostics-panel"
import { buildWorkedReport } from "@/lib/khat-brain/performance-learning"
import {
  getMarketTotals,
  getTopClusters,
} from "@/lib/market-intelligence/queries"
import { getMarketFreshness } from "@/lib/market-intelligence/freshness"
import { getHybridReadiness } from "@/lib/hybrid-topics/diagnostics"
import { loadEirPhasesForCandidates } from "@/lib/khat-brain/seasons-summary"
import { nextActionFor } from "@/lib/khat-brain/next-action"
import { getAiHealth } from "@/lib/ai-router/health"
import { getDomainBalanceReport } from "@/lib/khat-brain/season-rhythm"
import { AiHealthBanner } from "../../components/ai-health-banner"
import { BulkConvertButton } from "./bulk-convert-button"
import {
  KHAT_SEASON_STATUS_LABEL,
  KHAT_TOPIC_DOMAIN_LABEL,
} from "@/types/khat-map"
import type { EpisodePhase } from "@/lib/db/schema/eir"

export const dynamic = "force-dynamic"

const PHASE_LABEL_AR: Record<EpisodePhase, string> = {
  idea: "فكرة",
  guest_discovery: "اكتشاف ضيف",
  guest_assigned: "ضيف معيّن",
  approved: "معتمدة",
  researching: "قيد البحث",
  prepared: "إعداد جاهز",
  ready_to_record: "جاهزة للتسجيل",
  recording: "قيد التسجيل",
  recorded: "مسجّلة",
  producing: "إنتاج",
  ready_to_publish: "جاهزة للنشر",
  published: "منشورة",
  analyzing: "تحليل",
  learned: "تم التعلّم",
  archived: "مؤرشفة",
}

export default async function SeasonWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ seasonId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()
  const { seasonId } = await params
  const sp = (await searchParams) ?? {}
  const season = await getSeasonById(seasonId)
  if (!season) notFound()

  const [
    progressRes,
    pendingRes,
    acceptedRes,
    productionRes,
    ,
    ,
    marketFreshness,
    aiHealth,
    rhythm,
    hybridReadiness,
    workedReport,
  ] = await Promise.all([
    getSeasonProgressAction(seasonId),
    listPendingCardsAction(seasonId),
    listAcceptedCardsAction(seasonId),
    listSeasonProductionStatusAction(seasonId),
    getMarketTotals(),
    getTopClusters(3),
    getMarketFreshness(),
    getAiHealth(),
    getDomainBalanceReport(seasonId),
    getHybridReadiness(),
    buildWorkedReport(),
  ])
  // Dev-only readiness panel. Hidden by default even in dev — needs
  // an explicit opt-in to avoid leaking internal tables to operators.
  // Either set KHAT_SHOW_DEV_DIAGNOSTICS=true in env, or visit the
  // page with ?debug=1 in the URL.
  const showDiagnostics =
    process.env.NODE_ENV === "development" &&
    (process.env.KHAT_SHOW_DEV_DIAGNOSTICS === "true" || sp.debug === "1")

  // Per-accepted-card EIR phase lookup (so "Episodes in this season"
  // can show next-action CTAs for cards that walked into an EIR).
  const accepted = acceptedRes.success ? acceptedRes.data : []
  const acceptedIds = accepted.map((p) => p.topic.id)
  const phasesByCandidate = await loadEirPhasesForCandidates(acceptedIds)

  const legacyBatchEnabled =
    process.env.KHAT_LEGACY_BATCH_ENABLED === "true"

  if (!progressRes.success) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8">
          <div className="text-sm font-semibold text-rose-700">
            تعذّر تحميل الموسم
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {progressRes.error}
          </p>
          <p className="mt-4 text-[11px] text-muted-foreground" dir="ltr">
            ID: {seasonId}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── AI health banner — fix #1 ────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <AiHealthBanner snapshot={aiHealth} />
      </div>

      {/* ── Top breadcrumbs + season header ──────────────────── */}
      <div className="mx-auto max-w-7xl px-4">
        <Link
          href="/admin/khat-brain/seasons"
          className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-3 w-3" /> العودة إلى المواسم
        </Link>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[10.5px] font-medium text-primary">
              <Compass className="h-3 w-3" /> مساحة عمل الموسم
            </div>
            <h1 className="text-xl font-bold tracking-tight">{season.name}</h1>
            <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${KHAT_SEASON_STATUS_LABEL[season.status].bg} ${KHAT_SEASON_STATUS_LABEL[season.status].text}`}
              >
                {KHAT_SEASON_STATUS_LABEL[season.status].label}
              </span>
              {season.v2_mode && (
                <span
                  className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                  dir="ltr"
                >
                  {season.v2_mode}
                </span>
              )}
              <span dir="ltr">
                target {season.target_episode_count} eps
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Accepted episodes — surfaced first when work is in flight ─ */}
      {accepted.length > 0 && (
        <div className="mx-auto max-w-7xl space-y-3 px-4">
          {/* Fix #2.11 — soft rhythm warning when a domain is at cap. */}
          {rhythm.has_warning && (
            <div
              className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-[12px]"
              data-rhythm-warning
            >
              <div className="mb-1 inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                <AlertTriangle className="h-3 w-3" />
                إشعار توازن الموسم
              </div>
              <p className="text-foreground/85">
                هذا الموسم يستوعب حتى {rhythm.per_domain_cap} حلقات لكل
                مجال (هدف {rhythm.season_target} حلقات). المجالات التي
                وصلت أو تجاوزت الحد:
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {rhythm.domain_counts
                  .filter((d) => d.at_cap)
                  .map((d) => (
                    <li
                      key={d.domain}
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        d.over_cap
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-700"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-700"
                      }`}
                    >
                      {d.domain} · {d.accepted_count}/{rhythm.per_domain_cap}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Fix #2.9 + #2.10 — bulk convert sits ABOVE the accepted
              list so the operator can't miss the "you still need to
              convert" gate after approving. `listAcceptedCardsAction`
              already filters to status='approved' only — so
              `accepted.length` IS the convertable count. */}
          <BulkConvertButton
            seasonId={seasonId}
            approvedCount={accepted.length}
            convertableCount={accepted.filter((a) => a.guest).length}
            blockedItems={accepted
              .filter((a) => !a.guest)
              .map((a) => ({
                id: a.topic.id,
                title: a.topic.working_title,
              }))}
          />
          {/* Manual mode lists its topics in the authoring surface below. */}
          {season.v2_mode !== "manual" && (
            <AcceptedEpisodes
              accepted={accepted}
              phasesByCandidate={phasesByCandidate}
            />
          )}
        </div>
      )}

      {/* ── Hybrid generation panel + market freshness ──────────
          AI-driven — hidden in manual mode, where the operator authors
          every topic by hand. */}
      {season.v2_mode !== "manual" && (
        <div className="mx-auto max-w-7xl space-y-4 px-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              <HybridPanel
                seasonId={seasonId}
                targetEpisodes={season.v2_episode_target ?? 10}
                aiBlocked={aiHealth.buttons_disabled}
                aiBlockReason={
                  aiHealth.buttons_disabled ? aiHealth.banner_message : null
                }
              />
              {showDiagnostics && (
                <HybridDiagnosticsPanel readiness={hybridReadiness} />
              )}
            </div>
            <div className="lg:col-span-1">
              <MarketSignalsCard seasonId={seasonId} freshness={marketFreshness} />
              <WhatWorkedCard worked={workedReport} />
            </div>
          </div>
        </div>
      )}

      {/* ── Accepted episodes (fallback position when none yet) ─
          Manual mode renders its own authoring list inside WizardClient. */}
      {accepted.length === 0 && season.v2_mode !== "manual" && (
        <div className="mx-auto max-w-7xl px-4">
          <AcceptedEpisodes
            accepted={accepted}
            phasesByCandidate={phasesByCandidate}
          />
        </div>
      )}

      {/* ── Topic surface ───────────────────────────────────────
          Manual mode: the WizardClient IS the authoring surface (add /
          edit / remove topics), so render it directly + always open.
          AI modes: keep the collapsible "review new candidates" stack. */}
      <div className="mx-auto max-w-7xl px-4">
        {season.v2_mode === "manual" ? (
          <WizardClient
            season={season}
            progress={progressRes.success ? progressRes.data : null}
            initialPending={pendingRes.success ? pendingRes.data : []}
            initialAccepted={acceptedRes.success ? acceptedRes.data : []}
            initialProduction={
              productionRes.success ? productionRes.data.rows : []
            }
            legacyBatchEnabled={legacyBatchEnabled}
          />
        ) : (
          <details
            className="group rounded-3xl border border-border/40 bg-card/20 p-1"
            open={accepted.length === 0}
            data-wizard-collapsible
          >
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-[13px] font-semibold text-foreground/85 hover:bg-muted/20">
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-violet-700" />
                مراجعة المرشحين الجدد
              </span>
              <span className="text-[10.5px] font-normal text-muted-foreground group-open:hidden">
                اضغط للفتح
              </span>
              <span className="hidden text-[10.5px] font-normal text-muted-foreground group-open:inline">
                اضغط للإغلاق
              </span>
            </summary>
            <div className="mt-1">
              <WizardClient
                season={season}
                progress={progressRes.success ? progressRes.data : null}
                initialPending={pendingRes.success ? pendingRes.data : []}
                initialAccepted={acceptedRes.success ? acceptedRes.data : []}
                initialProduction={
                  productionRes.success ? productionRes.data.rows : []
                }
                legacyBatchEnabled={legacyBatchEnabled}
              />
            </div>
          </details>
        )}
      </div>

      {/* Phase B — per-episode guest discovery. Activates once topics
          are locked; idle in Phase A. Each locked topic gets its own
          discovery surface here, independent of the wizard above. */}
      {(season.wizard_stage === "topics_locked" ||
        season.wizard_stage === "guests" ||
        season.wizard_stage === "complete") && (
        <div className="mx-auto max-w-7xl px-4">
          <PhaseBPanel
            seasonId={season.id}
            episodes={(acceptedRes.success ? acceptedRes.data : []).map(
              (p) => ({
                topic: p.topic,
                assignedGuest: p.guest,
              }),
            )}
          />
        </div>
      )}
    </div>
  )
}

// ─── HybridPanel ─────────────────────────────────────────────────────

function HybridPanel({
  seasonId,
  targetEpisodes,
  aiBlocked,
  aiBlockReason,
}: {
  seasonId: string
  /**
   * CR-8 — drives the generator-button label so it says
   * "إنشاء N مرشّحات هجينة" where N = season.v2_episode_target
   * (was hardcoded to 10).
   */
  targetEpisodes: number
  aiBlocked: boolean
  aiBlockReason: string | null
}) {
  return (
    <div className="rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-500/5 to-primary/5 p-5">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/5 px-3 py-1 text-[11px] font-medium text-violet-700">
        <Sparkles className="h-3 w-3" /> المسار الافتراضي
      </div>
      <h2 className="mb-2 text-base font-semibold">توليد المواضيع الهجينة</h2>
      <p className="mb-4 max-w-2xl text-[12.5px] leading-relaxed text-foreground/85">
        المولّد الهجين يدمج إشارات السوق (YouTube + بودكاست) مع التفكير الأصيل
        وذاكرة الأداء (ما نجح في المواسم السابقة)، ثم يقترح حلقات قابلة
        للقبول/الرفض في أسفل هذه الصفحة.
      </p>
      <HybridGenerateButton
        seasonId={seasonId}
        language="ar"
        count={targetEpisodes}
        aiBlocked={aiBlocked}
        aiBlockReason={aiBlockReason}
      />
    </div>
  )
}


// ─── AcceptedEpisodes panel ──────────────────────────────────────────

function AcceptedEpisodes({
  accepted,
  phasesByCandidate,
}: {
  accepted: Array<{ topic: { id: string; working_title: string; topic_domain: string | null; eir_id: string | null }; guest: { full_name: string } | null }>
  phasesByCandidate: Awaited<ReturnType<typeof loadEirPhasesForCandidates>>
}) {
  if (accepted.length === 0) return null
  // Footer copy now reflects the shipped state — every per-episode tab
  // (preparation/recording/studio/publish/performance) lives inside
  // the Episode Workspace today.
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Lightbulb className="h-4 w-4" /> الحلقات المعتمدة في هذا الموسم
        </h2>
        <span className="text-[10.5px] text-muted-foreground">
          {accepted.length} حلقة
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {accepted.map((card) => {
          const phaseInfo = phasesByCandidate.get(card.topic.id)
          const phase = phaseInfo?.phase as EpisodePhase | undefined
          const action = phase ? nextActionFor(phase) : null
          // UX-3a — accepted-card CTAs land on the Episode Workspace
          // for any tab UX-3a implements (overview/topic/guest); the
          // workspace itself shows a placeholder for the others (those
          // are UX-3b's job).
          return (
            <li
              key={card.topic.id}
              className="rounded-2xl border border-border/40 bg-card/30 p-4"
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {phase && (
                  <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {PHASE_LABEL_AR[phase]}
                  </span>
                )}
                {card.topic.topic_domain && (
                  <span
                    className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground"
                    dir="ltr"
                  >
                    {KHAT_TOPIC_DOMAIN_LABEL[card.topic.topic_domain as keyof typeof KHAT_TOPIC_DOMAIN_LABEL]?.label ?? card.topic.topic_domain}
                  </span>
                )}
                {card.guest && (
                  <span className="text-[10.5px] text-muted-foreground/80">
                    ضيف: {card.guest.full_name}
                  </span>
                )}
              </div>
              <h3 className="mb-2 text-[13px] font-semibold leading-snug">
                {card.topic.working_title}
              </h3>
              {phaseInfo && action && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground/80">
                    {action.description}
                  </span>
                  <Link
                    href={action.href(phaseInfo.eir_id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-500/20"
                  >
                    {action.label} ←
                  </Link>
                </div>
              )}
              {!phaseInfo && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-700">
                  <Activity className="h-3 w-3" /> لم يتم ربطه بـ EIR بعد
                </div>
              )}
              {!card.guest && phaseInfo && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1">
                  <span className="inline-flex items-center gap-1 text-[10.5px] text-amber-700">
                    <Activity className="h-3 w-3" /> لا ضيف مرتبط — التحويل
                    إلى الإعداد محجوب حتى يُربط ضيف
                  </span>
                  <Link
                    href={`/admin/khat-brain/episodes/${phaseInfo.eir_id}?tab=guest`}
                    data-assign-guest-link
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-medium text-amber-700 hover:bg-amber-500/20"
                  >
                    اربط ضيفاً ←
                  </Link>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border/40 bg-background/30 px-2.5 py-1.5 text-[10.5px] text-muted-foreground/80"
      >
        <Telescope className="h-3 w-3" />
        الأزرار تنقلك إلى مساحة عمل الحلقة (الإعداد، التسجيل، الاستوديو،
        النشر، الأداء — كلها داخل صفحة واحدة).
      </p>
    </section>
  )
}
