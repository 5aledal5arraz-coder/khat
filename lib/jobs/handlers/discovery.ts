/**
 * Khat Brain Phase 5 — Discovery job handlers.
 *
 * Pipeline:
 *   discovery.seed_archetypes
 *      → discovery.search_archetype  (one job per archetype × source)
 *      → discovery.verify_candidate  (one job per discovered candidate)
 *      → discovery.rank_candidates   (one job per run, after verify drains)
 *
 * The handlers themselves are thin — they call the discovery services
 * (seedArchetypes, runSearchAgent, verifyCandidate, rankCandidate) and
 * persist via the runs/candidates repos. State transitions on the run
 * happen in well-defined places so the dashboard can show a clean
 * progress bar.
 */

import { registerHandler } from "../registry"
import { enqueueJob } from "../queue"
import {
  alphaFlagEnabled,
  bumpCandidateCount,
  createCandidate,
  getCandidate,
  getDiscoveryRun,
  listCandidates,
  rankCandidate,
  runAlphaPipeline,
  runSearchAgent,
  seedArchetypes,
  setCandidateStatus,
  transitionDiscoveryRun,
  updateCandidateAlphaPayload,
  updateCandidateScores,
  updateCandidateVerification,
  verifyCandidate,
  type DiscoveryArchetype,
  type DiscoverySource,
} from "@/lib/discovery"
import {
  buildNoveltyCorpus,
  noveltyPenaltyAgainstCorpus,
} from "@/lib/discovery/novelty-corpus"

// Phase Beta — default fan-out now includes EditorialSource and
// PublicVoiceSource. NetworkSource is OPT-IN per run because it
// requires prior promoted candidates in the same season; running it
// on an empty season just no-ops, so adding it costs nothing.
const DEFAULT_SOURCES_LEGACY: DiscoverySource[] = [
  "ai_knowledge",
  "youtube",
  "google_web",
]
const DEFAULT_SOURCES_BETA: DiscoverySource[] = [
  // ai_knowledge first: proposes real named individuals from model
  // knowledge, independent of external search-API availability (so runs
  // still yield real people when google_web/public_voice keys are down).
  "ai_knowledge",
  "youtube",
  "google_web",
  "editorial",
  "public_voice",
  "network",
]
function defaultSources(): DiscoverySource[] {
  // Beta sources fan out only when Alpha (the verifier classifier) is
  // also on — the sources produce noisier raw seeds and rely on
  // Alpha's structural classifier to triangulate.
  return alphaFlagEnabled() ? DEFAULT_SOURCES_BETA : DEFAULT_SOURCES_LEGACY
}

// ─── 1. Seed archetypes ──────────────────────────────────────────────

interface SeedPayload {
  run_id: string
  count?: number
  seed_prompt?: string | null
  editorial_context?: string | null
}

registerHandler<SeedPayload>("discovery.seed_archetypes", async (payload) => {
  if (!payload.run_id) throw new Error("seed_archetypes: run_id required")

  await transitionDiscoveryRun({ id: payload.run_id, to: "seeding" })

  const result = await seedArchetypes({
    seedPrompt: payload.seed_prompt ?? null,
    editorialContext: payload.editorial_context ?? "",
    count: payload.count ?? 8,
    subjectId: payload.run_id,
  })

  if (!result.ok) {
    await transitionDiscoveryRun({
      id: payload.run_id,
      to: "failed",
      error: `seed_archetypes: ${result.errorMessage ?? "unknown"}`,
    })
    throw new Error(result.errorMessage ?? "no archetypes generated")
  }

  await transitionDiscoveryRun({
    id: payload.run_id,
    to: "searching",
    archetypes: result.archetypes,
  })

  // Fan out one search job per (archetype × source).
  const run = await getDiscoveryRun(payload.run_id)
  const sources = (run?.source_config?.platforms ?? defaultSources()) as DiscoverySource[]
  const candidatesPer = run?.source_config?.candidates_per_archetype ?? 5

  for (const archetype of result.archetypes) {
    for (const source of sources) {
      await enqueueJob("discovery.search_archetype", {
        run_id: payload.run_id,
        archetype,
        source,
        max_results: candidatesPer,
      })
    }
  }

  return {
    archetypes_count: result.archetypes.length,
    runId: result.runId,
    enqueued_search_jobs: result.archetypes.length * sources.length,
  }
})

