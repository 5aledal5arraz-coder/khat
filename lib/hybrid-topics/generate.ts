/**
 * Phase X Step 3 — Hybrid Topic generator.
 *
 *   generateHybridTopics({ seasonId, language, count, allowKuwaitBias?, createdBy? })
 *
 * Single editorial AI call (gpt-4o) that sees, all at once:
 *   - top market_topic_clusters (Step 1)
 *   - fresh original_thinking_topics (Step 2)
 *   - Phase 8 worked-report (strong/weak topic_domains)
 *   - cross-history exclusion list (existing khat_map candidates +
 *     consumed original-topic titles)
 *
 * Outputs hybrid topics that MUST transform a market signal through an
 * original-thinking lens. Rejection filters drop generic / dup / Kuwait-
 * biased / lens-mismatched outputs. Accepted topics flow into
 * khat_map_episode_candidates via persist.ts; a hybrid_topic_generations
 * row records the full attempt for audit.
 *
 * Feature flag: KHAT_HYBRID_TOPICS_ENABLED. Defaults to enabled at
 * call-site only — the existing Khat Map v2 flow is untouched.
 */

import { runAiTask } from "@/lib/ai-router"
import { buildHybridTopicsPrompt } from "@/lib/ai/prompts/hybrid-topics"
import { loadLenses } from "@/lib/original-thinking/lenses"
import { loadHybridInputs } from "./inputs"
import {
  judgeHybridCandidate,
  HYBRID_REJECTION_RULES,
  type HybridCandidate,
} from "./reject"
import { rescoreHybridCandidate } from "./scoring"
import {
  openGenerationLog,
  completeGenerationLog,
  persistAcceptedTopics,
  type AcceptedHybridTopic,
  type PersistedCandidate,
} from "./persist"
import type { HybridOutputTopic } from "@/lib/db/schema/hybrid-topics"

// Mirror the schema enums so the reject filter has a closed vocabulary.
const VALID_EPISODE_TYPES = new Set([
  "intellectual",
  "social",
  "psychological",
  "personal_story",
  "national",
  "historical",
  "economic",
  "controversial",
  "inspirational",
  "mass_audience",
  "signature_khat",
  "invasion",
])
const VALID_TOPIC_DOMAINS = new Set([
  "philosophy",
  "psychology",
  "relationships",
  "religion",
  "identity_masculinity",
  "money_career",
  "technology_ai",
  "internet_culture",
  "crime_mystery",
  "hidden_history",
  "power_manipulation",
  "parenting",
  "kuwait_gulf",
  "historical",
  "social_issues",
  "modern_society",
  "emotions_inner_life",
  "none",
])

export interface GenerateHybridRequest {
  seasonId: string | null
  language: "ar" | "en"
  count: number
  allowKuwaitBias?: boolean
  createdBy?: string | null
}

/**
 * Phase 6 — Generator paths.
 *
 *   clusters       — editorially-weighted market clusters drive the
 *                    prompt. The healthy default.
 *   foundational   — clusters genuinely empty; generator falls back to
 *                    originals + worked-report (Khat editorial memory).
 *                    Marketed to the operator as "المسار التأسيسي".
 *   analysis_pending — signals exist but haven't been scored/clustered
 *                    yet. Generator DOES NOT run; caller is told to
 *                    wait for the auto-pipeline to catch up.
 */
export type HybridFallbackPath = "clusters" | "foundational"

export interface GenerateHybridResult {
  ok: boolean
  generation_id: string | null
  ai_run_id: string | null
  asked: number
  accepted: HybridOutputTopic[]
  rejected: HybridOutputTopic[]
  rejection_summary: Record<string, number>
  persisted: PersistedCandidate[]
  /** Which input path the generator used. */
  fallback_path?: HybridFallbackPath
  /** Set when generation could not proceed.
   *    analysis_pending — signals exist but clusters/scores aren't ready
   *                       (call site should surface "جاري التحليل…").
   *    no_inputs        — truly empty system: no clusters, no originals,
   *                       no worked-report memory. */
  reason?:
    | "feature_disabled"
    | "no_inputs"
    | "ai_failed"
    | "analysis_pending"
}

