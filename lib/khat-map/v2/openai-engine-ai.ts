/**
 * Real (OpenAI-backed) implementation of `EngineAI`.
 *
 * Thin layer over the existing lib/ai/client.ts primitives:
 *   - STRUCTURE_MODEL (gpt-4o-mini) for batch candidate generation
 *     (structural/diversity task, fast + cheap at oversample volume)
 *   - EDITORIAL_MODEL (gpt-4o) for guest analysis + guest-anchored
 *     angle generation (deep editorial judgment — one guest gets the
 *     full model)
 *   - text-embedding-3-small for all similarity work (delegated to
 *     lib/khat-map/learning/embeddings.embed)
 *
 * Tests swap this whole module out via dependency injection — the
 * batch engine never imports it directly; it takes an `EngineAI` arg.
 */

import {
  getClient,
  STRUCTURE_MODEL,
  EDITORIAL_MODEL,
  safeParseJSON,
} from "@/lib/ai/client"
import { embed } from "@/lib/khat-map/learning/embeddings"
import {
  buildBatchSystemPrompt,
  buildBatchUserPrompt,
  buildGuestAnalyzeSystemPrompt,
  buildGuestAnalyzeUserPrompt,
  buildGuestAnchoredSystemPrompt,
  buildGuestAnchoredUserPrompt,
} from "./prompts"
import type {
  CandidateGenInput,
  EngineAI,
  GuestAnalyzeInput,
  GuestAnchoredTopicsInput,
  GuestProfile,
  RawCandidate,
} from "./types"

async function generateCandidates(
  input: CandidateGenInput,
): Promise<RawCandidate[]> {
  const client = getClient()
  const res = await client.chat.completions.create({
    model: STRUCTURE_MODEL,
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildBatchSystemPrompt(input) },
      { role: "user", content: buildBatchUserPrompt(input) },
    ],
  })
  const parsed = safeParseJSON<{ candidates?: unknown } | unknown[]>(
    res.choices[0]?.message?.content ?? null,
    "batch-candidates",
  )
  if (!parsed.success) throw new Error(parsed.error)
  // The response_format=json_object contract forces an object at the top
  // level. Our prompt asks for an array, so we accept either the bare
  // array (if the model complies with the spirit) or a `{candidates: []}`
  // wrapper (if it wraps to satisfy the JSON-object requirement).
  const list = Array.isArray(parsed.data)
    ? parsed.data
    : (parsed.data as { candidates?: unknown }).candidates
  if (!Array.isArray(list)) {
    throw new Error("batch-candidates: expected an array at the top level")
  }
  return list
    .map(normalizeRawCandidate)
    .filter((c): c is RawCandidate => c !== null)
}

async function analyzeGuest(input: GuestAnalyzeInput): Promise<GuestProfile> {
  const client = getClient()
  const res = await client.chat.completions.create({
    model: EDITORIAL_MODEL,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildGuestAnalyzeSystemPrompt() },
      { role: "user", content: buildGuestAnalyzeUserPrompt(input) },
    ],
  })
  const parsed = safeParseJSON<GuestProfile>(
    res.choices[0]?.message?.content ?? null,
    "guest-analyze",
  )
  if (!parsed.success) throw new Error(parsed.error)
  return normalizeGuestProfile(parsed.data, input)
}

async function generateGuestAnchoredTopics(
  input: GuestAnchoredTopicsInput,
): Promise<RawCandidate[]> {
  const client = getClient()
  const res = await client.chat.completions.create({
    model: EDITORIAL_MODEL,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildGuestAnchoredSystemPrompt(input) },
      { role: "user", content: buildGuestAnchoredUserPrompt(input) },
    ],
  })
  const parsed = safeParseJSON<{ candidates?: unknown } | unknown[]>(
    res.choices[0]?.message?.content ?? null,
    "guest-anchored",
  )
  if (!parsed.success) throw new Error(parsed.error)
  const list = Array.isArray(parsed.data)
    ? parsed.data
    : (parsed.data as { candidates?: unknown }).candidates
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
  embed,
}

// ─── Defensive normalizers ───────────────────────────────────────────────────
//
// The LLM can drop keys, flip types, or emit near-miss values. Rather than
// fail the whole batch on one bad candidate, we coerce/clean at the boundary
// and skip rows that can't be salvaged. Matches the policy already used by
// the v1 structure.ts normalizer.

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
    },
    guest: safeGuest,
    editorial_score: clamp(asNumber(o.editorial_score, 5), 0, 10),
    why_now: asString(o.why_now || topic.why_now),
    domain_reasoning: asOptionalString(o.domain_reasoning),
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