// ─── 2. Search archetype ─────────────────────────────────────────────

interface SearchPayload {
  run_id: string
  archetype: DiscoveryArchetype
  source: DiscoverySource
  max_results?: number
}

registerHandler<SearchPayload>("discovery.search_archetype", async (payload, ctx) => {
  if (!payload.run_id || !payload.archetype || !payload.source) {
    throw new Error("search_archetype: run_id, archetype, source required")
  }

  // Phase B redesign — load the run's source_config so filter context
  // (gender, nationality, episode topic) flows into the per-source
  // query builders. Fan-out happened in seed_archetypes; the per-task
  // payload only carries archetype + source, so we fetch the run row
  // here. Falls back to no-filters for legacy runs without context.
  const run = await getDiscoveryRun(payload.run_id)
  const sc = run?.source_config ?? null
  const filters = sc
    ? {
        gender: sc.gender,
        nationality: sc.nationality,
        episodeWorkingTitle: sc.source_episode_working_title ?? null,
        episodeTopicDomain: sc.source_episode_topic_domain ?? null,
      }
    : undefined

  // Phase Beta — pass season id (for NetworkSource scoping) + the set
  // of names already surfaced in this run so NetworkSource skips
  // duplicates. The other sources ignore both fields harmlessly.
  let alreadySurfacedNames: Set<string> | undefined
  if (payload.source === "network") {
    const priorRows = await listCandidates({
      discovery_run_id: payload.run_id,
      limit: 200,
    })
    alreadySurfacedNames = new Set(
      priorRows
        .map((r) => r.proposed_name?.toLowerCase())
        .filter((n): n is string => Boolean(n)),
    )
  }

  const result = await runSearchAgent({
    archetype: payload.archetype,
    source: payload.source,
    maxResults: payload.max_results ?? 5,
    filters,
    seasonId: run?.season_id ?? null,
    alreadySurfacedNames,
  })

  // Phase B redesign — inherit target episode FK from the run config so
  // the per-episode panel can filter on the candidate column directly.
  const targetEpisodeCandidateId = run?.source_config?.source_episode_candidate_id ?? null

  // Persist candidates — one per SearchCandidate.
  let stored = 0
  for (const c of result.candidates) {
    const cand = await createCandidate({
      discovery_run_id: payload.run_id,
      target_episode_candidate_id: targetEpisodeCandidateId,
      proposed_name: c.proposed_name ?? null,
      proposed_role: c.proposed_role ?? null,
      proposed_country: c.proposed_country ?? null,
      archetype: payload.archetype,
      evidence_urls: c.evidence_urls,
      platform_signals: c.platform_signals
        ? (c.platform_signals as never)
        : { [payload.source]: { not_configured: !result.configured } },
    })
    stored++

    // Fan out verification.
    await enqueueJob("discovery.verify_candidate", { candidate_id: cand.id })
  }

  if (stored > 0) await bumpCandidateCount(payload.run_id, stored)

  // UX-11 — When ALL search jobs for this run have drained, check
  // whether the run should auto-advance. If candidates exist, the
  // verify cascade will fan out and eventually call autoAdvanceToRank
  // below. If zero candidates landed (e.g. every source was
  // not_configured), close the run here with a clear message so it
  // doesn't sit in "searching" forever.
  await maybeCompleteEmptyRun(payload.run_id, ctx.jobId)

  return {
    source: payload.source,
    configured: result.configured,
    note: result.note ?? null,
    stored,
  }
})

// ─── 3. Verify candidate ─────────────────────────────────────────────

interface VerifyPayload {
  candidate_id: string
}

