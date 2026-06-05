/**
 * Phase Alpha — Editorial fit + hidden-gem scoring.
 *
 * Replaces the current `editorial_fit_score` path, which is a single
 * LLM call asked to return a number. That number turns out to be the
 * dominant axis of the composite (weight 0.45), so any LLM noise has
 * outsized impact. Alpha computes the fit deterministically from
 * structured signals, then asks the LLM only for prose explanation.
 *
 * The three axes:
 *
 *   editorial_fit
 *     • archetype_resonance — do the candidate's evidence snippets
 *       echo any of the archetype's target_signals?
 *     • topic_overlap       — when the run is episode-scoped, do the
 *       evidence snippets overlap with the episode's topic_domain
 *       and editorial intent vocabulary?
 *     • voice_distinction   — does evidence carry a personal point of
 *       view, an opinion, or a craft signature? (Penalises generic
 *       service / lifestyle channels.)
 *
 *   hidden_gem
 *     • audience_inverse    — high score for low YouTube subs / IG
 *       followers (same direction as current `hiddenness_score`).
 *     • discovery_difficulty — number of search queries required to
 *       surface this row. Hard-to-find candidates score higher.
 *     • non_obvious_field   — penalises candidates whose archetype
 *       maps to a saturated category (motivational speakers,
 *       general productivity coaches, finance gurus).
 *
 *   recommendation
 *     • = 0.45 * editorial_fit
 *     • + 0.20 * hidden_gem
 *     • + 0.20 * identity_confidence
 *     • + 0.15 * evidence_strength (carried from current ranker)
 *
 *   recommendation is what the operator card shows as the top number.
 *   It explicitly INCLUDES identity_confidence so a brand-shaped row
 *   with strong editorial fit can never out-rank a confirmed human
 *   with similar fit.
 */

import type {
  DiscoveryArchetype,
  DiscoveryEvidenceUrl,
  DiscoveryPlatformSignals,
} from "@/lib/db/schema/discovery"

export const FIT_VERSION = "alpha-fit-1" as const

const RECOMMENDATION_WEIGHTS = {
  editorial_fit: 0.45,
  hidden_gem: 0.20,
  identity_confidence: 0.20,
  evidence_strength: 0.15,
} as const

const SATURATED_ARCHETYPES = new Set<string>([
  "motivational_speaker",
  "general_productivity_coach",
  "finance_guru",
  "lifestyle_influencer",
  "fitness_influencer",
])

export interface EditorialFitInput {
  archetype: DiscoveryArchetype | null
  evidence_urls: DiscoveryEvidenceUrl[]
  platform_signals: DiscoveryPlatformSignals | null
  episode_topic_domain?: string | null
  episode_working_title?: string | null
  episode_intent_text?: string | null
  /** Composite identity confidence from person-classifier. */
  identity_confidence: number
  /**
   * Phase Beta — operator's hiddenness preference, propagated from
   * source_config.hiddenness_preference. Defaults to "balanced" when
   * omitted. Re-weights the hidden_gem axis inside editorial fit.
   */
  hiddenness_preference?: "famous" | "balanced" | "hidden_gems"
}

export interface EditorialFitResult {
  editorial_fit_score: number
  hidden_gem_score: number
  evidence_strength_score: number
  recommendation_score: number
  /**
   * Breakdown of each axis — surfaced on the operator card so the
   * "why this score" question has a deterministic answer.
   */
  breakdown: {
    archetype_resonance: number
    topic_overlap: number
    voice_distinction: number
    audience_inverse: number
    discovery_difficulty: number
    non_obvious_field: number
  }
  fit_version: string
}

export function computeEditorialFit(
  input: EditorialFitInput,
): EditorialFitResult {
  const evidence = input.evidence_urls ?? []
  const allText = evidence
    .map((e) => `${e.title ?? ""} ${e.snippet ?? ""}`)
    .join(" \n ")
    .toLowerCase()

  // ─── editorial_fit components ──────────────────────────────────
  const archetype_resonance = scoreArchetypeResonance(
    input.archetype,
    allText,
  )
  const topic_overlap = scoreTopicOverlap(
    allText,
    input.episode_topic_domain,
    input.episode_working_title,
    input.episode_intent_text,
  )
  const voice_distinction = scoreVoiceDistinction(allText, evidence.length)

  const editorial_fit = clamp01(
    0.45 * archetype_resonance +
      0.35 * topic_overlap +
      0.20 * voice_distinction,
  )

  // ─── hidden_gem components ─────────────────────────────────────
  const audience_inverse = scoreAudienceInverse(input.platform_signals)
  const discovery_difficulty = scoreDiscoveryDifficulty(input.platform_signals)
  const non_obvious_field = scoreNonObviousField(input.archetype)

  // Phase Beta — operator's hiddenness slider re-weights the
  // hidden_gem axis. "famous" deprioritises audience_inverse so
  // popular candidates can still score high on hidden_gem when they
  // have strong discovery_difficulty + non_obvious_field; "hidden_gems"
  // pushes audience_inverse to dominate so niche candidates win.
  const hp = input.hiddenness_preference ?? "balanced"
  const hiddenWeights =
    hp === "famous"
      ? { aud: 0.20, diff: 0.40, field: 0.40 }
      : hp === "hidden_gems"
        ? { aud: 0.75, diff: 0.15, field: 0.10 }
        : { aud: 0.55, diff: 0.25, field: 0.20 }
  const hidden_gem = clamp01(
    hiddenWeights.aud * audience_inverse +
      hiddenWeights.diff * discovery_difficulty +
      hiddenWeights.field * non_obvious_field,
  )

  // ─── evidence_strength (lifted from current ranker) ───────────
  const evidence_strength = computeEvidenceStrength(evidence)

  // ─── recommendation ────────────────────────────────────────────
  const recommendation =
    RECOMMENDATION_WEIGHTS.editorial_fit * editorial_fit +
    RECOMMENDATION_WEIGHTS.hidden_gem * hidden_gem +
    RECOMMENDATION_WEIGHTS.identity_confidence * clamp01(input.identity_confidence) +
    RECOMMENDATION_WEIGHTS.evidence_strength * evidence_strength

  return {
    editorial_fit_score: round3(editorial_fit),
    hidden_gem_score: round3(hidden_gem),
    evidence_strength_score: round3(evidence_strength),
    recommendation_score: round3(clamp01(recommendation)),
    breakdown: {
      archetype_resonance: round3(archetype_resonance),
      topic_overlap: round3(topic_overlap),
      voice_distinction: round3(voice_distinction),
      audience_inverse: round3(audience_inverse),
      discovery_difficulty: round3(discovery_difficulty),
      non_obvious_field: round3(non_obvious_field),
    },
    fit_version: FIT_VERSION,
  }
}

