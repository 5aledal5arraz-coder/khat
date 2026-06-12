/**
 * Gemini channel fingerprint generator.
 *
 * Takes the deterministic corpus built by `collector.ts`, pairs it with
 * the Khat editorial constitution, and asks Gemini to produce a
 * structured fingerprint.
 *
 * Hardening (matches the season-research pipeline):
 *   1. Uses `geminiJsonHardened()` with its 4-stage recovery ladder
 *      (strict → sanitize → largest-block-extract → model-repair).
 *   2. A TOLERANT normalizer runs before the validator: missing fields
 *      default to empty, wrong-typed fields get coerced or dropped, so
 *      the admin still gets a usable fingerprint even when Gemini omits
 *      one or two DNA sub-lists.
 *   3. The validator is strict only on what truly matters — a non-empty
 *      identity_summary + a dna object containing identity_summary.
 *      Every other field is optional and normalized to safe defaults.
 *   4. On failure, a minimal-retry pass fires with a tighter prompt
 *      asking for fewer DNA sub-fields and half the output budget.
 *   5. Rich diagnostics (raw_text, stages_attempted, retry outcome) are
 *      attached to the thrown error so the orchestrator can persist +
 *      surface them in the UI.
 */

import { isGeminiConfigured } from "@/lib/ai/gemini"
import {
  geminiJsonHardened,
  type HardenedDiagnostics,
  type HardenedJsonResult,
} from "@/lib/khat-map/core/gemini-json-hardened"
import { khatConstitutionPrompt } from "@/lib/khat-map/core/constitution"
import type { KhatMapKhatDna } from "@/types/khat-map"
import type { ChannelSignals } from "./collector"
import { buildChannelCorpus } from "./collector"

export const CHANNEL_ANALYSIS_MODEL =
  process.env.KHAT_MAP_ANALYSIS_MODEL || "gemini-2.5-flash"

// ─── Output shape ────────────────────────────────────────────────────────────

export interface FingerprintAnalysisOutput {
  dna: KhatMapKhatDna
  strongest_emotional_topics: string[]
  most_successful_episodes: Array<{
    title: string
    youtube_id?: string
    view_count?: number
    why_successful?: string
  }>
  most_successful_guests: Array<{
    name: string
    episode_title?: string
    view_count?: number
    why_successful?: string
  }>
  identity_summary: string
  analysis_notes: string
}

// ─── Tolerant normalizer + loose validator ──────────────────────────────────

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
}

function asNumberOrUndefined(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function normalizeEpisodeEntries(
  v: unknown,
): FingerprintAnalysisOutput["most_successful_episodes"] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => {
      const title = asString(x.title).trim()
      if (!title) return null
      const entry: FingerprintAnalysisOutput["most_successful_episodes"][number] = {
        title,
      }
      const ytId = asString(x.youtube_id).trim()
      if (ytId) entry.youtube_id = ytId
      const vc = asNumberOrUndefined(x.view_count)
      if (vc !== undefined) entry.view_count = vc
      const why = asString(x.why_successful).trim()
      if (why) entry.why_successful = why
      return entry
    })
    .filter(
      (e): e is FingerprintAnalysisOutput["most_successful_episodes"][number] =>
        e !== null,
    )
}

function normalizeGuestEntries(
  v: unknown,
): FingerprintAnalysisOutput["most_successful_guests"] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => {
      const name = asString(x.name).trim()
      if (!name) return null
      const entry: FingerprintAnalysisOutput["most_successful_guests"][number] = {
        name,
      }
      const ep = asString(x.episode_title).trim()
      if (ep) entry.episode_title = ep
      const vc = asNumberOrUndefined(x.view_count)
      if (vc !== undefined) entry.view_count = vc
      const why = asString(x.why_successful).trim()
      if (why) entry.why_successful = why
      return entry
    })
    .filter(
      (e): e is FingerprintAnalysisOutput["most_successful_guests"][number] =>
        e !== null,
    )
}

/**
 * Normalizer run before validation. Fills every DNA sub-list with a safe
 * default when Gemini drops one. Wrong-typed entries are silently
 * removed. Missing top-level fields get empty strings / arrays so the
 * fingerprint still ships instead of hard-failing on one missing axis.
 */
