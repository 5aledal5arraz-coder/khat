/**
 * Khat Brain Phase 7 — Command Center read service.
 *
 * Single aggregator for the /admin/khat-brain/command dashboard. All
 * dashboard queries live here; the page component just renders. This
 * keeps queries auditable + cacheable + testable in isolation.
 */

import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  episodeIntelligenceRecords,
  eirPhaseTransitions,
  type EpisodePhase,
} from "@/lib/db/schema/eir"
import { aiRuns } from "@/lib/db/schema/ai-runs"
import { jobs } from "@/lib/db/schema/jobs"
import {
  performanceSnapshots,
} from "@/lib/db/schema/studio-analysis"
import {
  discoveryRuns,
  guestDiscoveryCandidates,
  type DiscoveryRunStatus,
} from "@/lib/db/schema/discovery"
import { episodes } from "@/lib/db/schema/episodes"
import {
  getMarketTotals,
  getTopClusters,
  getEmotionalTriggers,
  getNarrativeHooks,
  getSourceBreakdown,
  type MarketTotals,
  type TopClusterSummary,
  type EmotionalTriggerSummary,
  type NarrativeHookSummary,
} from "@/lib/market-intelligence/queries"

// ─── Public shape ─────────────────────────────────────────────────────

export interface CommandCenterData {
  generated_at: string
  phase_counts: Record<EpisodePhase, number>
  totals: {
    active_eirs: number
    discovery_runs_open: number
    failed_jobs_recent: number
    failed_ai_runs_recent: number
  }
  alerts: AttentionAlert[]
  recent: {
    eirs: RecentEir[]
    transitions: RecentTransition[]
    discovery_runs: RecentDiscoveryRun[]
    top_candidates: TopCandidate[]
    promotions: RecentPromotion[]
    performance_snapshots: RecentPerfSnapshot[]
    ai_runs: RecentAiRun[]
    expensive_ai_runs: RecentAiRun[]
    jobs: RecentJob[]
  }
  /** Phase X Step 1 — Market Intelligence read surface. */
  market_intelligence: {
    totals: MarketTotals
    top_clusters: TopClusterSummary[]
    strongest_emotional_triggers: EmotionalTriggerSummary[]
    narrative_hooks: NarrativeHookSummary[]
    source_breakdown: Record<string, number>
  }
}

export type AttentionLevel = "info" | "warn" | "error"
export interface AttentionAlert {
  id: string
  level: AttentionLevel
  message: string
  /** Optional deep-link path. */
  href?: string
}

export interface RecentEir {
  id: string
  working_title: string
  phase: EpisodePhase
  season_id: string | null
  updated_at: string
}
export interface RecentTransition {
  id: string
  eir_id: string
  from_phase: EpisodePhase | null
  to_phase: EpisodePhase
  reason: string | null
  created_at: string
}
export interface RecentDiscoveryRun {
  id: string
  status: DiscoveryRunStatus
  candidate_count: number
  seed_prompt: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}
export interface TopCandidate {
  id: string
  proposed_name: string | null
  composite_score: number | null
  status: string
  archetype: string | null
}
export interface RecentPromotion {
  id: string
  proposed_name: string | null
  promoted_guest_id: string | null
  /** false when the candidate is "promoted" but has no guest_discovery_link row. */
  has_canonical_link: boolean
  updated_at: string
}
export interface RecentPerfSnapshot {
  id: string
  eir_id: string
  episode_id: string | null
  view_count: string | null
  source: string
  snapshot_at: string
}
export interface RecentAiRun {
  id: string
  task_kind: string
  provider: string
  model_name: string
  status: string
  cost_usd: number | null
  latency_ms: number | null
  error_class: string | null
  started_at: string
}
export interface RecentJob {
  id: string
  type: string
  status: string
  attempts: number
  max_attempts: number
  error_message: string | null
  created_at: string
}

// ─── Thresholds (centralized + tunable) ──────────────────────────────

export const ATTENTION_THRESHOLDS = {
  guest_discovery_days: 7,
  researching_days: 7,
  producing_days: 14,
  published_no_perf_days: 3,
  recent_lookback_days: 14,
  expensive_ai_run_usd: 0.1,
  ai_run_lookback_hours: 72,
  job_lookback_hours: 48,
} as const

// ─── Aggregator ──────────────────────────────────────────────────────

