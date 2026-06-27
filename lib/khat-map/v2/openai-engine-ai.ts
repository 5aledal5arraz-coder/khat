/**
 * Real (AI-Router-backed) implementation of `EngineAI`.
 *
 * Every LLM call goes through `runAiTask` so season generation gets the
 * same telemetry (ai_runs), rate limiting, and cost accounting as the
 * rest of the platform:
 *   - taskKind "structural" (gpt-4o-mini) for batch candidate generation
 *     (structural/diversity task, fast + cheap at oversample volume)
 *   - taskKind "editorial" (gpt-4o) for guest analysis + guest-anchored
 *     angle generation (deep editorial judgment — one guest gets the
 *     full model)
 *   - text-embedding-3-small for all similarity work (delegated to
 *     lib/khat-map/learning/embeddings.embed)
 *
 * Tests swap this whole module out via dependency injection — the
 * batch engine never imports it directly; it takes an `EngineAI` arg.
 */

import { runAiTask } from "@/lib/ai-router"
import { embed } from "@/lib/khat-map/learning/embeddings"
import {
  buildBatchSystemPrompt,
  buildBatchUserPrompt,
  buildGuestAnalyzeSystemPrompt,
  buildGuestAnalyzeUserPrompt,
  buildGuestAnchoredSystemPrompt,
  buildGuestAnchoredUserPrompt,
} from "./prompts"
import {
  buildAudienceFirstSystemPrompt,
  buildAudienceFirstUserPrompt,
} from "./prompts-audience"
import {
  buildEditorialSystemPrompt,
  buildEditorialUserPrompt,
} from "./prompts-editorial"
import { buildCourtSystemPrompt, buildCourtUserPrompt } from "./prompts-court"
import { clampCategory } from "./categories"
import { clampAudienceFit } from "./regional-fit"
import { clampSuccessDimensions } from "./success-score"
import type {
  CandidateGenInput,
  CourtInput,
  CourtVerdict,
  EngineAI,
  GuestAnalyzeInput,
  GuestAnchoredTopicsInput,
  GuestProfile,
  RawCandidate,
} from "./types"

async function generateCandidates(
  input: CandidateGenInput,
): Promise<RawCandidate[]> {
  // Three generation modes, most-capable first:
  //   editorial      → the world-class editorial engine (knowledge universe +
  //                    lenses + headline craft + 14 success dims). Phase A default.
  //   audience_first → the GCC editorial board ranking by Regional Audience Fit.
  //   legacy         → the original combined topic+guest prompt (Phase B).
  // editorial wins when set; the model runs on the editorial (gpt-4o) tier since
  // the richer reasoning + scoring justifies the stronger model.
  const editorial = !!input.editorial
  const audienceFirst = !editorial && !!input.audience_first
  const promptVersion = editorial
    ? "khat-map-editorial-v1"
    : audienceFirst
      ? "khat-map-audience-first-v1"
      : "khat-map-batch-v2"
  const prompt = editorial
    ? [
        { role: "system" as const, content: buildEditorialSystemPrompt(input) },
        { role: "user" as const, content: buildEditorialUserPrompt(input) },
      ]
    : audienceFirst
      ? [
          { role: "system" as const, content: buildAudienceFirstSystemPrompt(input) },
          { role: "user" as const, content: buildAudienceFirstUserPrompt(input) },
        ]
      : [
          { role: "system" as const, content: buildBatchSystemPrompt(input) },
          { role: "user" as const, content: buildBatchUserPrompt(input) },
        ]
  const r = await runAiTask<{ candidates?: unknown } | unknown[]>({
    taskKind: editorial ? "editorial" : "structural",
    seasonId: input.season_id,
    subjectTable: "khat_map_seasons",
    subjectId: input.season_id,
    promptVersion,
    input: {
      season_id: input.season_id,
      target_count: input.target_count,
      season_target: input.season_target,
      rejected_count: input.rejected_titles.length,
      mode: editorial ? "editorial" : audienceFirst ? "audience_first" : "legacy",
    },
    prompt,
    expectJson: true,
    providerOptions: { temperature: editorial ? 0.85 : 0.8 },
  })
  if (r.status !== "succeeded" || r.parsed == null) {
    throw new Error(r.errorMessage ?? "batch-candidates: generation failed")
  }
  // The json_object contract forces an object at the top level. Our
  // prompt asks for an array, so we accept either the bare array (if the
  // model complies with the spirit) or a `{candidates: []}` wrapper (if
  // it wraps to satisfy the JSON-object requirement).
  const list = coerceCandidateList(r.parsed)
  if (!Array.isArray(list)) {
    throw new Error("batch-candidates: expected an array at the top level")
  }
  return list
    .map(normalizeRawCandidate)
    .filter((c): c is RawCandidate => c !== null)
}

