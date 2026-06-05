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
 *   4. `repairJsonWithModel` — one more Gemini call with a minimal
 *      prompt: "Return only valid JSON. Do not add prose."
 *
 * At every stage the raw text is preserved on the diagnostics object so
 * the UI / logs / audit trail can show the admin what Gemini actually
 * returned. Empty responses, truncated responses, and finish-reason
 * problems are all explicitly classified.
 */

import { GoogleGenerativeAI } from "@google/generative-ai"
import { getGeminiClient } from "@/lib/ai/preparation/research/gemini"

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

  // Stage 4: model repair — one more call with a minimal prompt that asks
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

// ─── Sanitization ────────────────────────────────────────────────────────────

/**
 * Aggressive cleanup of a Gemini response. Returns null when no plausible
 * JSON root can be recovered after cleaning — the caller falls through to
 * the next stage in the ladder.
 *
 * Operations (in order):
 *   1. Strip markdown fences (```json ... ``` or ``` ... ```).
 *   2. Normalize smart quotes (" " ' ' „ ‚ ‹ ›) → ASCII " and '.
 *   3. Remove control characters except \n \r \t (which JSON allows
 *      inside strings after escaping, but most Gemini output escapes).
 *   4. Trim everything before the first `{` or `[`.
 *   5. Trim everything after the last balanced `}` or `]` by walking
 *      the string with a stack + string-awareness.
 *   6. Remove trailing commas before `}` or `]`.
 *   7. Strip `// ...` and `/* ... *​/` comments (Gemini sometimes adds
 *      comments even when asked for JSON-only).
 */
export function sanitizeJsonResponse(raw: string): string | null {
  if (!raw) return null
  let s = raw

  // 1. Strip fences — look for the FIRST fenced block anywhere.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fence) s = fence[1]

  // 2. Normalize smart quotes. Double-quote variants first, then single.
  s = s
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A]/g, "'")

  // 3. Strip control characters except \t \n \r. JSON doesn't allow raw
  // control chars inside strings — if Gemini leaked any (e.g. ANSI color
  // escapes), they must go.
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")

  // 7. Strip // line comments and /* block comments (pre-trim so we don't
  // accidentally strip from inside strings — quick-and-dirty sufficient
  // for the Gemini output shapes we've seen).
  // We only strip comments OUTSIDE quoted strings by walking the text.
  s = stripCommentsOutsideStrings(s)

  // 4. Trim leading prose.
  const firstStructural = s.search(/[{[]/)
  if (firstStructural < 0) return null
  s = s.slice(firstStructural)

  // 5. Trim trailing prose — find the last position where depth returns
  // to 0 with a closing bracket.
  const depthZeroEnd = findLastTopLevelClose(s)
  if (depthZeroEnd > 0) s = s.slice(0, depthZeroEnd + 1)

  // 6. Remove trailing commas before `}` or `]`. Repeat once in case
  // nested objects leaked them.
  s = s.replace(/,(\s*[}\]])/g, "$1").replace(/,(\s*[}\]])/g, "$1")

  // Sanity: the result should still have both an opening structural char
  // and at least one closing one.
  if (!/^[\s]*[{[]/.test(s) || !/[}\]][\s]*$/.test(s)) return null

  return s
}

function stripCommentsOutsideStrings(s: string): string {
  let out = ""
  let inString = false
  let stringChar: '"' | "'" | null = null
  let escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) {
      out += ch
      escape = false
      continue
    }
    if (inString) {
      if (ch === "\\") {
        escape = true
        out += ch
        continue
      }
      if (ch === stringChar) {
        inString = false
        stringChar = null
      }
      out += ch
      continue
    }
    // Not in string — look for comment starts.
    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch as '"' | "'"
      out += ch
      continue
    }
    if (ch === "/" && s[i + 1] === "/") {
      // Skip to end of line.
      const nl = s.indexOf("\n", i + 2)
      if (nl < 0) return out
      i = nl - 1
      continue
    }
    if (ch === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2)
      if (end < 0) return out
      i = end + 1
      continue
    }
    out += ch
  }
  return out
}

function findLastTopLevelClose(s: string): number {
  const stack: Array<"{" | "["> = []
  let inString = false
  let escape = false
  let last = -1
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === "\\") {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === "{" || ch === "[") {
      stack.push(ch)
    } else if (ch === "}" || ch === "]") {
      const opener = stack[stack.length - 1]
      if ((ch === "}" && opener === "{") || (ch === "]" && opener === "[")) {
        stack.pop()
      }
      if (stack.length === 0) last = i
    }
  }
  return last
}

// ─── Regex-style extraction ──────────────────────────────────────────────────

/**
 * Walk the raw response and return the text spanning the largest
 * balanced top-level `{...}` or `[...]` block. Used when sanitize
 * couldn't identify a clean root but some parseable JSON exists
 * somewhere in the buffer (e.g. inside a prose wrapper).
 */
export function extractLargestJsonBlock(raw: string): string | null {
  if (!raw) return null
  const candidates: Array<{ start: number; end: number; length: number }> = []

  for (let open = 0; open < raw.length; open++) {
    const ch = raw[open]
    if (ch !== "{" && ch !== "[") continue
    const close = findBalancedClose(raw, open)
    if (close < 0) continue
    candidates.push({ start: open, end: close, length: close - open + 1 })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.length - a.length)
  return raw.slice(candidates[0].start, candidates[0].end + 1)
}

function findBalancedClose(s: string, start: number): number {
  const opener = s[start]
  if (opener !== "{" && opener !== "[") return -1
  const expectedClose = opener === "{" ? "}" : "]"
  const stack: string[] = [opener]
  let inString = false
  let escape = false
  for (let i = start + 1; i < s.length; i++) {
    const ch = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === "\\") {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === "{" || ch === "[") stack.push(ch)
    else if (ch === "}" || ch === "]") {
      const top = stack[stack.length - 1]
      if ((ch === "}" && top === "{") || (ch === "]" && top === "[")) {
        stack.pop()
      }
      if (stack.length === 0) {
        return ch === expectedClose ? i : -1
      }
    }
  }
  return -1
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

function isObviouslyTruncated(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  const last = trimmed[trimmed.length - 1]
  // If the buffer ends mid-string/key/number/comma, it's almost certainly
  // truncated. Closing `}` or `]` are the only "clean" endings.
  if (last === "}" || last === "]") return false
  return true
}