export function normalizeFingerprintOutput(v: unknown): unknown {
  if (!v || typeof v !== "object") return v
  const o = v as Record<string, unknown>
  const dnaRaw = (o.dna ?? {}) as Record<string, unknown>

  const dna: KhatMapKhatDna = {
    identity_summary: asString(
      dnaRaw.identity_summary ?? o.identity_summary,
    ),
    emotional_signature: asStringArray(dnaRaw.emotional_signature),
    signature_themes: asStringArray(dnaRaw.signature_themes),
    overused_themes: asStringArray(dnaRaw.overused_themes),
    repeated_themes: asStringArray(dnaRaw.repeated_themes),
    underexplored_themes: asStringArray(dnaRaw.underexplored_themes),
    guest_archetypes_that_fit: asStringArray(dnaRaw.guest_archetypes_that_fit),
    guest_archetypes_to_avoid: asStringArray(dnaRaw.guest_archetypes_to_avoid),
    viewer_preferences: asStringArray(dnaRaw.viewer_preferences),
    differentiators: asStringArray(dnaRaw.differentiators),
    strongest_historical_topics: asStringArray(dnaRaw.strongest_historical_topics),
    strongest_emotional_topics: asStringArray(dnaRaw.strongest_emotional_topics),
    strongest_intellectual_topics: asStringArray(dnaRaw.strongest_intellectual_topics),
    strongest_social_topics: asStringArray(dnaRaw.strongest_social_topics),
    strongest_kuwait_topics: asStringArray(dnaRaw.strongest_kuwait_topics),
    title_patterns: asStringArray(dnaRaw.title_patterns),
    length_patterns: asStringArray(dnaRaw.length_patterns),
    guest_patterns_that_work: asStringArray(dnaRaw.guest_patterns_that_work),
    guest_patterns_overused: asStringArray(dnaRaw.guest_patterns_overused),
    fits_identity: asStringArray(dnaRaw.fits_identity),
    does_not_fit_identity: asStringArray(dnaRaw.does_not_fit_identity),
    gaps: asStringArray(dnaRaw.gaps),
    future_directions: asStringArray(dnaRaw.future_directions),
    editorial_warnings: asStringArray(dnaRaw.editorial_warnings),
    coverage_notes: asStringArray(dnaRaw.coverage_notes),
  }

  return {
    identity_summary: asString(o.identity_summary) || dna.identity_summary,
    analysis_notes: asString(o.analysis_notes),
    strongest_emotional_topics:
      asStringArray(o.strongest_emotional_topics).length > 0
        ? asStringArray(o.strongest_emotional_topics)
        : dna.strongest_emotional_topics,
    most_successful_episodes: normalizeEpisodeEntries(o.most_successful_episodes),
    most_successful_guests: normalizeGuestEntries(o.most_successful_guests),
    dna,
  }
}

/**
 * Strict only on what would genuinely make the fingerprint unusable:
 *   - identity_summary non-empty (>= 20 chars)
 *   - dna object present with non-empty identity_summary
 * Everything else is allowed to be empty — the DNA fields are information
 * signals, not integrity constraints.
 */
export function isFingerprintAnalysisOutput(
  v: unknown,
): v is FingerprintAnalysisOutput {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>

  if (typeof o.identity_summary !== "string" || o.identity_summary.trim().length < 20) {
    return false
  }
  if (typeof o.analysis_notes !== "string") return false
  if (!Array.isArray(o.strongest_emotional_topics)) return false
  if (!Array.isArray(o.most_successful_episodes)) return false
  if (!Array.isArray(o.most_successful_guests)) return false

  const dna = o.dna as Record<string, unknown> | undefined
  if (!dna || typeof dna !== "object") return false
  if (typeof dna.identity_summary !== "string") return false
  return true
}