registerHandler<VerifyPayload>("discovery.verify_candidate", async (payload, ctx) => {
  const cand = await getCandidate(payload.candidate_id)
  if (!cand) throw new Error(`candidate not found: ${payload.candidate_id}`)
  if (!cand.archetype) throw new Error(`candidate ${cand.id} has no archetype`)

  // Phase B redesign — read filters + episode context from the run's
  // source_config and pass them through so the verifier (a) tells the
  // model what gender/nationality to confirm, (b) returns a
  // `filter_mismatch` we can act on by auto-rejecting the candidate,
  // and (c) produces topic-anchored rationale + score for the card UI.
  let filters: { gender?: "male" | "female"; nationality?: "kuwaiti" | "non_kuwaiti" } | undefined
  let episodeContext: { workingTitle: string; topicDomain?: string | null } | undefined
  if (cand.discovery_run_id) {
    const run = await getDiscoveryRun(cand.discovery_run_id)
    const sc = run?.source_config
    if (sc?.gender || sc?.nationality) {
      filters = { gender: sc?.gender, nationality: sc?.nationality }
    }
    if (sc?.source_episode_working_title) {
      episodeContext = {
        workingTitle: sc.source_episode_working_title,
        topicDomain: sc.source_episode_topic_domain ?? null,
      }
    }
  }

  // ─── Phase Alpha dispatch ────────────────────────────────────────
  // When KHAT_GUEST_DISCOVERY_V2 is on, the deterministic Alpha
  // pipeline owns the identity + attribute + fit decision. The LLM
  // verifier still runs in addition — for the evidence_summary / story
  // signals only — so legacy fields stay populated and the ranker
  // continues to work. This is the "demote generative to
  // explanation-only" rule in practice.
  if (alphaFlagEnabled()) {
    // Phase Beta — pull hiddenness_preference from the run's
    // source_config. Defaults to "balanced" when the run was created
    // before the slider existed.
    let hiddennessPreference: "famous" | "balanced" | "hidden_gems" =
      "balanced"
    if (cand.discovery_run_id) {
      const run = await getDiscoveryRun(cand.discovery_run_id)
      const hp = run?.source_config?.hiddenness_preference
      if (hp === "famous" || hp === "balanced" || hp === "hidden_gems") {
        hiddennessPreference = hp
      }
    }
    const decision = runAlphaPipeline({
      proposed_name: cand.proposed_name,
      proposed_role: cand.proposed_role,
      proposed_country: cand.proposed_country,
      evidence_urls: cand.evidence_urls,
      platform_signals: cand.platform_signals,
      archetype: cand.archetype,
      filters,
      episodeContext: episodeContext
        ? {
            workingTitle: episodeContext.workingTitle,
            topicDomain: episodeContext.topicDomain ?? null,
            intentText: null,
          }
        : undefined,
      hiddennessPreference,
    })

    await updateCandidateAlphaPayload({
      id: cand.id,
      pipeline_version: decision.pipeline_version,
      display_name: decision.display_name,
      full_name_normalized: decision.full_name_normalized,
      person_class_signals: decision.classifier_report,
      identity_confidence: decision.identity_confidence,
      attribute_confidences: decision.attributes,
      evidence_bundle: decision.evidence_bundle,
      editorial_fit_score: decision.editorial_fit_score,
      hidden_gem_score: decision.hidden_gem_score,
      evidence_strength_score: decision.evidence_strength_score,
      recommendation_score: decision.recommendation_score,
      dropped_reason: decision.dropped_reason,
    })

    if (decision.decision === "drop") {
      const reason = `Alpha drop: ${decision.dropped_reason ?? "unknown"}`
      await setCandidateStatus(cand.id, "rejected", { rejection_reason: reason })
      // No further work for dropped rows — auto-advance still runs.
      if (cand.discovery_run_id) {
        await autoAdvanceToRank(cand.discovery_run_id, ctx.jobId)
      }
      return {
        candidate_id: cand.id,
        runId: null,
        ok: false,
        fit: decision.editorial_fit_score,
        pipeline: "alpha",
        decision: "drop",
        dropped_reason: decision.dropped_reason,
      }
    }
    // Decision = promote. Fall through to the legacy verifier so
    // evidence_summary + story_signals + social_links + Arabic
    // rationale strings still populate. The Alpha scores already
    // written above will not be overwritten by the score updates
    // below because updateCandidateVerification only sets the legacy
    // editorial_fit_score; we'll keep BOTH (legacy fit and Alpha
    // recommendation) on the row.
  }
  // ─── End Phase Alpha dispatch ────────────────────────────────────

  const result = await verifyCandidate({
    proposed_name: cand.proposed_name,
    proposed_role: cand.proposed_role,
    proposed_country: cand.proposed_country,
    archetype: cand.archetype,
    evidence_urls: cand.evidence_urls,
    subjectId: cand.id,
    filters,
    episodeContext,
  })

  await updateCandidateVerification({
    id: cand.id,
    evidence_summary: result.evidence_summary,
    story_signals: result.story_signals,
    editorial_fit_score: result.editorial_fit_score,
    general_rationale: result.general_rationale,
    topic_fit_rationale: result.topic_fit_rationale,
    topic_fit_score: result.topic_fit_score,
    social_links: result.social_links,
  })

  // Phase B redesign — strict-on-unknown filter enforcement. If the
  // verifier signals a mismatch, drop the candidate to status=rejected
  // with a clear reason instead of letting it through to ranking.
  if (result.filter_mismatch) {
    const reason =
      result.filter_mismatch.axis === "gender"
        ? `استُبعد آليًا — جنس الضيف لا يطابق فلتر الموسم (المطلوب: ${result.filter_mismatch.expected}، المتوفّر: ${result.filter_mismatch.detected ?? "غير محدّد"}).`
        : `استُبعد آليًا — جنسية الضيف لا تطابق فلتر الموسم (المطلوب: ${result.filter_mismatch.expected === "kuwaiti" ? "كويتي" : "غير كويتي"}، المتوفّر: ${result.filter_mismatch.detected ?? "غير محدّد"}).`
    await setCandidateStatus(cand.id, "rejected", { rejection_reason: reason })
  }

  // UX-11 — auto-advance: if no other search/verify jobs are
  // pending for this run, kick off rank_candidates. Without this,
  // runs sit in "searching" until the 30-min cron sweep recovers
  // them — operators perceive it as broken.
  if (cand.discovery_run_id) {
    await autoAdvanceToRank(cand.discovery_run_id, ctx.jobId)
  }

  return {
    candidate_id: cand.id,
    runId: result.runId,
    ok: result.ok,
    fit: result.editorial_fit_score,
  }
})