async function analyzeGuest(input: GuestAnalyzeInput): Promise<GuestProfile> {
  const r = await runAiTask<GuestProfile>({
    taskKind: "editorial",
    promptVersion: "khat-map-guest-analyze-v2",
    input: { full_name: input.full_name, has_bio: Boolean(input.bio) },
    prompt: [
      { role: "system", content: buildGuestAnalyzeSystemPrompt() },
      { role: "user", content: buildGuestAnalyzeUserPrompt(input) },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.4 },
  })
  if (r.status !== "succeeded" || r.parsed == null) {
    throw new Error(r.errorMessage ?? "guest-analyze: generation failed")
  }
  return normalizeGuestProfile(r.parsed, input)
}

async function generateGuestAnchoredTopics(
  input: GuestAnchoredTopicsInput,
): Promise<RawCandidate[]> {
  const r = await runAiTask<{ candidates?: unknown } | unknown[]>({
    taskKind: "editorial",
    promptVersion: "khat-map-guest-anchored-v2",
    input: {
      guest: input.guest_profile.full_name,
      angle_count: input.angle_count,
      rejected_count: input.rejected_titles.length,
    },
    prompt: [
      { role: "system", content: buildGuestAnchoredSystemPrompt(input) },
      { role: "user", content: buildGuestAnchoredUserPrompt(input) },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.7 },
  })
  if (r.status !== "succeeded" || r.parsed == null) {
    throw new Error(r.errorMessage ?? "guest-anchored: generation failed")
  }
  const list = coerceCandidateList(r.parsed)
  if (!Array.isArray(list)) {
    throw new Error("guest-anchored: expected an array at the top level")
  }
  return list
    .map(normalizeRawCandidate)
    .filter((c): c is RawCandidate => c !== null)
}

export const openaiEngineAI: EngineAI = {
  generateCandidates,
  analyzeGuest,
  generateGuestAnchoredTopics,
  critiqueCandidates,
  embed,
}

// ─── Defensive normalizers ───────────────────────────────────────────────────
//
// The LLM can drop keys, flip types, or emit near-miss values. Rather than
// fail the whole batch on one bad candidate, we coerce/clean at the boundary
// and skip rows that can't be salvaged. Matches the policy already used by
// the v1 structure.ts normalizer.

/**
 * The json_object contract forces an object at the top level, but our prompts
 * ask for an array. Accept the bare array, a `{candidates: [...]}` wrapper, or —
 * since the richer contract makes the model pick its own wrapper key
 * ("topics"/"episodes"/"ideas"/…) — the first array-valued property found.
 */
function coerceCandidateList(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed
  if (!parsed || typeof parsed !== "object") return null
  const o = parsed as Record<string, unknown>
  if (Array.isArray(o.candidates)) return o.candidates
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) return v
  }
  return null
}

