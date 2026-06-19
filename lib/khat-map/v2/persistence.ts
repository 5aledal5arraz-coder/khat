/**
 * Khat Map v2 — persistence layer.
 *
 * Converts in-memory `ScoredCandidate[]` into real DB rows (both the
 * episode_candidate and its optional guest_candidate) and returns
 * `BatchCard[]` with IDs the UI can reference in decisions.
 *
 * Also provides the compose-together helpers the PR3 action layer
 * will call:
 *   - recordDecisionAndFingerprint  → atomically append to the
 *     decision journal AND write the matching topic fingerprint
 *   - undoDecisionAndFingerprint    → reverse both sides
 */

import {
  createEpisodeCandidate,
  createGuestCandidate,
} from "@/lib/khat-map/core/queries"
import {
  recordDecision,
  undoDecision,
  type RecordDecisionInput,
} from "@/lib/khat-map/learning/decisions"
import {
  writeFingerprint,
  removeFingerprintsForDecision,
} from "@/lib/khat-map/learning/fingerprints"
import { buildTasteReasoning } from "./scoring"
import { buildCardExplainability } from "./explainability"
import type {
  BatchCard,
  ScoredCandidate,
} from "./types"
import type {
  KhatMapDomainPerformance,
  KhatMapGuestCandidate,
  KhatMapSeasonDecision,
  KhatMapTopicDomain,
  KhatMapTopicFingerprint,
  KhatMapUserTasteProfile,
} from "@/types/khat-map"

/**
 * Persist a batch's ranked picks. Each one becomes a proposed episode
 * candidate plus (optionally) a proposed guest candidate. The two rows
 * are linked via suggested_guest_candidate_id.
 *
 * Candidates are inserted with status='proposed' — v1 convention. PR3
 * flips to 'approved' on accept or 'rejected' on reject via the
 * existing updateEpisodeCandidateStatus path.
 */
export async function persistBatchCards(
  season_id: string,
  picks: ScoredCandidate[],
  taste: KhatMapUserTasteProfile,
  domain_performance: Map<KhatMapTopicDomain, KhatMapDomainPerformance> = new Map(),
): Promise<BatchCard[]> {
  const cards: BatchCard[] = []
  for (const pick of picks) {
    // Production-readiness fix sprint — guest_candidate population.
    //
    // The AI sometimes returns a guest object with empty / blank fields
    // (no name, no bio, no archetype). Previously those rows were
    // inserted as NULLs, leaving operators with empty cards that
    // referenced nothing. We now substitute clear placeholder values
    // so the row is **honest about being a stub** instead of pretending
    // a real guest exists. The episode candidate stays linked so the
    // operator's wizard knows a guest is needed, but the UI can render
    // "[يحتاج اقتراح ضيف]" instead of a phantom name.
    let guestRow: KhatMapGuestCandidate | null = null
    if (pick.raw.guest) {
      const g = pick.raw.guest
      const hasName = (g.full_name ?? "").trim().length > 0
      const hasBio = (g.bio ?? "").trim().length > 0
      const hasFit = (g.why_fit ?? "").trim().length > 0
      const isStub = !hasName || !hasBio
      const placeholderName = "[يحتاج اقتراح ضيف]"
      const placeholderBio =
        "لم يقترح المولّد ضيفاً مفصّلاً لهذه الحلقة. " +
        "افتح صفحة المرشحين أو اكتشاف الضيوف لإضافة ملف فعلي."
      const placeholderFit =
        "لا توجد أسباب فِت مقترحة من المولّد بعد."

      guestRow = await createGuestCandidate({
        season_id,
        full_name: hasName ? g.full_name : placeholderName,
        display_name: g.display_name,
        bio: hasBio ? g.bio : placeholderBio,
        gender: g.gender,
        profession: g.profession,
        why_fit: hasFit ? g.why_fit : placeholderFit,
        category: g.category,
        country: g.country,
        city: g.city,
        public_links: [],
        social_accounts: g.social_accounts,
        official_website: g.official_website,
        evidence_summary: null,
        evidence_citations: [],
        relevance_score: g.relevance_score,
        depth_score: g.depth_score,
        reach_score: g.reach_score,
        // Mark stub rows so the UI can downrank them and the operator
        // sees "needs replacement" instead of treating the row as a
        // signed-off recommendation.
        risk_flags: isStub ? ["stub_needs_replacement"] : [],
      })
    }
    // Production-readiness fix sprint — persist the score + risk +
    // effort that the batch engine computed. These were previously
    // dropped on the floor; the UI rendered NULL and the wizard had no
    // ranking rationale.
    const ratio = (n: number) => Math.round(n * 100) / 100
    const rationale =
      `editorial ${ratio(pick.raw.editorial_score)}/10 · ` +
      `taste ${ratio(pick.taste_alignment)} · ` +
      `domain_load ${ratio(pick.domain_load)} · ` +
      `similarity ${ratio(pick.similarity_max)}`

    const topicRow = await createEpisodeCandidate({
      season_id,
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
      suggested_guest_candidate_id: guestRow?.id ?? null,
      // slot_index stays null — only set once the admin accepts and the
      // ordering stage (future) places it in the season.
      slot_index: null,
      risk_level: pick.raw.topic.risk_level ?? null,
      effort_level: pick.raw.topic.effort_level ?? null,
      composite_score: pick.final_score,
      composite_score_rationale: rationale,
    })
    const explainability = buildCardExplainability({
      scored: pick,
      taste,
      domain_performance:
        domain_performance.get(pick.raw.topic.topic_domain) ?? null,
      similarity_trigger_title: pick.similarity_trigger_title,
    })
    cards.push({
      topic_candidate: topicRow,
      guest_candidate: guestRow,
      editorial_score: pick.raw.editorial_score,
      taste_alignment: pick.taste_alignment,
      similarity_verdict: pick.similarity_verdict,
      similarity_max: pick.similarity_max,
      why_now: pick.raw.why_now,
      why_fit_you: buildTasteReasoning(pick.raw, taste),
      domain_reasoning: pick.raw.domain_reasoning,
      explainability,
    })
  }
  return cards
}