// ─── Prompt assembly ─────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return [
    khatConstitutionPrompt(),
    "",
    "## Analyst role",
    "You are a senior Arabic-podcast editorial analyst producing Khat Podcast's editorial fingerprint.",
    "",
    "Rules you MUST follow:",
    "1. The constitution above is the PRIMARY editorial truth. Channel history is calibration only.",
    "2. Never invent topics, guests, or patterns not supported by the provided corpus.",
    "3. If the corpus lacks signal for a category, emit an empty array AND record a one-line note in `dna.coverage_notes`. Do not pad.",
    "4. Prefer concrete Arabic phrasing for every list item.",
    "5. Separate signature strengths from overuse.",
    "6. `future_directions` should be specific angles/questions, not categories.",
    "7. `editorial_warnings` surfaces risks — only include items the admin should actually act on.",
    "8. `does_not_fit_identity` must cite concrete anti-patterns.",
    "9. Return valid JSON ONLY. No markdown. No prose outside the object.",
    "",
    "## Output contract",
    "Return JSON that matches this exact shape:",
    '{',
    '  "identity_summary": string (6–12 sentences, Arabic),',
    '  "analysis_notes": string (free-form Arabic),',
    '  "strongest_emotional_topics": string[],',
    '  "most_successful_episodes": [{"title": string, "youtube_id"?: string, "view_count"?: number, "why_successful"?: string}],',
    '  "most_successful_guests": [{"name": string, "episode_title"?: string, "view_count"?: number, "why_successful"?: string}],',
    '  "dna": {',
    '    "identity_summary": string,',
    '    "emotional_signature": string[],',
    '    "signature_themes": string[],',
    '    "overused_themes": string[],',
    '    "repeated_themes": string[],',
    '    "underexplored_themes": string[],',
    '    "guest_archetypes_that_fit": string[],',
    '    "guest_archetypes_to_avoid": string[],',
    '    "viewer_preferences": string[],',
    '    "differentiators": string[],',
    '    "strongest_historical_topics": string[],',
    '    "strongest_emotional_topics": string[],',
    '    "strongest_intellectual_topics": string[],',
    '    "strongest_social_topics": string[],',
    '    "strongest_kuwait_topics": string[],',
    '    "title_patterns": string[],',
    '    "length_patterns": string[],',
    '    "guest_patterns_that_work": string[],',
    '    "guest_patterns_overused": string[],',
    '    "fits_identity": string[],',
    '    "does_not_fit_identity": string[],',
    '    "gaps": string[],',
    '    "future_directions": string[],',
    '    "editorial_warnings": string[],',
    '    "coverage_notes": string[]',
    '  }',
    '}',
    "",
    "Keep each list item under 12 Arabic words. Keep lists tight (5–8 items).",
  ].join("\n")
}

function buildUserPrompt(corpus: string): string {
  return [
    "Below is the distilled corpus of Khat Podcast's archive (real data from the production DB — never invent anything beyond it).",
    "",
    "Analyze it and produce the editorial fingerprint according to the system instructions.",
    "",
    "--- CORPUS START ---",
    corpus,
    "--- CORPUS END ---",
  ].join("\n")
}

/**
 * Minimal-retry system prompt — stripped of the full constitution, only
 * basic editorial guardrails + strict JSON output. Used when the primary
 * hardened call fails. Narrower contract: a tight identity_summary + a
 * handful of DNA sub-lists. The normalizer fills the rest.
 */
function buildMinimalSystemPrompt(): string {
  return [
    "أنت محلل تحريري لبودكاست خط — بودكاست عربي عميق ذو قيمة دائمة.",
    "يجب أن تُنتج بصمة تحريرية مختصرة من الأرشيف المُقدَّم.",
    "",
    "Respond with VALID JSON ONLY. No markdown, no prose, no explanation.",
    "Output shape:",
    '{"identity_summary": string, "analysis_notes": string, "strongest_emotional_topics": string[], "most_successful_episodes": [{"title": string, "why_successful"?: string}], "most_successful_guests": [{"name": string}], "dna": {"identity_summary": string, "emotional_signature": string[], "signature_themes": string[], "overused_themes": string[], "underexplored_themes": string[], "gaps": string[], "future_directions": string[]}}',
    "",
    "Keep every list at 3–5 items max. Keep identity_summary to 4–6 sentences.",
  ].join("\n")
}

function buildMinimalUserPrompt(corpus: string): string {
  // Tighter corpus — top 2500 chars only. The normalizer can still fill
  // every DNA field in the output, so the minimal call just needs to
  // nail the identity + the 7 sub-lists the minimal shape exposes.
  const trimmed = corpus.length > 2500 ? corpus.slice(0, 2500) + "\n…" : corpus
  return [
    "Distilled Khat Podcast corpus:",
    "",
    trimmed,
    "",
    "Produce the fingerprint. JSON only.",
  ].join("\n")
}

// ─── Public API ──────────────────────────────────────────────────────────────

export class FingerprintAnalysisError extends Error {
  readonly reason:
    | "no_api_key"
    | "empty_corpus"
    | "gemini_error"
    | "invalid_shape"
    | "truncated"
  readonly detail?: string
  readonly diagnostics?: {
    prompt_length: number
    response_length: number
    stages_attempted: string[]
    finish_reason?: string
    appeared_truncated: boolean
    raw_text_preview: string
    retry_attempted: boolean
    retry_stages_attempted?: string[]
    retry_response_length?: number
    retry_last_error?: string
  }
  constructor(init: {
    reason: FingerprintAnalysisError["reason"]
    message: string
    detail?: string
    diagnostics?: FingerprintAnalysisError["diagnostics"]
  }) {
    super(init.message)
    this.name = "FingerprintAnalysisError"
    this.reason = init.reason
    this.detail = init.detail
    this.diagnostics = init.diagnostics
  }
}