export async function generateHybridTopics(
  req: GenerateHybridRequest,
): Promise<GenerateHybridResult> {
  // Feature flag (pass-through; the flag is read at the entry point so
  // callers can override per-request via env).
  if (process.env.KHAT_HYBRID_TOPICS_ENABLED === "false") {
    return emptyResult(req, "feature_disabled")
  }

  const inputs = await loadHybridInputs({
    language: req.language,
    extraExclusions: [],
  })

  // Phase 6 readiness gates:
  //   clusters_ready  → run normally
  //   no_inputs       → no clusters, no originals, no worked memory →
  //                     truly nothing to build from
  //   foundational    → no clusters but originals + worked memory exist
  //                     → generator proceeds using Khat editorial memory
  //                       (no market-trend influence; called "المسار التأسيسي")
  //   analysis_pending → signals exist + clusters don't (raw signals NEVER
  //                      bypass the editorial layer in Phase 6+); caller
  //                      auto-triggers extract/score/cluster and surfaces
  //                      "جاري تحليل إشارات السوق…" to the operator.
  const readinessReason = decideReadiness(inputs)
  if (readinessReason !== null) {
    return emptyResult(req, readinessReason)
  }
  const fallbackPath: HybridFallbackPath =
    inputs.market_clusters.length > 0 ? "clusters" : "foundational"

  // Open the generation log.
  const inputSnapshot = {
    original_topic_count: inputs.original_topics.length,
    market_cluster_count: inputs.market_clusters.length,
    taste_hint_count: inputs.taste_hints.length,
    fallback_path: fallbackPath,
    worked_hint_count:
      inputs.worked_report.strong_topic_domains.length +
      inputs.worked_report.weak_topic_domains.length,
    exclusion_count: inputs.excluded_titles.length,
    allow_kuwait_bias: !!req.allowKuwaitBias,
    asked_count: req.count,
    lens_keys: inputs.lens_keys,
  }
  const log = await openGenerationLog({
    seasonId: req.seasonId,
    language: req.language,
    createdBy: req.createdBy ?? null,
    inputSnapshot,
  })

  // Build prompt and call the model.
  const ai = await callEditorialModel({
    request: req,
    inputs,
  })

  if (ai.status !== "succeeded" || !ai.parsed?.topics) {
    await completeGenerationLog({
      id: log.id,
      status: "failed",
      outputTopics: [],
      acceptedCount: 0,
      rejectedCount: 0,
      rejectionSummary: {},
      aiRunId: ai.runId,
      errorMessage: ai.errorMessage ?? "AI call did not return JSON",
    })
    return {
      ok: false,
      generation_id: log.id,
      ai_run_id: ai.runId,
      asked: req.count,
      accepted: [],
      rejected: [],
      rejection_summary: {},
      persisted: [],
      reason: "ai_failed",
    }
  }

  // Validate + judge each candidate. Track rejections.
  const lenses = await loadLenses()
  const validLensKeys = new Set(lenses.map((l) => l.key))
  const ctx = {
    excludedTitles: inputs.excluded_titles,
    validLensKeys,
    allowKuwaitBias: !!req.allowKuwaitBias,
    khatMapTitles: inputs.excluded_titles, // already includes candidates
    consumedOriginalTitles: [],
    validEpisodeTypes: VALID_EPISODE_TYPES,
    validTopicDomains: VALID_TOPIC_DOMAINS,
  }
  const rejectionSummary: Record<string, number> = {}
  const accepted: HybridOutputTopic[] = []
  const rejected: HybridOutputTopic[] = []
  const seenTitles = new Set<string>()

  // Lens-diversity tracker for tie-break scoring.
  const batchLensCounts = new Map<string, number>()

  // First pass: judge.
  const judged = (ai.parsed.topics as Array<Record<string, unknown>>).map(
    (raw) => {
      const candidate = coerceCandidate(raw)
      if (seenTitles.has(candidate.title.toLowerCase())) {
        const out: HybridOutputTopic = {
          ...candidate,
          rejected: true,
          rejection_reasons: ["near_dup_khat_map"],
        }
        bump(rejectionSummary, "near_dup_khat_map")
        return { candidate, out, accepted: false }
      }
      seenTitles.add(candidate.title.toLowerCase())

      const decision = judgeHybridCandidate(candidate, ctx)
      if (!decision.ok) {
        for (const r of decision.reasons) bump(rejectionSummary, r)
        const out: HybridOutputTopic = {
          ...candidate,
          rejected: true,
          rejection_reasons: decision.reasons,
        }
        return { candidate, out, accepted: false }
      }
      // Track for diversity scoring.
      batchLensCounts.set(
        candidate.original_lens,
        (batchLensCounts.get(candidate.original_lens) ?? 0) + 1,
      )
      return { candidate, accepted: true, out: null as HybridOutputTopic | null }
    },
  )

  // Second pass: rescore + carry through; we need lens counts populated.
  for (const j of judged) {
    if (!j.accepted) {
      rejected.push(j.out!)
      continue
    }
    const finalScore = rescoreHybridCandidate(j.candidate, {
      worked_report: inputs.worked_report,
      batchLensCounts,
    })
    const out: HybridOutputTopic = {
      ...j.candidate,
      estimated_strength_score: finalScore,
      rejected: false,
      consumed_original_topic_id: matchOriginalTopicId(
        j.candidate.original_lens,
        inputs.original_topics,
      ),
    }
    accepted.push(out)
  }

  // Sort accepted by final score (desc) so the editor sees the best first.
  accepted.sort(
    (a, b) =>
      (b.estimated_strength_score ?? 0) - (a.estimated_strength_score ?? 0),
  )

  // Persist accepted topics → khat_map_episode_candidates.
  const persisted = await persistAcceptedTopics({
    seasonId: req.seasonId,
    generationId: log.id,
    topics: accepted as AcceptedHybridTopic[],
  })

  await completeGenerationLog({
    id: log.id,
    status: "completed",
    outputTopics: [...accepted, ...rejected],
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    rejectionSummary,
    aiRunId: ai.runId,
  })

  return {
    ok: true,
    generation_id: log.id,
    ai_run_id: ai.runId,
    asked: req.count,
    accepted,
    rejected,
    rejection_summary: rejectionSummary,
    persisted,
    fallback_path: pickFallbackPath(inputs),
  }
}

