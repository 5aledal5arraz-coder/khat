/**
 * Khat Map v2 — Guest-First Engine.
 *
 * Inverse pipeline of the batch engine: admin pins a guest and asks for
 * topic angles that fit them. Two LLM passes:
 *
 *   1. `analyzeGuest`                 → structured GuestProfile
 *   2. `generateGuestAnchoredTopics`  → N angles tied to their expertise
 *
 * Then the usual filtering, scoring, and persistence. The persisted
 * guest row is shared across all N cards — the UI renders one guest
 * with three topic options, not three guests.
 */

import { getSeasonById, createGuestCandidate } from "@/lib/khat-map/core/queries"
import {
  applyEditorialFilters,
  domainWeightMultiplier,
} from "./editorial-filter"
import { KHAT_EDITORIAL_CONTROLS_DEFAULTS } from "@/types/khat-map"
import { getDomainPerformanceMap } from "@/lib/khat-map/performance"
import { performanceFactor } from "@/lib/khat-map/scoring/weights"
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
  buildTasteReasoning,
} from "./scoring"
import { buildCardExplainability } from "./explainability"
import { openaiEngineAI } from "./openai-engine-ai"
import { createEpisodeCandidate } from "@/lib/khat-map/core/queries"
import type {
  BatchCard,
  BatchStats,
  EngineAI,
  GuestFirstInput,
  GuestFirstResult,
  GuestProfile,
  RawCandidate,
  ScoredCandidate,
} from "./types"
import type {
  KhatMapTopicDomain,
  KhatMapTopicFingerprint,
  KhatMapUserTasteProfile,
} from "@/types/khat-map"

const DEFAULT_ANGLE_COUNT = 3

export interface GenerateGuestFirstInput extends GuestFirstInput {
  use_cross_season_negatives?: boolean
  ai?: EngineAI
  refresh_taste?: boolean
}

