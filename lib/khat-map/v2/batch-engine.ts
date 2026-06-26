/**
 * Khat Map v2 — Batch Engine.
 *
 * One public entry point: `generateBatch`. It orchestrates the full
 * round of the wizard's core loop:
 *
 *   1. Read season state     — accepted / rejected decisions, taste
 *   2. Oversample             — ask the LLM for 2× the target count
 *   3. Embed                  — parallel embeddings for every candidate
 *   4. Similarity filter      — hard-block above 0.82, soft-avoid 0.75+
 *   5. Score                  — editorial + taste + domain balance
 *   6. Rank + pick top N      — with within-batch domain diversity
 *   7. Persist                — episode + guest candidates, linked
 *   8. Return BatchResult     — cards + stats + taste snapshot
 *
 * The AI-facing ops are injected via `EngineAI`. Real production code
 * passes `openaiEngineAI`; tests pass a deterministic stub.
 *
 * Prefetch support: the engine is stateless between calls — a caller
 * can invoke `generateBatch` multiple times in parallel for the "next
 * batch pre-generated in background" UX planned in PR3. Every call
 * advances `batch_index` atomically via the journal's max().
 */

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapEpisodeCandidates,
  khatMapSeasonDecisions,
} from "@/lib/db/schema/khat-map"
import { getSeasonById } from "@/lib/khat-map/core/queries"
import {
  classifySimilarity,
  cosineSimilarity,
  buildFingerprintText,
  type SimilarityVerdict,
} from "@/lib/khat-map/learning/embeddings"
import { listNegativeFingerprints } from "@/lib/khat-map/learning/fingerprints"
import {
  getTasteProfile,
  recomputeTasteProfile,
} from "@/lib/khat-map/learning/taste"
import {
  computeDomainLoad,
  computeFinalScore,
  computeTasteAlignment,
  withinBatchDomainPenalty,
} from "./scoring"
import { computeRegionalAudienceFit } from "./regional-fit"
import { seasonCategoryCap, overRepresentedCategories } from "./diversity"
import { selectByPotential } from "./select-by-potential"
import { openaiEngineAI } from "./openai-engine-ai"
import { persistBatchCards } from "./persistence"
import {
  assertStrictBankSufficient,
  buildStrictAngleBlock,
  filterByStrictAngles,
  listStrictAngleOptions,
} from "./strict"
import {
  buildRoleHintBlock,
  type KhatMapMustIncludeRole,
} from "./completion"
import {
  applyEditorialFilters,
  domainWeightMultiplier,
} from "./editorial-filter"
import { isNearDuplicateTitle } from "./title-similarity"
import { KHAT_EDITORIAL_CONTROLS_DEFAULTS } from "@/types/khat-map"
import { getDomainPerformanceMap } from "@/lib/khat-map/performance"
import { performanceFactor } from "@/lib/khat-map/scoring/weights"
import type {
  BatchResult,
  BatchStats,
  CandidateGenInput,
  EngineAI,
  ScoredCandidate,
} from "./types"
import type {
  KhatMapFeedbackReasonCategory,
  KhatMapInvasionPolicy,
  KhatMapTopicDomain,
  KhatMapTopicFingerprint,
  KhatMapV2Mode,
} from "@/types/khat-map"

export interface GenerateBatchInput {
  season_id: string
  /** Cards to return. Default 4. */
  size?: number
  /** Which admin is driving — for taste profile + decision attribution. */
  admin_id?: string | null
  /** Override season-level invasion policy. */
  invasion_policy?: KhatMapInvasionPolicy
  /**
   * When false, only in-season rejections feed the similarity filter.
   * Default true; PR3 exposes this as the "Relax filter" toggle.
   */
  use_cross_season_negatives?: boolean
  /** Tests inject a stub EngineAI. Production defaults to OpenAI. */
  ai?: EngineAI
  /**
   * Oversampling multiplier. 2 means the engine asks for 2× `size`
   * raw candidates. Higher values trade cost for quality.
   */
  oversample?: number
  /**
   * When true, recompute the admin's taste profile before ranking.
   * Default true — a few extra ms for fresh learning signals.
   */
  refresh_taste?: boolean
  /**
   * v2 mode — drives strict-angle filtering. When `"strict"`, the engine
   * queries the topic bank, injects the allowed codes into the prompt,
   * post-filters by angle_code, and throws `AngleBankExhaustedError`
   * when the bank can't cover `size` slots.
   */
  mode?: KhatMapV2Mode
  /**
   * When set, the engine prompts the LLM to produce EXACTLY these roles
   * in order (one card per role). Used by intelligent completion.
   */
  required_roles?: KhatMapMustIncludeRole[]
}

