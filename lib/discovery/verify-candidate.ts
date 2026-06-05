/**
 * Khat Brain Phase 5 — candidate verification.
 *
 * Takes a raw discovery candidate (proposed name + evidence URLs +
 * archetype) and produces editorial intelligence:
 *   - why_they_matter
 *   - topics they speak about
 *   - notable quotes seen in evidence
 *   - red flags
 *   - story arcs / events / topics for ranking
 *
 * Uses task_kind=verification (defaults to gpt-4o-mini per registry —
 * cheap; we're scanning evidence text, not generating prose).
 */

import { runAiTask } from "@/lib/ai-router"
import { buildDiscoveryVerifyPrompt } from "@/lib/ai/prompts/discovery-verify"
import type {
  DiscoveryArchetype,
  DiscoveryEvidenceSummary,
  DiscoveryEvidenceUrl,
  DiscoverySocialLinks,
  DiscoveryStorySignals,
} from "./types"

export interface VerifyCandidateInput {
  proposed_name?: string | null
  proposed_role?: string | null
  proposed_country?: string | null
  archetype: DiscoveryArchetype
  evidence_urls: DiscoveryEvidenceUrl[]
  /** Optional EIR / subject for telemetry. */
  subjectId?: string | null
  /**
   * Phase B redesign — strict guest filters inherited from the season.
   * When supplied, the verifier asks the model to infer gender +
   * nationality from evidence, and the result is post-filtered: any
   * candidate whose inferred attribute violates the filter (or cannot
   * be determined under a strict filter) is marked as rejected with a
   * `filter_mismatch` reason so the candidate row gets dropped before
   * ranking.
   */
  filters?: {
    gender?: "male" | "female"
    nationality?: "kuwaiti" | "non_kuwaiti"
  }
  /**
   * Phase B redesign — episode topic context. When supplied, the
   * verifier produces `topic_fit_rationale` + `topic_fit_score` against
   * this specific episode. Omitted for legacy / season-wide runs.
   */
  episodeContext?: {
    workingTitle: string
    topicDomain?: string | null
  }
}

export interface VerifyCandidateResult {
  ok: boolean
  evidence_summary: DiscoveryEvidenceSummary | null
  story_signals: DiscoveryStorySignals | null
  /**
   * AI's confidence (0..1) that this person fits Khat's editorial brief.
   * Used as the editorial_fit_score baseline by the ranker.
   */
  editorial_fit_score: number | null
  /**
   * Phase B redesign — Arabic rationales + structured social links the
   * candidate card surfaces directly. `topic_fit_rationale` and
   * `topic_fit_score` are null when the run had no episode context.
   */
  general_rationale: string | null
  topic_fit_rationale: string | null
  topic_fit_score: number | null
  social_links: DiscoverySocialLinks | null
  /**
   * Phase B redesign — strict filter outcome. When the candidate fails
   * the season's gender/nationality filter, this is populated with the
   * specific reason; the caller flips the candidate's status to
   * `rejected` and skips ranking.
   */
  filter_mismatch: {
    axis: "gender" | "nationality"
    expected: string
    detected: string | null
  } | null
  runId: string | null
  errorMessage: string | null
}