export async function getCommandCenterData(): Promise<CommandCenterData> {
  const now = new Date()
  const isoCutoff = (days: number) => new Date(now.getTime() - days * 86400_000)
  const aiCutoff = new Date(now.getTime() - ATTENTION_THRESHOLDS.ai_run_lookback_hours * 3600_000)
  const jobCutoff = new Date(now.getTime() - ATTENTION_THRESHOLDS.job_lookback_hours * 3600_000)

  // ── Phase counts ───────────────────────────────────────────────────
  const phaseRows = await db!
    .select({
      phase: episodeIntelligenceRecords.phase,
      count: sql<number>`count(*)::int`,
    })
    .from(episodeIntelligenceRecords)
    .where(isNull(episodeIntelligenceRecords.archived_at))
    .groupBy(episodeIntelligenceRecords.phase)
  const phase_counts = {} as Record<EpisodePhase, number>
  for (const r of phaseRows) phase_counts[r.phase as EpisodePhase] = Number(r.count)
  const active_eirs = Object.values(phase_counts).reduce((a, b) => a + b, 0)

  // ── Open discovery runs ────────────────────────────────────────────
  const openDiscovery = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(discoveryRuns)
    .where(
      inArray(discoveryRuns.status, [
        "pending",
        "seeding",
        "searching",
        "verifying",
        "ranking",
      ] as DiscoveryRunStatus[]),
    )
  const discovery_runs_open = openDiscovery[0]?.c ?? 0

  // ── Failed counts ─────────────────────────────────────────────────
  const [failedJobs, failedAi] = await Promise.all([
    db!
      .select({ c: sql<number>`count(*)::int` })
      .from(jobs)
      .where(
        and(
          inArray(jobs.status, ["failed", "dead"]),
          gt(jobs.created_at, jobCutoff),
        ),
      ),
    db!
      .select({ c: sql<number>`count(*)::int` })
      .from(aiRuns)
      .where(
        and(
          inArray(aiRuns.status, ["failed", "timed_out"]),
          gt(aiRuns.started_at, aiCutoff),
        ),
      ),
  ])

  // ── Recent EIRs ────────────────────────────────────────────────────
  const recentEirRows = await db!
    .select({
      id: episodeIntelligenceRecords.id,
      working_title: episodeIntelligenceRecords.working_title,
      phase: episodeIntelligenceRecords.phase,
      season_id: episodeIntelligenceRecords.season_id,
      updated_at: episodeIntelligenceRecords.updated_at,
    })
    .from(episodeIntelligenceRecords)
    .where(isNull(episodeIntelligenceRecords.archived_at))
    .orderBy(desc(episodeIntelligenceRecords.updated_at))
    .limit(10)
  const eirs: RecentEir[] = recentEirRows.map((r) => ({
    id: r.id,
    working_title: r.working_title,
    phase: r.phase as EpisodePhase,
    season_id: r.season_id,
    updated_at: r.updated_at.toISOString(),
  }))

  // ── Recent transitions ─────────────────────────────────────────────
  const recentTransitions = await db!
    .select({
      id: eirPhaseTransitions.id,
      eir_id: eirPhaseTransitions.eir_id,
      from_phase: eirPhaseTransitions.from_phase,
      to_phase: eirPhaseTransitions.to_phase,
      reason: eirPhaseTransitions.reason,
      created_at: eirPhaseTransitions.created_at,
    })
    .from(eirPhaseTransitions)
    .orderBy(desc(eirPhaseTransitions.created_at))
    .limit(10)
  const transitions: RecentTransition[] = recentTransitions.map((r) => ({
    id: r.id,
    eir_id: r.eir_id,
    from_phase: r.from_phase as EpisodePhase | null,
    to_phase: r.to_phase as EpisodePhase,
    reason: r.reason,
    created_at: r.created_at.toISOString(),
  }))

  // ── Recent discovery runs ─────────────────────────────────────────
  const recentRuns = await db!
    .select()
    .from(discoveryRuns)
    .orderBy(desc(discoveryRuns.created_at))
    .limit(8)
  const discovery_runs_recent: RecentDiscoveryRun[] = recentRuns.map((r) => ({
    id: r.id,
    status: r.status as DiscoveryRunStatus,
    candidate_count: r.candidate_count,
    seed_prompt: r.seed_prompt,
    started_at: r.started_at ? r.started_at.toISOString() : null,
    completed_at: r.completed_at ? r.completed_at.toISOString() : null,
    error_message: r.error_message,
  }))

  // ── Top discovery candidates (proposed/under_review) ──────────────
  const topRows = await db!
    .select({
      id: guestDiscoveryCandidates.id,
      proposed_name: guestDiscoveryCandidates.proposed_name,
      composite_score: guestDiscoveryCandidates.composite_score,
      status: guestDiscoveryCandidates.status,
      archetype: guestDiscoveryCandidates.archetype,
    })
    .from(guestDiscoveryCandidates)
    .where(
      inArray(guestDiscoveryCandidates.status, ["proposed", "under_review"]),
    )
    .orderBy(sql`${guestDiscoveryCandidates.composite_score} DESC NULLS LAST`)
    .limit(8)
  const top_candidates: TopCandidate[] = topRows.map((r) => ({
    id: r.id,
    proposed_name: r.proposed_name,
    composite_score: r.composite_score === null ? null : Number(r.composite_score),
    status: r.status as string,
    archetype: (r.archetype as { name?: string } | null)?.name ?? null,
  }))

  // ── Recent promotions ─────────────────────────────────────────────
  const promotionRows = await db!
    .select({
      id: guestDiscoveryCandidates.id,
      proposed_name: guestDiscoveryCandidates.proposed_name,
      promoted_guest_id: guestDiscoveryCandidates.promoted_guest_id,
      updated_at: guestDiscoveryCandidates.updated_at,
    })
    .from(guestDiscoveryCandidates)
    .where(eq(guestDiscoveryCandidates.status, "promoted"))
    .orderBy(desc(guestDiscoveryCandidates.updated_at))
    .limit(10)

  // Detect promoted candidates without a guest_discovery_links row.
  const linkRows =
    promotionRows.length > 0
      ? await db!.execute(sql`
          SELECT discovery_candidate_id FROM guest_discovery_links
           WHERE discovery_candidate_id = ANY(ARRAY[${sql.join(
             promotionRows.map((p) => sql`${p.id}`),
             sql`,`,
           )}]::text[])
        `)
      : ({ rows: [] } as unknown as { rows: Array<{ discovery_candidate_id: string }> })
  const linkedSet = new Set(
    (linkRows as unknown as { rows: Array<{ discovery_candidate_id: string }> }).rows.map(
      (r) => r.discovery_candidate_id,
    ),
  )
  const promotions: RecentPromotion[] = promotionRows.map((r) => ({
    id: r.id,
    proposed_name: r.proposed_name,
    promoted_guest_id: r.promoted_guest_id,
    has_canonical_link: linkedSet.has(r.id),
    updated_at: r.updated_at.toISOString(),
  }))

  // ── Recent performance snapshots ──────────────────────────────────
  const perfRows = await db!
    .select({
      id: performanceSnapshots.id,
      eir_id: performanceSnapshots.eir_id,
      episode_id: performanceSnapshots.episode_id,
      view_count: performanceSnapshots.view_count,
      source: performanceSnapshots.source,
      snapshot_at: performanceSnapshots.snapshot_at,
    })
    .from(performanceSnapshots)
    .orderBy(desc(performanceSnapshots.snapshot_at))
    .limit(10)
  const performance_snapshots: RecentPerfSnapshot[] = perfRows.map((r) => ({
    id: r.id,
    eir_id: r.eir_id,
    episode_id: r.episode_id,
    view_count: r.view_count,
    source: r.source,
    snapshot_at: r.snapshot_at.toISOString(),
  }))

  // ── AI runs (recent + expensive/failed) ───────────────────────────
  const aiRecent = await db!
    .select({
      id: aiRuns.id,
      task_kind: aiRuns.task_kind,
      provider: aiRuns.provider,
      model_name: aiRuns.model_name,
      status: aiRuns.status,
      cost_usd: aiRuns.cost_usd,
      latency_ms: aiRuns.latency_ms,
      error_class: aiRuns.error_class,
      started_at: aiRuns.started_at,
    })
    .from(aiRuns)
    .orderBy(desc(aiRuns.started_at))
    .limit(10)
  const ai_runs_recent: RecentAiRun[] = aiRecent.map((r) => ({
    id: r.id,
    task_kind: r.task_kind,
    provider: r.provider,
    model_name: r.model_name,
    status: r.status,
    cost_usd: r.cost_usd === null ? null : Number(r.cost_usd),
    latency_ms: r.latency_ms,
    error_class: r.error_class,
    started_at: r.started_at.toISOString(),
  }))

  const aiExpensive = await db!
    .select({
      id: aiRuns.id,
      task_kind: aiRuns.task_kind,
      provider: aiRuns.provider,
      model_name: aiRuns.model_name,
      status: aiRuns.status,
      cost_usd: aiRuns.cost_usd,
      latency_ms: aiRuns.latency_ms,
      error_class: aiRuns.error_class,
      started_at: aiRuns.started_at,
    })
    .from(aiRuns)
    .where(
      and(
        gt(aiRuns.started_at, aiCutoff),
        or(
          inArray(aiRuns.status, ["failed", "timed_out"]),
          gt(aiRuns.cost_usd, ATTENTION_THRESHOLDS.expensive_ai_run_usd),
        ),
      ),
    )
    .orderBy(desc(aiRuns.started_at))
    .limit(10)
  const expensive_ai_runs: RecentAiRun[] = aiExpensive.map((r) => ({
    id: r.id,
    task_kind: r.task_kind,
    provider: r.provider,
    model_name: r.model_name,
    status: r.status,
    cost_usd: r.cost_usd === null ? null : Number(r.cost_usd),
    latency_ms: r.latency_ms,
    error_class: r.error_class,
    started_at: r.started_at.toISOString(),
  }))

  // ── Recent jobs ───────────────────────────────────────────────────
  const jobRows = await db!
    .select()
    .from(jobs)
    .orderBy(desc(jobs.created_at))
    .limit(10)
  const job_rows: RecentJob[] = jobRows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    attempts: r.attempts,
    max_attempts: r.max_attempts,
    error_message: r.error_message,
    created_at: r.created_at.toISOString(),
  }))

  // ── Attention alerts ──────────────────────────────────────────────
  const alerts: AttentionAlert[] = []

  // 1. EIR stuck in guest_discovery > N days
  const stuckGuestDiscovery = await db!
    .select({
      id: episodeIntelligenceRecords.id,
      working_title: episodeIntelligenceRecords.working_title,
    })
    .from(episodeIntelligenceRecords)
    .where(
      and(
        eq(episodeIntelligenceRecords.phase, "guest_discovery"),
        lt(episodeIntelligenceRecords.updated_at, isoCutoff(ATTENTION_THRESHOLDS.guest_discovery_days)),
        isNull(episodeIntelligenceRecords.archived_at),
      ),
    )
  for (const r of stuckGuestDiscovery) {
    alerts.push({
      id: `stuck_disc:${r.id}`,
      level: "warn",
      message: `حلقة "${r.working_title}" متعثرة في "اكتشاف الضيف" منذ ${ATTENTION_THRESHOLDS.guest_discovery_days}+ أيام`,
      href: `/admin/khat-brain`,
    })
  }

  // 2. EIR in researching > N days
  const stuckResearching = await db!
    .select({
      id: episodeIntelligenceRecords.id,
      working_title: episodeIntelligenceRecords.working_title,
    })
    .from(episodeIntelligenceRecords)
    .where(
      and(
        eq(episodeIntelligenceRecords.phase, "researching"),
        lt(episodeIntelligenceRecords.updated_at, isoCutoff(ATTENTION_THRESHOLDS.researching_days)),
        isNull(episodeIntelligenceRecords.archived_at),
      ),
    )
  for (const r of stuckResearching) {
    alerts.push({
      id: `stuck_research:${r.id}`,
      level: "warn",
      message: `إعداد "${r.working_title}" قيد البحث منذ ${ATTENTION_THRESHOLDS.researching_days}+ أيام`,
    })
  }

  // 3. EIR in producing > N days
  const stuckProducing = await db!
    .select({
      id: episodeIntelligenceRecords.id,
      working_title: episodeIntelligenceRecords.working_title,
    })
    .from(episodeIntelligenceRecords)
    .where(
      and(
        eq(episodeIntelligenceRecords.phase, "producing"),
        lt(episodeIntelligenceRecords.updated_at, isoCutoff(ATTENTION_THRESHOLDS.producing_days)),
        isNull(episodeIntelligenceRecords.archived_at),
      ),
    )
  for (const r of stuckProducing) {
    alerts.push({
      id: `stuck_producing:${r.id}`,
      level: "warn",
      message: `حلقة "${r.working_title}" قيد الإنتاج منذ ${ATTENTION_THRESHOLDS.producing_days}+ يوماً`,
    })
  }

  // 4. EIR published with no performance snapshot
  const publishedNoSnapshot = await db!.execute(sql`
    SELECT eir.id, eir.working_title FROM episode_intelligence_records eir
     LEFT JOIN performance_snapshots ps ON ps.eir_id = eir.id
     WHERE eir.phase = 'published'
       AND eir.archived_at IS NULL
       AND eir.updated_at < ${isoCutoff(ATTENTION_THRESHOLDS.published_no_perf_days).toISOString()}
       AND ps.id IS NULL
     LIMIT 20
  `)
  for (const r of (publishedNoSnapshot as unknown as {
    rows: Array<{ id: string; working_title: string }>
  }).rows) {
    alerts.push({
      id: `no_perf:${r.id}`,
      level: "info",
      message: `حلقة "${r.working_title}" منشورة بدون أي لقطة أداء`,
    })
  }

  // 5. Failed/stalled discovery runs
  const failedDiscovery = await db!
    .select({
      id: discoveryRuns.id,
      seed_prompt: discoveryRuns.seed_prompt,
      error_message: discoveryRuns.error_message,
    })
    .from(discoveryRuns)
    .where(eq(discoveryRuns.status, "failed"))
    .orderBy(desc(discoveryRuns.updated_at))
    .limit(5)
  for (const r of failedDiscovery) {
    alerts.push({
      id: `disc_failed:${r.id}`,
      level: "error",
      message: `تشغيل اكتشاف فشل: ${r.error_message ?? "بدون تفاصيل"}`,
      href: "/admin/discovery",
    })
  }

  // 6. AI run failed (recent)
  if ((failedAi[0]?.c ?? 0) > 0) {
    alerts.push({
      id: `ai_failed_count`,
      level: "error",
      message: `${failedAi[0]!.c} تشغيل ذكاء اصطناعي فشل خلال الـ${ATTENTION_THRESHOLDS.ai_run_lookback_hours} ساعة الماضية`,
      href: "/api/admin/khat-brain/ai-runs?status=failed",
    })
  }

  // 7. Expensive AI runs
  for (const r of expensive_ai_runs) {
    if (r.cost_usd !== null && r.cost_usd >= ATTENTION_THRESHOLDS.expensive_ai_run_usd) {
      alerts.push({
        id: `ai_expensive:${r.id}`,
        level: "info",
        message: `تشغيل ذكاء اصطناعي مكلف: ${r.task_kind} على ${r.model_name} ($${r.cost_usd.toFixed(4)})`,
      })
    }
  }

  // 8. Failed jobs (recent)
  if ((failedJobs[0]?.c ?? 0) > 0) {
    alerts.push({
      id: `jobs_failed_count`,
      level: "error",
      message: `${failedJobs[0]!.c} مهمة خلفية فشلت خلال الـ${ATTENTION_THRESHOLDS.job_lookback_hours} ساعة الماضية`,
      href: "/api/admin/khat-brain/jobs?status=failed",
    })
  }

  // 9. Promoted candidates without a canonical guest link
  const orphans = promotions.filter(
    (p) => !p.has_canonical_link && p.promoted_guest_id,
  )
  for (const p of orphans) {
    alerts.push({
      id: `promotion_no_link:${p.id}`,
      level: "warn",
      message: `مرشح مرقّى بدون رابط ضيف رسمي: ${p.proposed_name ?? p.id.slice(0, 8)}`,
      href: `/admin/discovery`,
    })
  }

  // ── Market intelligence (Phase X Step 1) ──────────────────────────
  const [marketTotals, topClusters, triggers, hooks, sourceBreakdown] =
    await Promise.all([
      getMarketTotals(),
      getTopClusters(5),
      getEmotionalTriggers(5),
      getNarrativeHooks(5),
      getSourceBreakdown(),
    ])

  // Final assemblage
  return {
    generated_at: now.toISOString(),
    phase_counts,
    totals: {
      active_eirs,
      discovery_runs_open,
      failed_jobs_recent: failedJobs[0]?.c ?? 0,
      failed_ai_runs_recent: failedAi[0]?.c ?? 0,
    },
    alerts,
    recent: {
      eirs,
      transitions,
      discovery_runs: discovery_runs_recent,
      top_candidates,
      promotions,
      performance_snapshots,
      ai_runs: ai_runs_recent,
      expensive_ai_runs,
      jobs: job_rows,
    },
    market_intelligence: {
      totals: marketTotals,
      top_clusters: topClusters,
      strongest_emotional_triggers: triggers,
      narrative_hooks: hooks,
      source_breakdown: sourceBreakdown,
    },
  }
}

// Suppress unused-var lint for `episodes` import if the build pruning
// gets aggressive — we may need it for future joins.
void episodes
