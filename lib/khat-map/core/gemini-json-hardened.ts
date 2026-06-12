/**
 * Hardened Gemini JSON call.
 *
 * Wraps the raw Gemini SDK with a multi-stage recovery ladder. Unlike
 * the preparation research pipeline's `geminiJson()` (which raises on
 * failure), this helper *never throws* — it returns a discriminated
 * `HardenedJsonResult<T>` carrying either the parsed value or rich
 * diagnostics the caller can surface in the UI.
 *
 * Recovery ladder (tried in order, stops at first success):
 *   1. Strict `JSON.parse` of the raw response.
 *   2. `sanitizeJsonResponse` — smart-quote normalization, control-char
 *      stripping, fence removal, prose trim, trailing-comma fix. Then
 *      strict `JSON.parse` of the sanitized text.
 *   3. `extractLargestJsonBlock` — regex+brace-walking to carve out the
 *      biggest balanced `{...}` block. Then strict parse.
 *   4. `repairTruncatedJson` — local truncation repair: trim dangling
 *      key/value fragments and close the open bracket stack. Free —
 *      no extra model call.
 *   5. `repairJsonWithModel` — one more Gemini call with a minimal
 *      prompt: "Return only valid JSON. Do not add prose."
 *
 * The string-level helpers live in lib/ai/json-repair.ts (shared with
 * the preparation research pipeline). At every stage the raw text is
 * preserved on the diagnostics object so the UI / logs / audit trail
 * can show the admin what Gemini actually returned.
 */

import { GoogleGenerativeAI } from "@google/generative-ai"
import { getGeminiClient } from "@/lib/ai/gemini"
import {
  sanitizeJsonResponse,
  extractLargestJsonBlock,
  repairTruncatedJson,
  isObviouslyTruncated,
} from "@/lib/ai/json-repair"

// Re-exported for existing callers/tests that import them from here.
export { sanitizeJsonResponse, extractLargestJsonBlock }

// ─── Model config ────────────────────────────────────────────────────────────

const HARDENED_JSON_MODEL =
  process.env.KHAT_MAP_JSON_MODEL || "gemini-2.5-flash"

// ─── Result + diagnostics types ─────────────────────────────────────────────

export type HardenedFailureReason =
  | "no_api_key"
  | "transport_error"
  | "empty_response"
  | "invalid_json"
  | "shape_validation_failed"
  | "truncated"

export type HardenedParseStage =
  | "strict_parse"
  | "sanitize_parse"
  | "regex_extract_parse"
  | "truncation_repair"
  | "model_repair"

export interface HardenedDiagnostics {
  /** Exactly what Gemini returned on the primary call (trimmed). */
  raw_text: string
  /** Prompt length in chars (system + user). */
  prompt_length: number
  /** Response length in chars. */
  response_length: number
  /** Which stages were attempted, in order. */
  stages_attempted: HardenedParseStage[]
  /** The stage that finally succeeded, if any. */
  succeeded_at: HardenedParseStage | null
  /** Gemini finishReason, if exposed by the SDK. */
  finish_reason?: string
  /** Why we gave up (matches reason on failure). */
  last_error?: string
  /** Was the output likely truncated? Determined by finishReason + trailing shape. */
  appeared_truncated: boolean
}

export type HardenedJsonResult<T> =
  | { ok: true; data: T; diagnostics: HardenedDiagnostics }
  | {
      ok: false
      reason: HardenedFailureReason
      message: string
      diagnostics: HardenedDiagnostics
    }

// ─── Public API ──────────────────────────────────────────────────────────────

export interface HardenedJsonInput<T> {
  system: string
  user: string
  label: string
  temperature?: number
  /** Max output tokens. Default 8192. */
  maxOutputTokens?: number
  /** Validator — receives the parsed value, returns narrowing boolean. */
  validate: (value: unknown) => value is T
  /** Optional normalizer run before validation — fills defaults into parsed object. */
  normalize?: (value: unknown) => unknown
}