const DEFAULT_BATCH_SIZE = 4
const DEFAULT_OVERSAMPLE = 2

export async function generateBatch(
  input: GenerateBatchInput,
): Promise<BatchResult> {
  const ai = input.ai ?? openaiEngineAI
  const size = input.size ?? DEFAULT_BATCH_SIZE
  const oversample = input.oversample ?? DEFAULT_OVERSAMPLE
  const useCross = input.use_cross_season_negatives ?? true
  const refreshTaste = input.refresh_taste ?? true

  const season = await getSeasonById(input.season_id)
  if (!season) throw new Error(`generateBatch: unknown season ${input.season_id}`)

  // ─── 1. Load season state ─────────────────────────────────────────────────
  const [
    acceptedDomainCounts,
    acceptedTitles,
    { rejectedTitles, rejectedReasons },
    tasteProfile,
    domainPerformance,
  ] = await Promise.all([
    loadAcceptedDomainCounts(input.season_id),
    loadAcceptedTitles(input.season_id),
    loadRejectedSignals(input.season_id),
    input.admin_id
      ? refreshTaste
        ? recomputeTasteProfile(input.admin_id)
        : getTasteProfile(input.admin_id)
      : Promise.resolve({
          user_id: "",
          preferred_domains: [],
          rejected_patterns: [],
          depth_score: 0.5,
          controversy_tolerance: 0.5,
          emotional_preference: 0.5,
          kuwait_relevance_weight: 0.5,
          total_decisions: 0,
          last_recomputed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
    // Cross-season aggregate — feeds the closed-loop multiplier in step 4.
    // Returns an empty Map when no episodes have been published+synced yet.
    getDomainPerformanceMap(),
  ])

  const batch_index = await nextBatchIndex(input.season_id)
  const invasionPolicy = input.invasion_policy ?? "optional"
  const seasonTarget = estimateSeasonTarget(acceptedDomainCounts)

  // ─── 1a. Strict mode pre-query ───────────────────────────────────────────
  // Must run BEFORE the LLM call so an exhausted bank fails fast without
  // burning tokens.
  const strict = input.mode === "strict"
  const extraSystemBlocks: string[] = []
  let allowedAngleCodes: Set<string> | null = null
  if (strict) {
    const options = await listStrictAngleOptions(input.season_id)
    // We need at least `size` fresh angles — one per card we intend to
    // surface. assertStrictBankSufficient throws AngleBankExhaustedError
    // which the server action translates into a UI-visible code.
    assertStrictBankSufficient(options, size)
    allowedAngleCodes = new Set(options.map((o) => o.angle_code))
    extraSystemBlocks.push(
      buildStrictAngleBlock(options, Math.min(options.length, 30)),
    )
  }

  // ─── 1b. Required-role hint (intelligent completion) ─────────────────────
  if (input.required_roles && input.required_roles.length > 0) {
    extraSystemBlocks.push(buildRoleHintBlock(input.required_roles))
  }

  // Pull editorial controls from the season — these flow into the prompt
  // AND into the post-LLM filter layer below.
  const controls = season.editorial_controls ?? KHAT_EDITORIAL_CONTROLS_DEFAULTS

  // Phase A/B redesign — derive the prompt phase from the season's
  // wizard stage. Seasons in Phase A (`"topics"`) get a topics-only
  // contract; anything else (legacy "setup", "topics_locked", "guests",
  // "complete") falls through to the legacy combined topic+guest shape
  // so re-runs of completion / regenerate after locking still produce
  // guests if needed.
  const phase: "topics" | "guests" =
    season.wizard_stage === "topics" ? "topics" : "guests"

  // ─── 1c. Audience-first generation (the redesign) ─────────────────────────
  // Runs for ordinary Phase A topic batches. Skips strict angle-bank mode and
  // required-role completion — those are slot-positional flows with their own
  // contracts. The board ranks by Regional Audience Fit; category counts are
  // only a diversity signal (soft prompt hint + the post-rank season cap).
  const useAudienceFirst =
    phase === "topics" &&
    !strict &&
    !(input.required_roles && input.required_roles.length > 0)

  const seasonCap = seasonCategoryCap(seasonTarget)
  let acceptedByCategory: Record<string, number> = {}
  if (useAudienceFirst) {
    acceptedByCategory = await loadAcceptedCategoryCounts(input.season_id)
  }

  // ─── 2. Oversample via LLM ────────────────────────────────────────────────
  // Audience-first asks for a diverse pool of high-potential ideas to rank +
  // diversity-filter (capped so one LLM call stays fast). Completion-mode
  // generates exactly `size` cards (slot-positional). Otherwise size × oversample.
  const AUDIENCE_POOL_CAP = 10
  const targetCount = useAudienceFirst
    ? Math.min(AUDIENCE_POOL_CAP, Math.max(8, size + 4))
    : input.required_roles && input.required_roles.length > 0
      ? Math.max(input.required_roles.length, size)
      : size * oversample

  const genInput: CandidateGenInput = {
    season_id: input.season_id,
    target_count: targetCount,
    season_target: seasonTarget,
    accepted_domain_counts: acceptedDomainCounts,
    accepted_titles: acceptedTitles,
    rejected_titles: rejectedTitles,
    rejected_reason_categories: rejectedReasons,
    taste_profile: tasteProfile,
    invasion_policy: invasionPolicy,
    editorial_controls: controls,
    phase,
    extra_system_blocks: extraSystemBlocks,
    audience_first: useAudienceFirst,
    accepted_category_counts: useAudienceFirst ? acceptedByCategory : undefined,
    over_represented_categories: useAudienceFirst
      ? overRepresentedCategories(acceptedByCategory, seasonCap)
      : undefined,
  }
  const llmStart = Date.now()
  let raws = await ai.generateCandidates(genInput)
  const llm_ms = Date.now() - llmStart
  const oversampledCount = raws.length

  // Phase A safety net — even with the prompt rule, a noncompliant model
  // could still emit a guest object. Strip it before persistence so the
  // candidate table only sees topic data in Phase A.
  if (phase === "topics") {
    raws = raws.map((r) => (r.guest ? { ...r, guest: null } : r))
  }

  // Strict-mode post-filter: drop anything that didn't honor the bank.
  // Done BEFORE editorial filter + embed so we don't pay embedding cost
  // on invalid cards.
  if (strict && allowedAngleCodes) {
    const { kept } = filterByStrictAngles(raws, allowedAngleCodes)
    raws = kept
  }

  // Editorial-controls filter: drop cards violating disabled domains,
  // banned topics/guests, repeated subjects, and guest gender/geo filters.
  const editorialResult = applyEditorialFilters(raws, controls)
  raws = editorialResult.kept
  const editorialDropCount = editorialResult.dropped.length

  // Already-chosen dedup (Guided hybrid): drop any AI candidate whose title
  // near-duplicates a topic already locked into the season (manual seed or
  // earlier accept). Belt-and-suspenders alongside the prompt rule, so a
  // seeded topic is never re-proposed back to the operator.
  let dedupDropCount = 0
  if (acceptedTitles.length > 0) {
    const beforeDedup = raws.length
    raws = raws.filter(
      (r) => !isNearDuplicateTitle(r.topic.working_title, acceptedTitles),
    )
    dedupDropCount = beforeDedup - raws.length
  }

  if (raws.length === 0) {
    return emptyResult(input.season_id, batch_index, tasteProfile, useCross, {
      oversampled: oversampledCount,
      editorial_dropped: editorialDropCount,
      dedup_dropped: dedupDropCount,
      llm_ms,
      embed_ms: 0,
    })
  }

  // ─── 3. Embed each candidate ──────────────────────────────────────────────
  const embedStart = Date.now()
  const embeddings = await Promise.all(
    raws.map((r) =>
      ai.embed(
        buildFingerprintText(
          r.topic.working_title,
          r.topic.why_matters || r.topic.description || null,
          r.topic.topic_domain,
        ),
      ),
    ),
  )
  const embed_ms = Date.now() - embedStart

  // ─── 4. Load negatives once, then scan every candidate ────────────────────
  const negatives = await listNegativeFingerprints(input.season_id, {
    include_cross_season: useCross,
  })

  let hard_blocked = 0
  let soft_avoided = 0
  const scored: ScoredCandidate[] = []
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i]
    const emb = embeddings[i]
    const { verdict, max, trigger } = scanNegatives(emb, negatives)
    if (verdict === "hard_block") {
      hard_blocked++
      continue
    }
    if (verdict === "soft_avoid") soft_avoided++
    const taste_alignment = computeTasteAlignment(raw, tasteProfile)

    let final_score: number
    let domain_load: number
    if (useAudienceFirst) {
      // Audience-first path: rank purely by Regional Audience Fit (episode
      // potential for the GCC). No domain-load penalty and no taste/performance
      // multiplier — category diversity is applied later as a constraint in
      // selectByPotential, and taste only breaks near-ties there.
      domain_load = 0
      final_score = computeRegionalAudienceFit(raw.topic.audience_fit)
    } else {
      domain_load = computeDomainLoad(
        raw.topic.topic_domain,
        acceptedDomainCounts,
        seasonTarget,
      )
      const baseScore = computeFinalScore({
        editorial_score: raw.editorial_score,
        taste_alignment,
        domain_load,
        similarity_verdict: verdict,
        similarity_max: max,
      })
      // Multiplier ladder, applied bottom-up:
      //   1. Editorial-controls domain weight (admin's pre-generation knob)
      //   2. Performance-band multiplier (closed-loop signal from published
      //      episodes in this domain). Domains without enough data return
      //      1.0 and don't move the score.
      const editorialFactor = domainWeightMultiplier(raw.topic.topic_domain, controls)
      const perfRow = domainPerformance.get(raw.topic.topic_domain)
      const perfFactor = performanceFactor(
        perfRow?.avg_performance ?? null,
        perfRow?.episodes_count ?? 0,
      )
      final_score = baseScore * editorialFactor * perfFactor
    }
    scored.push({
      raw,
      embedding: emb,
      similarity_verdict: verdict,
      similarity_max: max,
      similarity_trigger_title: trigger?.title_ar ?? null,
      taste_alignment,
      domain_load,
      final_score,
    })
  }

  // ─── 5. Rank + pick ───────────────────────────────────────────────────────
  let picks: ScoredCandidate[]
  if (useAudienceFirst) {
    // Potential-first: take the highest Regional Audience Fit, with a soft
    // diversity penalty for near-ties and a hard per-category season cap so no
    // category dominates. Episode potential leads; balance only constrains.
    picks = selectByPotential(scored, {
      size,
      seasonCap,
      acceptedByCategory,
    }).picks
  } else {
    // Legacy path: greedy top-N with a soft within-batch domain penalty.
    picks = []
    const remaining = [...scored].sort((a, b) => b.final_score - a.final_score)
    while (picks.length < size && remaining.length > 0) {
      let bestIdx = 0
      let bestScore = -Infinity
      for (let i = 0; i < remaining.length; i++) {
        const c = remaining[i]
        const adjusted = c.final_score - withinBatchDomainPenalty(c, picks)
        if (adjusted > bestScore) {
          bestScore = adjusted
          bestIdx = i
        }
      }
      picks.push(remaining[bestIdx])
      remaining.splice(bestIdx, 1)
    }
  }

  // ─── 6. Persist picks + build BatchResult ─────────────────────────────────
  const cards = await persistBatchCards(
    input.season_id,
    picks,
    tasteProfile,
    domainPerformance,
  )
  const stats: BatchStats = {
    oversampled: oversampledCount,
    hard_blocked,
    soft_avoided,
    final: cards.length,
    cross_season_negatives_included: useCross,
    llm_ms,
    embed_ms,
    editorial_dropped: editorialDropCount,
    dedup_dropped: dedupDropCount,
  }
  return {
    season_id: input.season_id,
    batch_index,
    cards,
    stats,
    taste_snapshot: tasteProfile,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadAcceptedDomainCounts(
  season_id: string,
): Promise<Record<KhatMapTopicDomain, number>> {
  // Which topic_candidate_ids did the admin accept?
  const acceptedRows = await db!
    .select({
      topic_candidate_id: khatMapSeasonDecisions.topic_candidate_id,
    })
    .from(khatMapSeasonDecisions)
    .where(
      and(
        eq(khatMapSeasonDecisions.season_id, season_id),
        eq(khatMapSeasonDecisions.kind, "accept"),
      ),
    )
  const ids = acceptedRows
    .map((r) => r.topic_candidate_id)
    .filter((x): x is string => x !== null)
  const out = {} as Record<KhatMapTopicDomain, number>
  if (ids.length === 0) return out
  const domainRows = await db!
    .select({
      topic_domain: khatMapEpisodeCandidates.topic_domain,
    })
    .from(khatMapEpisodeCandidates)
    .where(inArray(khatMapEpisodeCandidates.id, ids))
  for (const r of domainRows) {
    const d = r.topic_domain as KhatMapTopicDomain
    out[d] = (out[d] ?? 0) + 1
  }
  return out
}

/**
 * Per-category accepted counts (the redesigned balance axis). Reads the
 * `topic_category` column on accepted candidates so the coverage planner knows
 * which of the 15 categories are under-served across the whole season. Legacy
 * accepted rows (null category) simply don't count toward any category — the
 * planner treats them as headroom, which is the safe default.
 */
async function loadAcceptedCategoryCounts(
  season_id: string,
): Promise<Record<string, number>> {
  const acceptedRows = await db!
    .select({ topic_candidate_id: khatMapSeasonDecisions.topic_candidate_id })
    .from(khatMapSeasonDecisions)
    .where(
      and(
        eq(khatMapSeasonDecisions.season_id, season_id),
        eq(khatMapSeasonDecisions.kind, "accept"),
      ),
    )
  const ids = acceptedRows
    .map((r) => r.topic_candidate_id)
    .filter((x): x is string => x !== null)
  const out: Record<string, number> = {}
  if (ids.length === 0) return out
  const rows = await db!
    .select({ topic_category: khatMapEpisodeCandidates.topic_category })
    .from(khatMapEpisodeCandidates)
    .where(inArray(khatMapEpisodeCandidates.id, ids))
  for (const r of rows) {
    const c = r.topic_category
    if (c) out[c] = (out[c] ?? 0) + 1
  }
  return out
}

/**
 * Titles of every topic already accepted into the season (manual seeds +
 * AI-accepted). Fed to the prompt as "already chosen — don't duplicate" and
 * to the post-LLM dedup filter. Mirrors loadAcceptedDomainCounts.
 */
async function loadAcceptedTitles(season_id: string): Promise<string[]> {
  const acceptedRows = await db!
    .select({
      topic_candidate_id: khatMapSeasonDecisions.topic_candidate_id,
    })
    .from(khatMapSeasonDecisions)
    .where(
      and(
        eq(khatMapSeasonDecisions.season_id, season_id),
        eq(khatMapSeasonDecisions.kind, "accept"),
      ),
    )
  const ids = acceptedRows
    .map((r) => r.topic_candidate_id)
    .filter((x): x is string => x !== null)
  if (ids.length === 0) return []
  const rows = await db!
    .select({ working_title: khatMapEpisodeCandidates.working_title })
    .from(khatMapEpisodeCandidates)
    .where(inArray(khatMapEpisodeCandidates.id, ids))
  // working_title is NOT NULL in the schema, so no null-guard needed.
  return rows.map((r) => r.working_title)
}

async function loadRejectedSignals(season_id: string): Promise<{
  rejectedTitles: string[]
  rejectedReasons: string[]
}> {
  const rejectedRows = await db!
    .select({
      topic_candidate_id: khatMapSeasonDecisions.topic_candidate_id,
      reason_category: khatMapSeasonDecisions.reason_category,
    })
    .from(khatMapSeasonDecisions)
    .where(
      and(
        eq(khatMapSeasonDecisions.season_id, season_id),
        eq(khatMapSeasonDecisions.kind, "reject"),
      ),
    )
  const ids = rejectedRows
    .map((r) => r.topic_candidate_id)
    .filter((x): x is string => x !== null)
  let titles: string[] = []
  if (ids.length > 0) {
    const rows = await db!
      .select({
        working_title: khatMapEpisodeCandidates.working_title,
      })
      .from(khatMapEpisodeCandidates)
      .where(inArray(khatMapEpisodeCandidates.id, ids))
    titles = rows.map((r) => r.working_title).filter(Boolean)
  }
  const reasons = rejectedRows
    .map((r) => r.reason_category)
    .filter(
      (x): x is KhatMapFeedbackReasonCategory => x !== null && x !== undefined,
    )
  return { rejectedTitles: titles, rejectedReasons: reasons }
}

async function nextBatchIndex(season_id: string): Promise<number> {
  const rows = await db!
    .select({ batch_index: khatMapSeasonDecisions.batch_index })
    .from(khatMapSeasonDecisions)
    .where(eq(khatMapSeasonDecisions.season_id, season_id))
  const max = rows.reduce((m, r) => Math.max(m, r.batch_index ?? 0), 0)
  return max + 1
}

/**
 * Season target estimation when no explicit value is provided. Uses
 * accepted count as a lower bound, defaults to 10 (matches the wizard's
 * default episode count).
 */
function estimateSeasonTarget(
  counts: Record<KhatMapTopicDomain, number>,
): number {
  const accepted = Object.values(counts).reduce((a, b) => a + b, 0)
  return Math.max(10, accepted + 5)
}

function scanNegatives(
  candidate: number[],
  negatives: KhatMapTopicFingerprint[],
): {
  verdict: SimilarityVerdict
  max: number
  trigger: KhatMapTopicFingerprint | null
} {
  let verdict: SimilarityVerdict = "ok"
  let max = 0
  let trigger: KhatMapTopicFingerprint | null = null
  for (const n of negatives) {
    if (n.embedding.length !== candidate.length) continue
    const s = cosineSimilarity(candidate, n.embedding)
    if (s > max) {
      max = s
      trigger = n
    }
    const v = classifySimilarity(s)
    if (v === "hard_block") verdict = "hard_block"
    else if (v === "soft_avoid" && verdict !== "hard_block") verdict = "soft_avoid"
  }
  return { verdict, max, trigger }
}

function emptyResult(
  season_id: string,
  batch_index: number,
  taste: BatchResult["taste_snapshot"],
  useCross: boolean,
  partial: Pick<
    BatchStats,
    "oversampled" | "editorial_dropped" | "dedup_dropped" | "llm_ms" | "embed_ms"
  >,
): BatchResult {
  return {
    season_id,
    batch_index,
    cards: [],
    taste_snapshot: taste,
    stats: {
      oversampled: partial.oversampled,
      hard_blocked: 0,
      soft_avoided: 0,
      // Carry the real drop counts so the caller can explain WHY the batch is
      // empty (too-strict editorial filters vs. everything dedup'd against the
      // already-chosen seeds) instead of failing silently.
      editorial_dropped: partial.editorial_dropped,
      dedup_dropped: partial.dedup_dropped,
      final: 0,
      cross_season_negatives_included: useCross,
      llm_ms: partial.llm_ms,
      embed_ms: partial.embed_ms,
    },
  }
}