function normalizeRawCandidate(v: unknown): RawCandidate | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const topic = o.topic as Record<string, unknown> | undefined
  if (!topic || typeof topic !== "object") return null
  const working_title = asString(topic.working_title).trim()
  if (!working_title) return null

  const guestRaw = (o.guest ?? null) as Record<string, unknown> | null
  const guest = guestRaw && typeof guestRaw === "object"
    ? {
        full_name: asString(guestRaw.full_name).trim(),
        display_name: asOptionalString(guestRaw.display_name),
        bio: asString(guestRaw.bio),
        gender: normalizeGender(guestRaw.gender),
        profession: asOptionalString(guestRaw.profession),
        why_fit: asString(guestRaw.why_fit),
        category: asOptionalString(guestRaw.category),
        country: asOptionalString(guestRaw.country),
        city: asOptionalString(guestRaw.city),
        social_accounts: normalizeSocials(guestRaw.social_accounts),
        official_website: asOptionalString(guestRaw.official_website),
        relevance_score: asOptionalNumber(guestRaw.relevance_score),
        depth_score: asOptionalNumber(guestRaw.depth_score),
        reach_score: asOptionalNumber(guestRaw.reach_score),
      }
    : null
  // If guest exists but has no name, drop the guest but keep the topic.
  const safeGuest = guest && guest.full_name ? guest : null

  return {
    topic: {
      working_title,
      hook: asString(topic.hook),
      why_matters: asString(topic.why_matters),
      why_now: asString(topic.why_now),
      goal: asString(topic.goal),
      description: asString(topic.description),
      episode_type:
        clampEpisodeType(asOptionalString(topic.episode_type)) ?? "signature_khat",
      topic_domain:
        clampTopicDomain(asOptionalString(topic.topic_domain)) ?? "none",
      topic_angle_code: asOptionalString(topic.topic_angle_code),
      main_axes: asStringArray(topic.main_axes),
      suggested_questions: asStringArray(topic.suggested_questions),
      risk_level:
        (asOptionalString(topic.risk_level) as
          | RawCandidate["topic"]["risk_level"]
          | null) ?? null,
      effort_level:
        (asOptionalString(topic.effort_level) as
          | RawCandidate["topic"]["effort_level"]
          | null) ?? null,
      sponsor_appeal:
        (asOptionalString(topic.sponsor_appeal) as
          | RawCandidate["topic"]["sponsor_appeal"]
          | null) ?? null,
      // Audience-first fields. `category` is a diversity label; `audience_fit`
      // holds the nine Regional Audience Fit factors used for ranking.
      category: clampCategory(asOptionalString(topic.category)),
      audience_fit: clampAudienceFit(topic.audience_fit),
      regional_note: asOptionalString(topic.regional_note),
      viral_angle: asOptionalString(topic.viral_angle),
      debate_axis: asOptionalString(topic.debate_axis),
      // ─── Editorial engine fields (raw; clamped where consumed) ──────────────
      subcategory: asOptionalString(topic.subcategory),
      lenses: asStringArray(topic.lenses),
      global_note: asOptionalString(topic.global_note),
      why_this_topic: asOptionalString(topic.why_this_topic),
      titles: topic.titles ?? null,
      success: topic.success ?? null,
      guest_idea: asOptionalString(topic.guest_idea),
    },
    guest: safeGuest,
    editorial_score: clamp(asNumber(o.editorial_score, 5), 0, 10),
    why_now: asString(o.why_now || topic.why_now),
    domain_reasoning: asOptionalString(o.domain_reasoning),
  }
}

// ─── Editorial Court ──────────────────────────────────────────────────────────

async function critiqueCandidates(input: CourtInput): Promise<CourtVerdict[]> {
  const r = await runAiTask<{ verdicts?: unknown } | unknown[]>({
    taskKind: "editorial",
    seasonId: input.season_id,
    subjectTable: "khat_map_seasons",
    subjectId: input.season_id,
    promptVersion: "khat-map-court-v1",
    input: { season_id: input.season_id, count: input.candidates.length, threshold: input.threshold },
    prompt: [
      { role: "system", content: buildCourtSystemPrompt(input.threshold) },
      { role: "user", content: buildCourtUserPrompt(input) },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.3 },
  })
  if (r.status !== "succeeded" || r.parsed == null) {
    throw new Error(r.errorMessage ?? "court: critique failed")
  }
  const list = coerceCandidateList(r.parsed)
  if (!Array.isArray(list)) throw new Error("court: expected an array at the top level")
  return list
    .map(normalizeCourtVerdict)
    .filter((v): v is CourtVerdict => v !== null)
}