export async function generateGuestFirstCards(
  input: GenerateGuestFirstInput,
): Promise<GuestFirstResult> {
  const ai = input.ai ?? openaiEngineAI
  const angleCount = input.angle_count ?? DEFAULT_ANGLE_COUNT
  const useCross = input.use_cross_season_negatives ?? true
  const refreshTaste = input.refresh_taste ?? true

  const season = await getSeasonById(input.season_id)
  if (!season) {
    throw new Error(`generateGuestFirstCards: unknown season ${input.season_id}`)
  }

  // ─── 1. Analyze the guest ────────────────────────────────────────────────
  const llmStart = Date.now()
  const profile = await ai.analyzeGuest({
    full_name: input.guest.full_name,
    bio: input.guest.bio ?? null,
    social_accounts: input.guest.social_accounts ?? {},
    official_website: input.guest.official_website ?? null,
  })

  // Enforce the season's strict guest filters against the analyzed profile.
  // The batch engine drops violators after the fact; in the guest-first
  // flow the admin has already pinned a guest, so a violation means the
  // admin made a mistake (or the analyzer couldn't verify the required
  // facts). Fail loudly rather than silently persist a guest who'll be
  // rejected by every downstream check.
  const controls = season.editorial_controls ?? KHAT_EDITORIAL_CONTROLS_DEFAULTS
  const filterError = validateProfileAgainstFilters(
    profile,
    controls.guest_filters,
  )
  if (filterError) {
    throw new Error(filterError)
  }

  // Persist the guest row up-front — every card we produce will link
  // to it. If topic generation fails after this, the guest row stays —
  // admin still sees a candidate they can manually edit.
  const persistedGuest = await createGuestCandidate({
    season_id: input.season_id,
    full_name: profile.full_name,
    display_name: profile.display_name,
    bio: profile.inferred_bio,
    gender: profile.gender,
    profession: profile.profession,
    why_fit: profile.editorial_angle,
    category: profile.profession,
    country: profile.country,
    city: profile.city,
    public_links: [],
    social_accounts: profile.social_accounts,
    official_website: profile.official_website,
    evidence_summary: null,
    evidence_citations: [],
    relevance_score: Math.round(profile.confidence * 10),
    depth_score: null,
    reach_score: null,
    risk_flags: [],
  })

  // ─── 2. Gather context the topic generator needs ─────────────────────────
  const tasteProfile: KhatMapUserTasteProfile = input.admin_id
    ? refreshTaste
      ? await recomputeTasteProfile(input.admin_id)
      : await getTasteProfile(input.admin_id)
    : neutralTaste()

  const negatives = await listNegativeFingerprints(input.season_id, {
    include_cross_season: useCross,
  })
  const rejected_titles = negatives.map((n) => n.title_ar)

  // Closed-loop signal — empty Map until at least one episode is published
  // and synced.
  const domainPerformance = await getDomainPerformanceMap()

  // ─── 3. Generate topic angles anchored to this guest ─────────────────────
  let raws = await ai.generateGuestAnchoredTopics({
    guest_profile: profile,
    angle_count: angleCount,
    rejected_titles,
    taste_profile: tasteProfile,
    editorial_controls: controls,
  })
  const llm_ms = Date.now() - llmStart
  const oversampledCount = raws.length

  // Editorial-controls filter (same rules as the batch engine).
  const editorialResult = applyEditorialFilters(raws, controls)
  raws = editorialResult.kept
  const editorialDropCount = editorialResult.dropped.length

  if (raws.length === 0) {
    // Still return the persisted guest so the UI can offer manual editing.
    return {
      season_id: input.season_id,
      batch_index: input.batch_index ?? 0,
      cards: [],
      stats: emptyStats(useCross, oversampledCount, llm_ms, 0, editorialDropCount),
      taste_snapshot: tasteProfile,
      guest_profile: profile,
      persisted_guest: persistedGuest,
    }
  }

  // ─── 4. Embed + similarity filter (mirrors batch engine) ─────────────────
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

  // For guest-first we don't have an accepted_domain_counts map — the
  // admin's intent here is to book THIS guest, so domain balance is
  // less relevant. We still compute it defensively.
  const acceptedDomainCounts = {} as Record<KhatMapTopicDomain, number>
  const seasonTarget = 10

  let hard_blocked = 0
  let soft_avoided = 0
  const scored: ScoredCandidate[] = []
  for (let i = 0; i < raws.length; i++) {
    const raw = attachGuestToRaw(raws[i], profile)
    const emb = embeddings[i]
    const { verdict, max, trigger } = scanNegatives(emb, negatives)
    if (verdict === "hard_block") {
      hard_blocked++
      continue
    }
    if (verdict === "soft_avoid") soft_avoided++
    const domain_load = computeDomainLoad(
      raw.topic.topic_domain,
      acceptedDomainCounts,
      seasonTarget,
    )
    const taste_alignment = computeTasteAlignment(raw, tasteProfile)
    const perfRow = domainPerformance.get(raw.topic.topic_domain)
    const perfFactor = performanceFactor(
      perfRow?.avg_performance ?? null,
      perfRow?.episodes_count ?? 0,
    )
    scored.push({
      raw,
      embedding: emb,
      similarity_verdict: verdict,
      similarity_max: max,
      similarity_trigger_title: trigger?.title_ar ?? null,
      taste_alignment,
      domain_load,
      final_score:
        computeFinalScore({
          editorial_score: raw.editorial_score,
          taste_alignment,
          domain_load,
          similarity_verdict: verdict,
          similarity_max: max,
        }) *
        domainWeightMultiplier(raw.topic.topic_domain, controls) *
        perfFactor,
    })
  }

  // ─── 5. Rank + pick (domain diversity still useful) ──────────────────────
  const picks: ScoredCandidate[] = []
  const remaining = [...scored].sort((a, b) => b.final_score - a.final_score)
  while (picks.length < angleCount && remaining.length > 0) {
    let bestIdx = 0
    let bestScore = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const adjusted =
        remaining[i].final_score - withinBatchDomainPenalty(remaining[i], picks)
      if (adjusted > bestScore) {
        bestScore = adjusted
        bestIdx = i
      }
    }
    picks.push(remaining[bestIdx])
    remaining.splice(bestIdx, 1)
  }

  // ─── 6. Persist topics — ALL linked to the same guest row ────────────────
  const cards: BatchCard[] = []
  for (const pick of picks) {
    const topicRow = await createEpisodeCandidate({
      season_id: input.season_id,
      working_title: pick.raw.topic.working_title,
      episode_type: pick.raw.topic.episode_type,
      topic_domain: pick.raw.topic.topic_domain,
      topic_angle_code: pick.raw.topic.topic_angle_code,
      hook: pick.raw.topic.hook,
      why_matters: pick.raw.topic.why_matters,
      why_now: pick.raw.topic.why_now,
      goal: pick.raw.topic.goal,
      description: pick.raw.topic.description,
      main_axes: pick.raw.topic.main_axes,
      suggested_questions: pick.raw.topic.suggested_questions,
      suggested_guest_candidate_id: persistedGuest.id,
      slot_index: null,
    })
    const explainability = buildCardExplainability({
      scored: pick,
      taste: tasteProfile,
      domain_performance:
        domainPerformance.get(pick.raw.topic.topic_domain) ?? null,
      similarity_trigger_title: pick.similarity_trigger_title,
    })
    cards.push({
      topic_candidate: topicRow,
      guest_candidate: persistedGuest,
      editorial_score: pick.raw.editorial_score,
      taste_alignment: pick.taste_alignment,
      similarity_verdict: pick.similarity_verdict,
      similarity_max: pick.similarity_max,
      why_now: pick.raw.why_now,
      why_fit_you: buildTasteReasoning(pick.raw, tasteProfile),
      domain_reasoning: pick.raw.domain_reasoning,
      explainability,
    })
  }

  return {
    season_id: input.season_id,
    batch_index: input.batch_index ?? 0,
    cards,
    stats: {
      oversampled: oversampledCount,
      hard_blocked,
      soft_avoided,
      editorial_dropped: editorialDropCount,
      // Guest-first generation doesn't run the already-chosen dedup filter.
      dedup_dropped: 0,
      final: cards.length,
      cross_season_negatives_included: useCross,
      llm_ms,
      embed_ms,
    },
    taste_snapshot: tasteProfile,
    guest_profile: profile,
    persisted_guest: persistedGuest,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Guest-anchored raws may omit the guest field because the prompt says
 * "attach the same guest to every candidate." We fill it in here from
 * the analyzed profile so downstream code can treat guest-first
 * candidates identically to batch candidates.
 */
function attachGuestToRaw(
  raw: RawCandidate,
  profile: GuestProfile,
): RawCandidate {
  if (raw.guest) return raw
  return {
    ...raw,
    guest: {
      full_name: profile.full_name,
      display_name: profile.display_name,
      bio: profile.inferred_bio,
      gender: profile.gender,
      profession: profile.profession,
      why_fit: profile.editorial_angle,
      category: profile.profession,
      country: profile.country,
      city: profile.city,
      social_accounts: profile.social_accounts,
      official_website: profile.official_website,
      relevance_score: Math.round(profile.confidence * 10),
      depth_score: null,
      reach_score: null,
    },
  }
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

function emptyStats(
  useCross: boolean,
  oversampled: number,
  llm_ms: number,
  embed_ms: number,
  editorial_dropped = 0,
): BatchStats {
  return {
    oversampled,
    hard_blocked: 0,
    soft_avoided: 0,
    editorial_dropped,
    dedup_dropped: 0,
    final: 0,
    cross_season_negatives_included: useCross,
    llm_ms,
    embed_ms,
  }
}

function neutralTaste(): KhatMapUserTasteProfile {
  const now = new Date().toISOString()
  return {
    user_id: "",
    preferred_domains: [],
    rejected_patterns: [],
    depth_score: 0.5,
    controversy_tolerance: 0.5,
    emotional_preference: 0.5,
    kuwait_relevance_weight: 0.5,
    total_decisions: 0,
    last_recomputed_at: null,
    created_at: now,
    updated_at: now,
  }
}

// Markers reused from editorial-filter; duplicated here to avoid a cycle
// import (editorial-filter already imports from this file's neighbors).
const GUEST_FIRST_KUWAITI_MARKERS = [
  "kuwait",
  "kuwaiti",
  "الكويت",
  "كويتي",
  "كويتية",
  "kw",
]

function isKuwaitiCountry(country: string | null | undefined): boolean {
  if (!country) return false
  const lc = country.toLowerCase().trim()
  if (!lc) return false
  return GUEST_FIRST_KUWAITI_MARKERS.some((m) => lc === m || lc.includes(m))
}

/**
 * Returns an Arabic error string if the analyzed profile violates the
 * season's strict guest filters, or `null` if it passes. Called before
 * persistence so a mismatched guest never reaches the candidate table.
 */
function validateProfileAgainstFilters(
  profile: GuestProfile,
  filters: { gender: string; nationality: string },
): string | null {
  if (filters.gender !== "all" && profile.gender !== filters.gender) {
    return `لا يطابق هذا الضيف فلتر الجنس للموسم (المطلوب: ${filters.gender}، المتوفّر: ${profile.gender}).`
  }
  if (filters.nationality !== "any") {
    if (!profile.country || !profile.country.trim()) {
      return "لا يمكن التحقّق من جنسية الضيف. الموسم يفرض فلتر جنسيّة صارمًا — أضف معلومات جنسيّته يدويًا."
    }
    const kuwaiti = isKuwaitiCountry(profile.country)
    if (filters.nationality === "kuwaiti" && !kuwaiti) {
      return `لا يطابق هذا الضيف فلتر الجنسية للموسم (المطلوب: كويتي، المتوفّر: ${profile.country}).`
    }
    if (filters.nationality === "non_kuwaiti" && kuwaiti) {
      return `لا يطابق هذا الضيف فلتر الجنسية للموسم (المطلوب: غير كويتي، المتوفّر: ${profile.country}).`
    }
  }
  return null
}