// ─── Decision + fingerprint composition ──────────────────────────────────────

export interface RecordDecisionAndFingerprintInput extends RecordDecisionInput {
  /** Title snapshot for the fingerprint. Required on accept/reject. */
  topic_title: string | null
  /** Optional summary — improves similarity precision. */
  topic_summary?: string | null
  /** Topic domain at time of decision (for domain-aware bucketing). */
  topic_domain?: import("@/types/khat-map").KhatMapTopicDomain | null
  /** Angle code when one exists — lets fingerprints answer "is this angle code hot?" */
  topic_angle_code?: string | null
  /**
   * Pre-computed embedding to skip the OpenAI call. Production paths
   * generally omit this (one embed per decision is cheap) but test and
   * bulk-migration paths can pass a vector they already have.
   */
  precomputed_embedding?: number[] | null
}

export interface RecordDecisionAndFingerprintResult {
  decision: KhatMapSeasonDecision
  fingerprint: KhatMapTopicFingerprint | null
}

/**
 * One shot: append the decision, then write a matching fingerprint if
 * the decision carries enough info (accept/reject on a pair/topic with
 * a title). Skip decisions don't produce fingerprints — they're
 * admin-intent markers, not signal.
 */
export async function recordDecisionAndFingerprint(
  input: RecordDecisionAndFingerprintInput,
): Promise<RecordDecisionAndFingerprintResult> {
  const decision = await recordDecision(input)

  // Skip + guest-only decisions produce no fingerprint. The learning
  // memory is topic-centric — a guest-only reject is a signal that
  // travels via the taste profile's rejected_patterns, not via
  // similarity.
  const shouldFingerprint =
    (decision.kind === "accept" || decision.kind === "reject") &&
    (decision.target === "pair" || decision.target === "topic") &&
    !!input.topic_title

  if (!shouldFingerprint) return { decision, fingerprint: null }

  const source = decision.kind === "accept" ? "accepted" : "rejected"
  const fingerprint = await writeFingerprint({
    season_id: decision.season_id,
    source,
    title_ar: input.topic_title!,
    summary_ar: input.topic_summary ?? null,
    angle_code: input.topic_angle_code ?? null,
    domain: input.topic_domain ?? null,
    topic_candidate_id: decision.topic_candidate_id,
    decision_id: decision.id,
    precomputed_embedding: input.precomputed_embedding ?? null,
  })
  return { decision, fingerprint }
}

/**
 * Inverse of the above: mark the decision undone AND delete every
 * fingerprint that was written against it, so the similarity filter
 * stops blocking future candidates. Returns the undone decision, or
 * null if the 10-second window has elapsed.
 */
export async function undoDecisionAndFingerprint(
  decision_id: string,
  opts: { window_ms?: number } = {},
): Promise<KhatMapSeasonDecision | null> {
  const undone = await undoDecision(decision_id, opts)
  if (!undone) return null
  await removeFingerprintsForDecision(decision_id)
  return undone
}