function pickFallbackPath(
  inputs: Awaited<ReturnType<typeof loadHybridInputs>>,
): HybridFallbackPath {
  return inputs.market_clusters.length > 0 ? "clusters" : "foundational"
}

/**
 * Phase 6 readiness decision. Returns null when generation may proceed,
 * or a reason code that maps to operator copy via operator-language.
 *
 * The "analysis_pending" arm is driven entirely from the diagnostic
 * the action layer collects BEFORE calling the generator — the action
 * passes that flag through `req.analysisPending` to skip generation
 * cleanly. This keeps the generator free of side-effect-heavy job
 * detection while still respecting the safety contract.
 */
function decideReadiness(
  inputs: Awaited<ReturnType<typeof loadHybridInputs>>,
): NonNullable<GenerateHybridResult["reason"]> | null {
  const has_clusters = inputs.market_clusters.length > 0
  const worked_has_data =
    inputs.worked_report.strong_topic_domains.length > 0 ||
    inputs.worked_report.weak_topic_domains.length > 0
  const has_foundational =
    inputs.original_topics.length > 0 || worked_has_data
  if (!has_clusters && !has_foundational) return "no_inputs"
  return null
}

// ─── AI call ──────────────────────────────────────────────────────────

async function callEditorialModel(args: {
  request: GenerateHybridRequest
  inputs: Awaited<ReturnType<typeof loadHybridInputs>>
}) {
  const { request: req, inputs } = args

  // Phase 0 — prompt now built by the consolidated builder so the
  // wording lives in one place and ai_runs.prompt_version is meaningful.
  // The output is byte-equivalent to the previous inline code.
  const lenses = await loadLenses()
  const { system, user, version } = buildHybridTopicsPrompt({
    language: req.language,
    count: req.count,
    allowKuwaitBias: !!req.allowKuwaitBias,
    originalTopics: inputs.original_topics,
    marketClusters: inputs.market_clusters,
    workedReport: inputs.worked_report,
    tasteHints: inputs.taste_hints,
    excludedTitles: inputs.excluded_titles,
    lenses,
  })

  return await runAiTask<{ topics: Array<Record<string, unknown>> }>({
    taskKind: "editorial",
    subjectTable: "hybrid_topic_generations",
    subjectId: req.seasonId ?? null,
    promptVersion: version,
    input: {
      language: req.language,
      count: req.count,
      market_cluster_count: inputs.market_clusters.length,
      original_topic_count: inputs.original_topics.length,
      exclusion_count: inputs.excluded_titles.length,
      allow_kuwait_bias: !!req.allowKuwaitBias,
    },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.8 },
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────

function coerceCandidate(raw: Record<string, unknown>): HybridCandidate {
  const s = (k: string) => String(raw[k] ?? "").trim()
  const n = Number(raw["estimated_strength_score"])
  return {
    title: s("title"),
    why_it_matters: s("why_it_matters"),
    why_now: s("why_now"),
    emotional_hook: s("emotional_hook"),
    conflict_angle: s("conflict_angle"),
    market_inspiration: s("market_inspiration"),
    // Cluster label === signal theme; harmless if the AI omits/garbles it —
    // the feedback join simply finds no matching signals and skips.
    primary_theme: s("primary_theme") || "none",
    original_lens: s("original_lens"),
    suggested_episode_type: s("suggested_episode_type"),
    suggested_topic_domain: s("suggested_topic_domain"),
    estimated_strength_score: Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0,
  }
}

/** When the model picks a lens we have a fresh original-thinking row for,
 *  consume it. Choose the most recent matching row. */
function matchOriginalTopicId(
  lens: string,
  originalTopics: Array<{ id: string; lens: string }>,
): string | null {
  const match = originalTopics.find((t) => t.lens === lens)
  return match?.id ?? null
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1
}

function emptyResult(
  req: GenerateHybridRequest,
  reason: NonNullable<GenerateHybridResult["reason"]>,
): GenerateHybridResult {
  return {
    ok: false,
    generation_id: null,
    ai_run_id: null,
    asked: req.count,
    accepted: [],
    rejected: [],
    rejection_summary: {},
    persisted: [],
    reason,
  }
}

// Re-export for the smoke + admin UI.
export { HYBRID_REJECTION_RULES }
export type { HybridRejectionReason } from "./reject"