/**
 * Run a Gemini JSON call through the full recovery ladder. Always
 * returns — never throws.
 */
export async function geminiJsonHardened<T>(
  input: HardenedJsonInput<T>,
): Promise<HardenedJsonResult<T>> {
  const diagnostics: HardenedDiagnostics = {
    raw_text: "",
    prompt_length: (input.system?.length ?? 0) + (input.user?.length ?? 0),
    response_length: 0,
    stages_attempted: [],
    succeeded_at: null,
    appeared_truncated: false,
  }

  let client: GoogleGenerativeAI
  try {
    client = getGeminiClient()
  } catch (err) {
    return {
      ok: false,
      reason: "no_api_key",
      message: "GEMINI_API_KEY not configured",
      diagnostics,
    }
  }

  // ── Primary call ──────────────────────────────────────────────────────
  let rawText = ""
  let finishReason: string | undefined
  try {
    const model = client.getGenerativeModel({
      model: HARDENED_JSON_MODEL,
      systemInstruction: input.system,
      generationConfig: {
        temperature: input.temperature ?? 0.3,
        responseMimeType: "application/json",
        maxOutputTokens: input.maxOutputTokens ?? 8192,
      },
    })
    const result = await model.generateContent(input.user)
    const extracted = extractText(result)
    rawText = extracted.text
    finishReason = extracted.finishReason
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    diagnostics.last_error = `transport: ${message}`
    return {
      ok: false,
      reason: "transport_error",
      message: `Gemini transport error: ${message}`,
      diagnostics,
    }
  }

  diagnostics.raw_text = rawText.slice(0, 40000)
  diagnostics.response_length = rawText.length
  diagnostics.finish_reason = finishReason
  diagnostics.appeared_truncated =
    finishReason === "MAX_TOKENS" ||
    finishReason === "SAFETY" ||
    isObviouslyTruncated(rawText)

  if (!rawText || rawText.trim().length === 0) {
    diagnostics.last_error = "empty response"
    return {
      ok: false,
      reason: "empty_response",
      message: "Gemini returned an empty response",
      diagnostics,
    }
  }

  // ── Ladder ─────────────────────────────────────────────────────────────
  const tryAccept = (parsed: unknown, stage: HardenedParseStage): HardenedJsonResult<T> | null => {
    diagnostics.stages_attempted.push(stage)
    const normalized = input.normalize ? input.normalize(parsed) : parsed
    if (input.validate(normalized)) {
      diagnostics.succeeded_at = stage
      return { ok: true, data: normalized, diagnostics }
    }
    diagnostics.last_error = `${stage}: shape validation failed`
    return null
  }

  // Stage 1: strict parse
  try {
    const parsed = JSON.parse(rawText)
    const accepted = tryAccept(parsed, "strict_parse")
    if (accepted) return accepted
  } catch {
    diagnostics.stages_attempted.push("strict_parse")
    diagnostics.last_error = "strict_parse: syntax error"
  }

  // Stage 2: sanitize + parse
  const sanitized = sanitizeJsonResponse(rawText)
  if (sanitized) {
    try {
      const parsed = JSON.parse(sanitized)
      const accepted = tryAccept(parsed, "sanitize_parse")
      if (accepted) return accepted
    } catch (err) {
      diagnostics.stages_attempted.push("sanitize_parse")
      diagnostics.last_error =
        "sanitize_parse: " + (err instanceof Error ? err.message : String(err))
    }
  }

  // Stage 3: regex-extract largest JSON object
  const extracted = extractLargestJsonBlock(rawText)
  if (extracted) {
    try {
      const parsed = JSON.parse(extracted)
      const accepted = tryAccept(parsed, "regex_extract_parse")
      if (accepted) return accepted
    } catch (err) {
      diagnostics.stages_attempted.push("regex_extract_parse")
      diagnostics.last_error =
        "regex_extract_parse: " + (err instanceof Error ? err.message : String(err))
    }
  }

  // Stage 4: local truncation repair — close dangling structures. Free
  // (no model call), so it runs before the model-repair stage.
  const truncRepaired = repairTruncatedJson(rawText)
  if (truncRepaired) {
    try {
      const parsed = JSON.parse(truncRepaired)
      const accepted = tryAccept(parsed, "truncation_repair")
      if (accepted) return accepted
    } catch (err) {
      diagnostics.stages_attempted.push("truncation_repair")
      diagnostics.last_error =
        "truncation_repair: " + (err instanceof Error ? err.message : String(err))
    }
  }

  // Stage 5: model repair — one more call with a minimal prompt that asks
  // Gemini to fix its own malformed output. Uses temperature 0 and a very
  // tight system instruction.
  try {
    const repairedText = await repairJsonWithModel(client, rawText)
    if (repairedText) {
      // Try strict first, then sanitize on the repair output.
      try {
        const parsed = JSON.parse(repairedText)
        const accepted = tryAccept(parsed, "model_repair")
        if (accepted) return accepted
      } catch {
        const resanitized = sanitizeJsonResponse(repairedText)
        if (resanitized) {
          try {
            const parsed = JSON.parse(resanitized)
            const accepted = tryAccept(parsed, "model_repair")
            if (accepted) return accepted
          } catch (err2) {
            diagnostics.stages_attempted.push("model_repair")
            diagnostics.last_error =
              "model_repair: " +
              (err2 instanceof Error ? err2.message : String(err2))
          }
        } else {
          diagnostics.stages_attempted.push("model_repair")
          diagnostics.last_error = "model_repair: sanitize on repair output yielded null"
        }
      }
    } else {
      diagnostics.stages_attempted.push("model_repair")
      diagnostics.last_error = "model_repair: empty repair output"
    }
  } catch (err) {
    diagnostics.stages_attempted.push("model_repair")
    diagnostics.last_error =
      "model_repair transport: " + (err instanceof Error ? err.message : String(err))
  }

  // All ladder stages exhausted. Classify the failure so the UI can tell
  // the admin whether it was shape validation vs syntax vs truncation.
  const reason: HardenedFailureReason =
    diagnostics.last_error?.includes("shape validation failed")
      ? "shape_validation_failed"
      : diagnostics.appeared_truncated
        ? "truncated"
        : "invalid_json"
  return {
    ok: false,
    reason,
    message:
      reason === "truncated"
        ? "Gemini response was truncated"
        : reason === "shape_validation_failed"
          ? "Gemini returned JSON that didn't match the expected shape"
          : "Gemini returned malformed JSON",
    diagnostics,
  }
}