/**
 * UX-11 helper — When all search + verify jobs for a run are
 * terminal (succeeded/failed/dead) and the run is still in a
 * non-terminal state, enqueue rank_candidates exactly once. Safe
 * against duplicate calls because we gate on the run's status
 * already being non-rank/non-completed.
 */
async function autoAdvanceToRank(
  runId: string,
  currentJobId: string,
): Promise<void> {
  const { sql } = await import("drizzle-orm")
  const { db } = await import("@/lib/db")
  if (!db) return
  const run = await getDiscoveryRun(runId)
  if (!run) return
  if (run.status !== "searching" && run.status !== "verifying") return

  // Count pending/running search + verify jobs for this run, excluding
  // the currently-running job (which is still in 'running' state while
  // this handler executes — completeJob hasn't been called yet).
  const pending = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM jobs
    WHERE id != ${currentJobId}
      AND type IN ('discovery.search_archetype', 'discovery.verify_candidate')
      AND status IN ('pending', 'running')
      AND payload->>'run_id' = ${runId}
  `)
  const pendingCount =
    Number((pending.rows[0] as { n?: number } | undefined)?.n ?? 0)

  // Verify jobs only carry candidate_id, so join through the
  // candidates table to find ones tied to this run.
  const pendingVerify = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM jobs j
    JOIN guest_discovery_candidates c
      ON c.id = j.payload->>'candidate_id'
    WHERE j.id != ${currentJobId}
      AND j.type = 'discovery.verify_candidate'
      AND j.status IN ('pending', 'running')
      AND c.discovery_run_id = ${runId}
  `)
  const verifyPendingCount =
    Number(
      (pendingVerify.rows[0] as { n?: number } | undefined)?.n ?? 0,
    )

  if (pendingCount > 0 || verifyPendingCount > 0) return

  if (run.candidate_count === 0) {
    // 0 candidates with all jobs drained → operator-clear failure.
    if (run.status === "searching") {
      await transitionDiscoveryRun({
        id: runId,
        to: "failed",
        error:
          "0 candidates — تأكّد من تهيئة مفاتيح YouTube + Google CSE، أو وسّع نطاق الموجّه",
      })
    }
    return
  }

  // State machine requires searching → verifying → ranking → completed.
  // Without this transition, the rank handler's "verifying → ranking"
  // throws because we'd still be in "searching". This is the bug that
  // made every prior discovery run sit forever in "searching".
  if (run.status === "searching") {
    await transitionDiscoveryRun({ id: runId, to: "verifying" })
  }

  // Enqueue rank — idempotent on run-status guard above.
  await enqueueJob(
    "discovery.rank_candidates",
    { run_id: runId },
    { priority: 7 },
  )
}