// ─── Component scorers ───────────────────────────────────────────────

function scoreArchetypeResonance(
  archetype: DiscoveryArchetype | null,
  text: string,
): number {
  if (!archetype || !text) return 0
  const signals = [
    ...(archetype.target_signals ?? []),
    ...(archetype.expected_traits ?? []),
  ]
    .filter((s) => s && s.length >= 3)
    .map((s) => s.toLowerCase())
  if (signals.length === 0) return 0
  let hits = 0
  for (const s of signals) if (text.includes(s)) hits++
  return Math.min(1, hits / Math.max(3, signals.length))
}

function scoreTopicOverlap(
  text: string,
  topicDomain: string | null | undefined,
  workingTitle: string | null | undefined,
  intentText: string | null | undefined,
): number {
  if (!text) return 0
  const vocab: string[] = []
  if (topicDomain) vocab.push(topicDomain.toLowerCase())
  if (workingTitle) {
    for (const t of tokenize(workingTitle)) if (t.length >= 3) vocab.push(t)
  }
  if (intentText) {
    for (const t of tokenize(intentText)) if (t.length >= 4) vocab.push(t)
  }
  if (vocab.length === 0) return 0.5 // neutral when no episode context
  let hits = 0
  const seen = new Set<string>()
  for (const v of vocab) {
    if (seen.has(v)) continue
    seen.add(v)
    if (text.includes(v)) hits++
  }
  return Math.min(1, hits / Math.max(4, seen.size))
}

// Penalises generic / impersonal channels.
function scoreVoiceDistinction(text: string, evidenceCount: number): number {
  if (!text || evidenceCount === 0) return 0.4
  // Personal-voice cues
  let plus = 0
  if (/(my journey|أنا|تجربتي|رأيي|i believe|in my opinion)/iu.test(text)) plus += 0.4
  if (/(unpopular|provocative|controversial|جدلي|مثير للجدل)/iu.test(text)) plus += 0.3
  if (/(craft|method|approach|نهج|أسلوب|طريقة)/iu.test(text)) plus += 0.2
  // Generic-channel cues
  let minus = 0
  if (/(tips|tricks|hacks|productivity hacks|نصائح|حيل)/iu.test(text)) minus += 0.2
  if (/(motivation(al)?|تحفيز|مذكرات الصباح)/iu.test(text)) minus += 0.2
  if (/(daily devotion|الورد اليومي|اقتباس اليوم)/iu.test(text)) minus += 0.2
  return clamp01(0.4 + plus - minus)
}

function scoreAudienceInverse(s: DiscoveryPlatformSignals | null): number {
  if (!s) return 0.5
  const yt = s.youtube?.subscribers ?? null
  const x = s.x?.followers ?? null
  const ig = s.instagram?.followers ?? null
  const known = [yt, x, ig].filter(
    (n): n is number => typeof n === "number" && n >= 0,
  )
  if (known.length === 0) return 0.7
  const peak = Math.max(...known)
  if (peak >= 500_000) return 0
  if (peak >= 100_000) return 0.2
  if (peak >= 30_000) return 0.5
  if (peak >= 5_000) return 0.8
  return 0.95
}

// Approximated by counting search queries that surfaced this row.
// Currently every row carries `query` in google_web platform_signals;
// fallback is 0.5 when unknown.
function scoreDiscoveryDifficulty(
  s: DiscoveryPlatformSignals | null,
): number {
  if (!s) return 0.5
  const gw = (s as Record<string, unknown>).google_web as
    | { query?: string }
    | undefined
  if (!gw?.query) return 0.5
  const q = gw.query
  // Longer / more specific queries → harder to find → higher score.
  if (q.length >= 60) return 0.9
  if (q.length >= 40) return 0.7
  if (q.length >= 25) return 0.5
  return 0.3
}

function scoreNonObviousField(archetype: DiscoveryArchetype | null): number {
  if (!archetype) return 0.5
  if (SATURATED_ARCHETYPES.has(archetype.id)) return 0.2
  return 0.7
}

function computeEvidenceStrength(urls: DiscoveryEvidenceUrl[]): number {
  if (urls.length === 0) return 0
  const platforms = new Set(urls.map((u) => u.platform))
  const withSnippet = urls.filter((u) => u.snippet || u.title).length
  if (platforms.size >= 3 && withSnippet >= 3) return 1.0
  if (platforms.size >= 2) return 0.6
  return withSnippet > 0 ? 0.4 : 0.2
}

// ─── Helpers ─────────────────────────────────────────────────────────

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[.,;:!؟،؛"'«»“”‘’()\[\]{}\-—–_/\\]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