export async function analyzeFingerprintWithGemini(
  signals: ChannelSignals,
): Promise<FingerprintAnalysisOutput> {
  if (!isGeminiConfigured()) {
    throw new FingerprintAnalysisError({
      reason: "no_api_key",
      message: "GEMINI_API_KEY not configured",
    })
  }

  if (signals.coverage.non_hidden_episodes === 0) {
    throw new FingerprintAnalysisError({
      reason: "empty_corpus",
      message: "No episodes to analyze",
    })
  }

  const corpus = buildChannelCorpus(signals)
  const system = buildSystemPrompt()
  const user = buildUserPrompt(corpus)

  // Primary: hardened call with tolerant normalizer + loose validator.
  let hardened: HardenedJsonResult<FingerprintAnalysisOutput> =
    await geminiJsonHardened<FingerprintAnalysisOutput>({
      system,
      user,
      label: "khat-map:fingerprint",
      temperature: 0.2,
      maxOutputTokens: 8192,
      validate: isFingerprintAnalysisOutput,
      normalize: normalizeFingerprintOutput,
    })

  let retryAttempted = false
  let retryDiag: HardenedDiagnostics | null = null

  if (!hardened.ok) {
    // Fallback: smaller system prompt + trimmed corpus + smaller budget.
    retryAttempted = true
    console.warn(
      `[khat-map:fingerprint] primary hardened call failed (${hardened.reason}); attempting minimal retry`,
    )
    const retry = await geminiJsonHardened<FingerprintAnalysisOutput>({
      system: buildMinimalSystemPrompt(),
      user: buildMinimalUserPrompt(corpus),
      label: "khat-map:fingerprint-minimal",
      temperature: 0.15,
      maxOutputTokens: 4096,
      validate: isFingerprintAnalysisOutput,
      normalize: normalizeFingerprintOutput,
    })
    retryDiag = retry.diagnostics
    if (retry.ok) {
      hardened = retry
    }
  }

  if (!hardened.ok) {
    const d = hardened.diagnostics
    const diagnostics: FingerprintAnalysisError["diagnostics"] = {
      prompt_length: d.prompt_length,
      response_length: d.response_length,
      stages_attempted: d.stages_attempted,
      finish_reason: d.finish_reason,
      appeared_truncated: d.appeared_truncated,
      raw_text_preview: d.raw_text.slice(0, 4000),
      retry_attempted: retryAttempted,
      retry_stages_attempted: retryDiag?.stages_attempted,
      retry_response_length: retryDiag?.response_length,
      retry_last_error: retryDiag?.last_error,
    }

    const reason =
      hardened.reason === "shape_validation_failed"
        ? "invalid_shape"
        : hardened.reason === "truncated"
          ? "truncated"
          : "gemini_error"

    throw new FingerprintAnalysisError({
      reason,
      message: buildAdminErrorMessage(hardened, retryAttempted, retryDiag),
      detail: d.last_error,
      diagnostics,
    })
  }

  return hardened.data
}

// ─── Admin-facing error message builder ─────────────────────────────────────

function buildAdminErrorMessage(
  hardened: Extract<HardenedJsonResult<unknown>, { ok: false }>,
  retryAttempted: boolean,
  retryDiag: HardenedDiagnostics | null,
): string {
  const d = hardened.diagnostics
  const parts: string[] = []

  parts.push(
    hardened.reason === "truncated"
      ? "Gemini أعاد ردًا مقطوعًا"
      : hardened.reason === "empty_response"
        ? "Gemini لم يُرجع أي نص"
        : hardened.reason === "shape_validation_failed"
          ? "Gemini أعاد JSON لا يطابق البنية المتوقعة"
          : hardened.reason === "transport_error"
            ? "فشل الاتصال بـ Gemini"
            : "Gemini أعاد بصمة غير صالحة",
  )
  parts.push(`طول الطلب: ${d.prompt_length} حرف`)
  parts.push(`طول الرد: ${d.response_length} حرف`)
  if (d.finish_reason) parts.push(`سبب الإنهاء: ${d.finish_reason}`)
  if (d.stages_attempted.length) {
    parts.push(`المراحل المُجرَّبة: ${d.stages_attempted.join(" → ")}`)
  }
  if (retryAttempted) {
    if (retryDiag) {
      parts.push(
        `أُعيدت المحاولة بمطالبة مُبسَّطة (طول الرد: ${retryDiag.response_length}، المراحل: ${retryDiag.stages_attempted.join(" → ")})`,
      )
    } else {
      parts.push("أُعيدت المحاولة بمطالبة مُبسَّطة")
    }
  }
  return parts.join(" · ")
}