function normalizeCourtVerdict(v: unknown): CourtVerdict | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const index = asOptionalNumber(o.index)
  if (index === null) return null
  const verdictRaw = asString(o.verdict).trim().toLowerCase()
  const verdict: CourtVerdict["verdict"] =
    verdictRaw === "accept" || verdictRaw === "reject" ? verdictRaw : "revise"
  return {
    index: Math.round(index),
    verdict,
    success: clampSuccessDimensions(o.success),
    why_succeed: asOptionalString(o.why_succeed),
    why_fail: asOptionalString(o.why_fail),
    is_overdone: o.is_overdone === true,
    reference_potential: o.reference_potential === true,
    clip_potential: o.clip_potential === true,
    recommended_title: asOptionalString(o.recommended_title),
    recommended_reason: asOptionalString(o.recommended_reason),
  }
}

function normalizeGuestProfile(
  raw: GuestProfile,
  input: GuestAnalyzeInput,
): GuestProfile {
  // Socials must match what the admin typed — the LLM is never allowed
  // to introduce new ones. Merge admin socials over LLM's, with LLM's
  // only acting as fallback if admin left that key empty. Official
  // website: prefer admin-supplied; never let the LLM fabricate.
  const adminSocials = input.social_accounts ?? {}
  const merged = { ...raw.social_accounts, ...adminSocials }
  const clean: GuestProfile["social_accounts"] = {}
  for (const [k, v] of Object.entries(merged)) {
    if (k === "other" || typeof v !== "string") continue
    const trimmed = v.trim()
    if (trimmed) clean[k as keyof typeof clean] = trimmed as never
  }
  return {
    full_name: raw.full_name || input.full_name,
    display_name: raw.display_name ?? null,
    inferred_bio: raw.inferred_bio ?? "",
    profession: raw.profession ?? null,
    gender: normalizeGender(raw.gender),
    country: raw.country ?? null,
    city: raw.city ?? null,
    expertise_domains: Array.isArray(raw.expertise_domains)
      ? (raw.expertise_domains.filter(
          (d) => typeof d === "string",
        ) as GuestProfile["expertise_domains"])
      : [],
    editorial_angle: raw.editorial_angle ?? "",
    confidence: clamp(Number(raw.confidence ?? 0.5), 0, 1),
    social_accounts: clean,
    official_website: input.official_website ?? raw.official_website ?? null,
  }
}

function normalizeGender(v: unknown): GuestProfile["gender"] {
  const s = typeof v === "string" ? v.trim().toLowerCase() : ""
  return s === "male" || s === "female" ? s : "unknown"
}

function normalizeSocials(v: unknown): RawCandidate extends never
  ? never
  : NonNullable<RawCandidate["guest"]>["social_accounts"] {
  if (!v || typeof v !== "object") return {}
  const o = v as Record<string, unknown>
  const keys: Array<keyof NonNullable<RawCandidate["guest"]>["social_accounts"]> =
    [
      "twitter",
      "instagram",
      "youtube",
      "linkedin",
      "tiktok",
      "facebook",
      "snapchat",
      "website",
    ]
  const out: Record<string, string> = {}
  for (const k of keys) {
    const v = o[k as string]
    if (typeof v === "string" && v.trim()) out[k as string] = v.trim()
  }
  return out as never
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}
function asOptionalString(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t : null
}
function asNumber(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
function asOptionalNumber(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// ─── Enum clamps ──────────────────────────────────────────────────────
//
// The model occasionally returns a `topic_domain` value (e.g.
// "technology_ai") in `episode_type`, or a freeform string. The DB
// CHECK constraint then rejects the insert. Snap the value to the
// allowed enum here; `null` falls through to the caller's default.

const VALID_EPISODE_TYPES = new Set<RawCandidate["topic"]["episode_type"]>([
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
const VALID_TOPIC_DOMAINS = new Set<RawCandidate["topic"]["topic_domain"]>([
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

function clampEpisodeType(
  v: string | null,
): RawCandidate["topic"]["episode_type"] | null {
  if (!v) return null
  const t = v.trim().toLowerCase() as RawCandidate["topic"]["episode_type"]
  return VALID_EPISODE_TYPES.has(t) ? t : null
}
function clampTopicDomain(
  v: string | null,
): RawCandidate["topic"]["topic_domain"] | null {
  if (!v) return null
  const t = v.trim().toLowerCase() as RawCandidate["topic"]["topic_domain"]
  return VALID_TOPIC_DOMAINS.has(t) ? t : null
}