/**
 * UX-11 helper — Called from search_archetype handler. Closes runs
 * that have ZERO candidates and no remaining search jobs. Without
 * this, runs with all-stub sources stall forever.
 */
async function maybeCompleteEmptyRun(
  runId: string,
  currentJobId: string,
): Promise<void> {
  const { sql } = await import("drizzle-orm")
  const { db } = await import("@/lib/db")
  if (!db) return
  const run = await getDiscoveryRun(runId)
  if (!run) return
  if (run.status !== "searching" && run.status !== "seeding") return
  if (run.candidate_count > 0) return // verify cascade will close it

  const pending = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM jobs
    WHERE id != ${currentJobId}
      AND type = 'discovery.search_archetype'
      AND status IN ('pending', 'running')
      AND payload->>'run_id' = ${runId}
  `)
  const pendingCount =
    Number((pending.rows[0] as { n?: number } | undefined)?.n ?? 0)
  if (pendingCount > 0) return

  // Failure case: 0 candidates across all sources. UX-11.1 — gather
  // the per-source notes from the just-completed search jobs so the
  // error message names WHY each source returned nothing (referrer
  // blocked / API not enabled / 0 hits etc.) rather than a generic
  // "0 candidates" string.
  const perSource = await db.execute(sql`
    SELECT
      payload->>'source' AS source,
      result->>'note' AS note,
      (result->>'stored')::int AS stored,
      (result->>'configured')::boolean AS configured
    FROM jobs
    WHERE type = 'discovery.search_archetype'
      AND status IN ('succeeded', 'failed', 'dead')
      AND payload->>'run_id' = ${runId}
    ORDER BY completed_at DESC
    LIMIT 40
  `)
  const aggregated = new Map<string, { configured: boolean; note: string | null }>()
  for (const row of perSource.rows as Array<{
    source: string
    note: string | null
    stored: number | null
    configured: boolean | null
  }>) {
    if (!row.source) continue
    if (!aggregated.has(row.source)) {
      aggregated.set(row.source, {
        configured: row.configured ?? false,
        note: row.note,
      })
    } else if (!aggregated.get(row.source)!.note && row.note) {
      aggregated.set(row.source, {
        configured: aggregated.get(row.source)!.configured,
        note: row.note,
      })
    }
  }
  const summary =
    aggregated.size === 0
      ? "0 candidates — sources returned nothing"
      : [...aggregated.entries()]
          .map(
            ([source, v]) =>
              `${source}: ${v.configured ? v.note ?? "0 results" : "not configured"}`,
          )
          .join(" · ")

  await transitionDiscoveryRun({
    id: runId,
    to: "failed",
    error: `0 candidates — ${summary}`,
  })
}

// ─── 4. Rank candidates ──────────────────────────────────────────────

interface RankPayload {
  run_id: string
}

registerHandler<RankPayload>("discovery.rank_candidates", async (payload) => {
  if (!payload.run_id) throw new Error("rank_candidates: run_id required")

  await transitionDiscoveryRun({ id: payload.run_id, to: "ranking" })

  const run = await getDiscoveryRun(payload.run_id)
  const cands = await listCandidates({ discovery_run_id: payload.run_id, limit: 1000 })

  // Phase 6 — cross-run corpus from prior completed runs in the same
  // season. Used as a penalty on top of the per-run "seen_arcs" so a
  // candidate is novel only if both signals agree it's new.
  const crossRunCorpus = await buildNoveltyCorpus({
    current_run_id: payload.run_id,
    season_id: run?.season_id ?? null,
  })

  // Per-run corpus — accumulated as we rank within this batch.
  const seenArcs = new Set<string>()

  let ranked = 0
  for (const c of cands) {
    const r = rankCandidate({
      editorial_fit_score: c.editorial_fit_score,
      evidence_urls: c.evidence_urls,
      platform_signals: c.platform_signals,
      story_signals: c.story_signals,
      seen_arcs: seenArcs,
    })

    // Apply cross-run penalty on top of the per-run novelty.
    const crossPenalty = noveltyPenaltyAgainstCorpus({
      arcs: c.story_signals?.arcs ?? [],
      topics: [
        ...(c.story_signals?.topics ?? []),
        ...(c.evidence_summary?.topics ?? []),
      ],
      proposed_name: c.proposed_name,
      evidence_urls: c.evidence_urls,
      archetype_id: c.archetype?.id ?? null,
      corpus: crossRunCorpus,
    })
    const adjustedNovelty = Math.max(0, r.novelty_score - crossPenalty)
    // Composite recomputed with adjusted novelty — we subtract the
    // weight (0.15 from rank-candidates.ts) × the novelty delta.
    const adjustedComposite = Math.max(
      0,
      Math.min(1, r.composite_score - 0.15 * (r.novelty_score - adjustedNovelty)),
    )

    await updateCandidateScores({
      id: c.id,
      editorial_fit_score: r.editorial_fit_score,
      hiddenness_score: r.hiddenness_score,
      evidence_strength_score: r.evidence_strength_score,
      novelty_score: round3(adjustedNovelty),
      composite_score: round3(adjustedComposite),
    })

    for (const a of c.story_signals?.arcs ?? []) {
      seenArcs.add(a.toLowerCase().trim())
    }
    ranked++
  }

  await transitionDiscoveryRun({ id: payload.run_id, to: "completed" })

  return {
    run_id: payload.run_id,
    ranked,
    cross_run_arcs_seen: crossRunCorpus.arcs.size,
    cross_run_names_seen: crossRunCorpus.names.size,
  }
})

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

// Helper used by manual-review actions in the UI
export async function rejectCandidate(
  id: string,
  reason: string,
): Promise<void> {
  await setCandidateStatus(id, "rejected", { rejection_reason: reason })
}

// ─── 5. Cron — sweep stalled runs ────────────────────────────────────
//
// Runs typically progress through pending → seeding → searching →
// verifying → ranking → completed within 30 minutes for a normal-size
// fan-out. If a run sits in any non-terminal status much longer with
// no candidate-row activity, something is broken (provider down, jobs
// queue stuck, worker crashed). We mark such runs failed so the UI
// surfaces the gap; if the run actually has enough candidates, we
// recover by enqueueing the missing rank job.

interface CronCheckPayload {
  /** Stale threshold in milliseconds. Default 30 min. */
  stale_after_ms?: number
  /** Minimum candidate count to attempt rank-recovery. Default 3. */
  min_candidates_for_recovery?: number
}

interface CronCheckResult extends Record<string, unknown> {
  scanned: number
  failed: number
  recovered: number
}

registerHandler<CronCheckPayload, CronCheckResult>("discovery.cron_check", async (payload) => {
  const { sql } = await import("drizzle-orm")
  const { db } = await import("@/lib/db")
  const { discoveryRuns } = await import("@/lib/db/schema/discovery")

  const staleAfter = payload.stale_after_ms ?? 30 * 60 * 1000
  const minRecover = payload.min_candidates_for_recovery ?? 3
  const cutoff = new Date(Date.now() - staleAfter)

  const stuck = await db!
    .select({
      id: discoveryRuns.id,
      status: discoveryRuns.status,
      candidate_count: discoveryRuns.candidate_count,
      updated_at: discoveryRuns.updated_at,
    })
    .from(discoveryRuns)
    .where(sql`
      ${discoveryRuns.status} IN ('seeding','searching','verifying','ranking')
      AND ${discoveryRuns.updated_at} < ${cutoff.toISOString()}
    `)

  let failed = 0
  let recovered = 0

  for (const row of stuck) {
    // Recovery path — has enough candidates, just missing the rank job.
    if (
      (row.status === "searching" || row.status === "verifying") &&
      row.candidate_count >= minRecover
    ) {
      try {
        await enqueueJob(
          "discovery.rank_candidates",
          { run_id: row.id, recovery: true },
          { priority: 8 },
        )
        recovered++
        continue
      } catch (err) {
        // fall through to failure path below
        console.error(`[cron_check] recovery enqueue failed for ${row.id}:`, err)
      }
    }

    // Otherwise, mark the run failed so the UI shows the gap clearly.
    try {
      await transitionDiscoveryRun({
        id: row.id,
        to: "failed",
        error: `stalled in status=${row.status} for >${Math.round(staleAfter / 60_000)}min`,
      })
      failed++
    } catch (err) {
      console.error(`[cron_check] mark-failed failed for ${row.id}:`, err)
    }
  }

  return { scanned: stuck.length, failed, recovered }
})