export async function verifyCandidate(
  input: VerifyCandidateInput,
): Promise<VerifyCandidateResult> {
  const { system, user, version } = buildDiscoveryVerifyPrompt({
    archetype: input.archetype,
    proposedName: input.proposed_name,
    proposedRole: input.proposed_role,
    proposedCountry: input.proposed_country,
    evidenceUrls: input.evidence_urls,
    filters: input.filters,
    episodeContext: input.episodeContext,
  })

  const result = await runAiTask<{
    evidence_summary?: DiscoveryEvidenceSummary
    story_signals?: DiscoveryStorySignals
    editorial_fit_score?: number
    inferred_gender?: "male" | "female" | "unknown"
    inferred_nationality?: "kuwaiti" | "non_kuwaiti" | "unknown"
    general_rationale?: string | null
    topic_fit_rationale?: string | null
    topic_fit_score?: number
    social_links?: DiscoverySocialLinks
  }>({
    taskKind: "verification",
    subjectTable: "guest_discovery_candidates",
    subjectId: input.subjectId ?? null,
    promptVersion: version,
    input: {
      archetype: input.archetype.id,
      proposed_name: input.proposed_name ?? null,
      evidenceCount: input.evidence_urls.length,
    },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.2 },
  })

  if (result.status !== "succeeded") {
    return {
      ok: false,
      evidence_summary: null,
      story_signals: null,
      editorial_fit_score: null,
      general_rationale: null,
      topic_fit_rationale: null,
      topic_fit_score: null,
      social_links: null,
      filter_mismatch: null,
      runId: result.runId,
      errorMessage: result.errorMessage,
    }
  }

  const p = result.parsed ?? {}
  const score = clamp01(typeof p.editorial_fit_score === "number" ? p.editorial_fit_score : null)
  const topicFitScore = clamp01(
    typeof p.topic_fit_score === "number" ? p.topic_fit_score : null,
  )

  // Phase B redesign — enforce the season's strict guest filters
  // post-verification. Strict-on-unknown: if the model can't determine
  // the attribute and the filter is set, reject the candidate.
  const filter_mismatch = input.filters
    ? checkFilterMismatch(
        input.filters,
        p.inferred_gender ?? null,
        p.inferred_nationality ?? null,
      )
    : null

  return {
    ok: true,
    evidence_summary: p.evidence_summary ?? null,
    story_signals: p.story_signals ?? null,
    editorial_fit_score: score,
    general_rationale:
      typeof p.general_rationale === "string" && p.general_rationale.trim()
        ? p.general_rationale.trim()
        : null,
    topic_fit_rationale:
      typeof p.topic_fit_rationale === "string" && p.topic_fit_rationale.trim()
        ? p.topic_fit_rationale.trim()
        : null,
    topic_fit_score: topicFitScore,
    social_links: sanitizeSocialLinks(p.social_links ?? null),
    filter_mismatch,
    runId: result.runId,
    errorMessage: null,
  }
}

/**
 * Phase B redesign — strip any non-URL values and any keys not in the
 * `DiscoverySocialLinks` shape so a noncompliant model can't slip raw
 * search results into the curated social block.
 */
function sanitizeSocialLinks(
  raw: DiscoverySocialLinks | null,
): DiscoverySocialLinks | null {
  if (!raw || typeof raw !== "object") return null
  const allowed: Array<keyof DiscoverySocialLinks> = [
    "youtube_channel",
    "twitter",
    "instagram",
    "linkedin",
    "tiktok",
    "facebook",
    "snapchat",
    "website",
  ]
  const out: DiscoverySocialLinks = {}
  let any = false
  for (const key of allowed) {
    const v = (raw as Record<string, unknown>)[key]
    if (typeof v !== "string") continue
    const trimmed = v.trim()
    if (!trimmed) continue
    if (!/^https?:\/\//i.test(trimmed)) continue
    out[key] = trimmed
    any = true
  }
  return any ? out : null
}

function checkFilterMismatch(
  filters: NonNullable<VerifyCandidateInput["filters"]>,
  detectedGender: "male" | "female" | "unknown" | null,
  detectedNationality: "kuwaiti" | "non_kuwaiti" | "unknown" | null,
): VerifyCandidateResult["filter_mismatch"] {
  if (filters.gender) {
    if (!detectedGender || detectedGender === "unknown") {
      return {
        axis: "gender",
        expected: filters.gender,
        detected: detectedGender,
      }
    }
    if (detectedGender !== filters.gender) {
      return {
        axis: "gender",
        expected: filters.gender,
        detected: detectedGender,
      }
    }
  }
  if (filters.nationality) {
    if (!detectedNationality || detectedNationality === "unknown") {
      return {
        axis: "nationality",
        expected: filters.nationality,
        detected: detectedNationality,
      }
    }
    if (detectedNationality !== filters.nationality) {
      return {
        axis: "nationality",
        expected: filters.nationality,
        detected: detectedNationality,
      }
    }
  }
  return null
}

function clamp01(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null
  return Math.max(0, Math.min(1, v))
}