// ─── Model repair ────────────────────────────────────────────────────────────

/**
 * One-shot Gemini call that asks the model to return its own previous
 * output as valid JSON. Temperature 0 for determinism, minimal prompt,
 * no search tools. Returns the repaired text or empty string on failure.
 */
async function repairJsonWithModel(
  client: GoogleGenerativeAI,
  malformed: string,
): Promise<string> {
  const model = client.getGenerativeModel({
    model: HARDENED_JSON_MODEL,
    systemInstruction:
      "Return only valid JSON. Do not add prose, markdown, or explanations.",
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
    },
  })
  const result = await model.generateContent(
    `Fix the JSON below. Preserve every key and value. If the original is truncated, close dangling brackets with null / "" / [] and keep every complete key intact.\n\n${malformed.slice(0, 16000)}`,
  )
  const extracted = extractText(result)
  return extracted.text
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(result: any): { text: string; finishReason?: string } {
  let text = ""
  try {
    text = result?.response?.text?.() ?? ""
  } catch {
    text = ""
  }
  if (!text) {
    const parts = result?.response?.candidates?.[0]?.content?.parts ?? []
    text = parts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
  }
  const finishReason: string | undefined =
    result?.response?.candidates?.[0]?.finishReason ||
    result?.response?.candidates?.[0]?.finish_reason
  return { text: text || "", finishReason }
}
