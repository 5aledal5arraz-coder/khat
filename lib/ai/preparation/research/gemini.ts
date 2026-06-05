/**
 * Gemini client + grounded web retrieval.
 *
 * We use two Gemini call modes:
 *
 *   1) RETRIEVAL — `gemini-2.0-flash` with the Google Search tool enabled.
 *      The model runs a real web search and returns grounding metadata
 *      containing the actual URLs, titles, and snippets it found. We ignore
 *      the model's free-text answer and extract only the grounding chunks.
 *      That gives us verifiable sources, not hallucinated URLs.
 *
 *   2) REASONING — `gemini-2.0-flash` with `responseMimeType: application/json`
 *      and no search tool. Used by the synthesizer and verifier passes where
 *      we want structured output over a fixed corpus, not fresh retrieval.
 *
 * This module also owns the single `@google/generative-ai` SDK instance so
 * the rest of the pipeline only depends on a narrow interface.
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai"
import type { RawRetrievedSource } from "./types"

// ─── Model config ────────────────────────────────────────────────────────────

const GEMINI_RETRIEVAL_MODEL =
  process.env.GEMINI_RETRIEVAL_MODEL || "gemini-2.5-flash"
const GEMINI_REASONING_MODEL =
  process.env.GEMINI_REASONING_MODEL || "gemini-2.5-flash"

// ─── Client ──────────────────────────────────────────────────────────────────

let cached: GoogleGenerativeAI | null = null

/**
 * Returns a cached Gemini client. Throws a blocking error if the key is
 * missing — we explicitly do NOT fall back silently.
 */
export function getGeminiClient(): GoogleGenerativeAI {
  if (cached) return cached
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not configured. The preparation research pipeline requires Gemini for grounded web retrieval.",
    )
  }
  cached = new GoogleGenerativeAI(key)
  return cached
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

// ─── Retrieval with grounded search ──────────────────────────────────────────

interface GroundingChunkWeb {
  uri?: string
  title?: string
}
interface GroundingChunk {
  web?: GroundingChunkWeb
}
interface GroundingSupport {
  segment?: { startIndex?: number; endIndex?: number; text?: string }
  groundingChunkIndices?: number[]
}
interface GroundingMetadata {
  groundingChunks?: GroundingChunk[]
  groundingSupports?: GroundingSupport[]
  webSearchQueries?: string[]
  searchEntryPoint?: { renderedContent?: string }
}

/**
 * Ask Gemini to search the web for a query and return grounded sources.
 *
 * Strategy:
 *   1) Call `gemini-2.5-flash` with the Google Search tool and a prompt that
 *      asks for a thorough Arabic research summary. Gemini actually runs a
 *      live web search — we don't rely on its training data.
 *   2) Extract `groundingChunks[]` for the real URLs + publisher domains.
 *   3) Walk `groundingSupports[]` to collect every text segment that cited a
 *      given chunk. Concatenating those segments gives us a per-source
 *      "snippet" that is actually grounded in that specific URL.
 *
 * The resulting `RawRetrievedSource.snippet` is therefore non-empty and
 * faithful — each snippet is text that Gemini explicitly attributed to
 * that URL during its live search.
 */
export async function geminiSearchWeb(
  query: string,
  maxResults = 8,
): Promise<RawRetrievedSource[]> {
  const genAI = getGeminiClient()

  // The tool name differs between Gemini versions; we try the 2.0+ name
  // first and fall back to the 1.5 name if the SDK rejects it.
  const buildModel = (toolShape: "googleSearch" | "googleSearchRetrieval"): GenerativeModel => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: any[] =
      toolShape === "googleSearch"
        ? [{ googleSearch: {} }]
        : [{ googleSearchRetrieval: {} }]
    return genAI.getGenerativeModel({
      model: GEMINI_RETRIEVAL_MODEL,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any,
      generationConfig: { temperature: 0.2 },
    })
  }

  const prompt =
    `أنت باحث محترف. استخدم أداة البحث في Google للعثور على مصادر حقيقية وحديثة للسؤال التالي. ` +
    `أنتج ملخصاً بحثياً مفصّلاً باللغة العربية (أو بالإنجليزية عند الضرورة) يستند إلى المصادر التي وجدتها. ` +
    `ضمّن حقائق، تواريخ، تصريحات، وتفاصيل ملموسة. كل ادعاء يجب أن يكون مدعوماً بمصدر فعلي من نتائج البحث.\n\n` +
    `السؤال: ${query}`

  // Retry wrapper — Gemini frequently returns 503/429 under load.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callWithRetry = async (model: GenerativeModel): Promise<any> => {
    const maxAttempts = 3
    let lastErr: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await model.generateContent(prompt)
      } catch (err) {
        lastErr = err
        const message = err instanceof Error ? err.message : String(err)
        const retriable = /\b(503|429|504|UNAVAILABLE|overloaded)\b/i.test(message)
        if (!retriable || attempt === maxAttempts) throw err
        const backoffMs = 1500 * attempt
        console.warn(
          `[preparation/research] Gemini transient error (attempt ${attempt}/${maxAttempts}), retrying in ${backoffMs}ms:`,
          message.split("\n")[0].slice(0, 160),
        )
        await new Promise((r) => setTimeout(r, backoffMs))
      }
    }
    throw lastErr
  }

  let groundingMetadata: GroundingMetadata | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any
  try {
    const model = buildModel("googleSearch")
    result = await callWithRetry(model)
    groundingMetadata = extractGroundingMetadata(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/googleSearch|unknown field|invalid/i.test(message)) {
      try {
        const model = buildModel("googleSearchRetrieval")
        result = await callWithRetry(model)
        groundingMetadata = extractGroundingMetadata(result)
      } catch (err2) {
        console.error("[preparation/research] Gemini search fallback failed:", err2)
        throw err2
      }
    } else {
      console.error("[preparation/research] Gemini search failed:", err)
      throw err
    }
  }

  const chunks = groundingMetadata?.groundingChunks ?? []
  const supports = groundingMetadata?.groundingSupports ?? []

  // Build a per-chunk snippet by concatenating every support segment that
  // cited this chunk. This gives the downstream synthesizer real text to
  // reason over instead of just naked URLs.
  const snippetsByChunkIdx = new Map<number, string[]>()
  for (const s of supports) {
    const seg = s.segment?.text?.trim()
    if (!seg) continue
    const idxs = s.groundingChunkIndices ?? []
    for (const idx of idxs) {
      if (!snippetsByChunkIdx.has(idx)) snippetsByChunkIdx.set(idx, [])
      snippetsByChunkIdx.get(idx)!.push(seg)
    }
  }

  const sources: RawRetrievedSource[] = []
  chunks.forEach((c, idx) => {
    const web = c.web
    if (!web?.uri) return
    const publisher = (web.title || safePublisher(web.uri) || "").trim() || undefined
    const segs = snippetsByChunkIdx.get(idx) ?? []
    // De-dupe and cap snippet length so downstream prompts stay bounded.
    const snippetSet = new Set<string>()
    for (const s of segs) {
      const clean = s.replace(/\s+/g, " ").trim()
      if (clean.length > 0) snippetSet.add(clean)
    }
    const snippet = [...snippetSet].join(" ").slice(0, 1200)

    // For grounded search results the "title" slot is only a domain. Use
    // the first snippet (truncated) as the display title so the UI reads
    // well, falling back to the domain.
    const displayTitle = snippet
      ? snippet.slice(0, 120) + (snippet.length > 120 ? "…" : "")
      : publisher || web.uri
    sources.push({
      provider: "gemini_web",
      title: displayTitle,
      url: web.uri,
      snippet,
      publisher,
    })
  })

  // Prefer sources with richer snippets first.
  sources.sort((a, b) => b.snippet.length - a.snippet.length)
  return sources.slice(0, maxResults)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGroundingMetadata(result: any): GroundingMetadata | undefined {
  const candidate = result?.response?.candidates?.[0]
  return (
    candidate?.groundingMetadata ||
    candidate?.grounding_metadata ||
    undefined
  )
}

function safePublisher(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return undefined
  }
}

// ─── Reasoning / JSON calls ──────────────────────────────────────────────────

/**
 * Structured error thrown when Gemini JSON output cannot be recovered.
 * The route handler converts this into a user-facing Arabic message while
 * preserving the stage + diagnostics for server logs.
 */
export class GeminiJsonError extends Error {
  readonly label: string
  readonly stage: "parse" | "repair" | "retry" | "shape"
  readonly rawExcerpt: string
  readonly parseMessage: string
  readonly finishReason?: string

  constructor(init: {
    label: string
    stage: GeminiJsonError["stage"]
    rawExcerpt: string
    parseMessage: string
    finishReason?: string
  }) {
    super(
      `Gemini ${init.label} فشل توليد JSON صالح (${init.stage}): ${init.parseMessage}`,
    )
    this.name = "GeminiJsonError"
    this.label = init.label
    this.stage = init.stage
    this.rawExcerpt = init.rawExcerpt
    this.parseMessage = init.parseMessage
    this.finishReason = init.finishReason
  }
}

/**
 * Best-effort JSON repair: strip markdown fences, remove leading/trailing
 * non-JSON chatter, drop trailing commas, and balance unterminated braces
 * caused by output truncation. Returns `null` when no plausible JSON root
 * can be recovered.
 *
 * This is intentionally conservative — we only fix well-known shapes we have
 * actually seen Gemini emit. Anything weirder falls through to the retry
 * correction call.
 */
export function repairJsonPayload(raw: string): string | null {
  if (!raw) return null
  let s = raw.trim()

  // Strip ```json ... ``` or ``` ... ``` fences. Look for the FIRST fenced
  // block anywhere in the response — not anchored to start/end — so trailing
  // prose after a fenced block still resolves.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fence) s = fence[1].trim()

  // Drop leading prose — jump to the first structural token.
  const firstBrace = s.search(/[{[]/)
  if (firstBrace > 0) s = s.slice(firstBrace)

  // Drop trailing prose after the outermost structure. Walk the string
  // tracking quote + nesting state; when we return to depth 0 with a `}`
  // or `]`, remember that position and continue. The last such "depth 0"
  // closer is the true end of the JSON document — everything after it is
  // prose and must go.
  const depthZeroEnd = ((): number => {
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
      if (ch === "{") stack.push("{")
      else if (ch === "[") stack.push("[")
      else if (ch === "}") {
        if (stack[stack.length - 1] === "{") stack.pop()
        if (stack.length === 0) last = i
      } else if (ch === "]") {
        if (stack[stack.length - 1] === "[") stack.pop()
        if (stack.length === 0) last = i
      }
    }
    return last
  })()
  if (depthZeroEnd >= 0) s = s.slice(0, depthZeroEnd + 1)

  const tryParse = (candidate: string): string | null => {
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      return null
    }
  }

  const stripTrailingCommas = (input: string): string =>
    input.replace(/,(\s*[}\]])/g, "$1")

  // First attempt: the string may already be valid after fence removal.
  const fast = tryParse(stripTrailingCommas(s))
  if (fast) return fast

  /**
   * Walk the string and return (a) whether it ends inside a string literal,
   * (b) the ordered stack of unclosed structural tokens, (c) the index of
   * the last character that is NOT inside an unterminated string — used as
   * the safe truncation point when we ended mid-string.
   */
  const analyze = (
    input: string,
  ): {
    inString: boolean
    stack: Array<"{" | "[">
    /** index (exclusive) up to which the string is structurally safe */
    safeEnd: number
  } => {
    const stack: Array<"{" | "["> = []
    let inString = false
    let escape = false
    let safeEnd = 0
    for (let i = 0; i < input.length; i++) {
      const ch = input[i]
      if (escape) {
        escape = false
        if (!inString) safeEnd = i + 1
        continue
      }
      if (ch === "\\") {
        escape = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        if (!inString) safeEnd = i + 1 // closing quote landed us back outside
        continue
      }
      if (inString) continue
      if (ch === "{") stack.push("{")
      else if (ch === "[") stack.push("[")
      else if (ch === "}") {
        if (stack[stack.length - 1] === "{") stack.pop()
      } else if (ch === "]") {
        if (stack[stack.length - 1] === "[") stack.pop()
      }
      safeEnd = i + 1
    }
    return { inString, stack, safeEnd }
  }

  /**
   * Given a candidate prefix, trim it at the last structural boundary we
   * can safely close. Steps:
   *   1. If we ended inside a string, chop back to `safeEnd`.
   *   2. Strip trailing whitespace/commas.
   *   3. Strip a dangling `"key":value` (or just `"key":`) fragment —
   *      those cannot be closed without inventing a value.
   *   4. Strip a trailing orphan primitive after a comma.
   *   5. Re-analyze and append closers in the REVERSE of the open stack.
   *   6. Strip trailing commas one more time and try parsing.
   */
  const attemptRepair = (input: string): string | null => {
    const { inString, safeEnd } = analyze(input)
    let work = inString ? input.slice(0, safeEnd) : input

    const trimTail = (v: string): string => {
      let out = v.replace(/[,\s]+$/, "")
      for (let iter = 0; iter < 4; iter++) {
        // Key:value fragment like `,"foo": "bar` or `,"foo":`
        const kv = out.match(
          /,\s*"[^"\\]*"\s*:\s*(?:"[^"\\]*"|-?\d+(?:\.\d+)?|true|false|null|)\s*$/,
        )
        if (kv && kv.index !== undefined) {
          out = out.slice(0, kv.index).replace(/[,\s]+$/, "")
          continue
        }
        // Orphan value after a comma: `,"foo"` or `,123`.
        const orph = out.match(
          /,\s*(?:"[^"\\]*"|-?\d+(?:\.\d+)?|true|false|null)\s*$/,
        )
        if (orph && orph.index !== undefined) {
          out = out.slice(0, orph.index).replace(/[,\s]+$/, "")
          continue
        }
        // Open-colon with no value: `"foo":`
        const openColon = out.match(/"\s*[^"]*"\s*:\s*$/)
        if (openColon && openColon.index !== undefined) {
          out = out.slice(0, openColon.index).replace(/[,\s]+$/, "")
          continue
        }
        break
      }
      return out
    }

    work = trimTail(work)
    const { stack } = analyze(work) // fresh stack from the trimmed body
    for (let i = stack.length - 1; i >= 0; i--) {
      work += stack[i] === "{" ? "}" : "]"
    }
    return tryParse(stripTrailingCommas(work))
  }

  const repaired = attemptRepair(stripTrailingCommas(s))
  if (repaired) return repaired

  // Last-ditch: iteratively back off one structural token at a time from
  // the tail until either we find a repairable prefix or give up.
  let tail = stripTrailingCommas(s)
  for (let attempt = 0; attempt < 5; attempt++) {
    // Chop everything after the last comma at depth 0 (the top-level boundary
    // we can safely re-close). We approximate by trimming back to the last
    // `},` or `],` and retrying.
    const cut = Math.max(tail.lastIndexOf("},"), tail.lastIndexOf("],"))
    if (cut < 0) break
    tail = tail.slice(0, cut + 1)
    const r = attemptRepair(tail)
    if (r) return r
  }
  return null
}

/**
 * Extract whatever text came back from a Gemini response, tolerating the
 * different SDK shapes and candidate positions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractResponseText(result: any): { text: string; finishReason?: string } {
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

/**
 * Run a structured reasoning call through Gemini with JSON output enforced.
 * Used by the synthesizer and verifier — NO search tool attached here,
 * because those stages must operate strictly over the retrieved corpus.
 *
 * Recovery ladder (in order):
 *   1. Strict `JSON.parse` of the raw response.
 *   2. `repairJsonPayload` — strip fences, balance truncated braces, etc.
 *   3. One retry with a strict correction prompt that feeds the malformed
 *      output back to Gemini and demands valid JSON only.
 *   4. Throw a `GeminiJsonError` carrying stage + truncated raw so the
 *      caller can log it and surface a clean Arabic error to the UI.
 *
 * An optional `validate` callback is run on the parsed object before it's
 * returned — if it rejects, we treat the output as malformed and continue
 * the recovery ladder.
 */
export async function geminiJson<T>(
  system: string,
  user: string,
  label: string,
  temperature = 0.3,
  validate?: (value: unknown) => value is T,
): Promise<T> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({
    model: GEMINI_REASONING_MODEL,
    systemInstruction: system,
    generationConfig: {
      temperature,
      responseMimeType: "application/json",
      // Bounding the output is the single biggest driver of truncation
      // failures. 8k is enough for the synthesizer's richest shape and
      // well within gemini-2.5-flash's limit.
      maxOutputTokens: 8192,
    },
  })

  const logStage = (stage: string, raw: string, detail: string, finishReason?: string) => {
    const excerpt = raw.length > 600 ? raw.slice(0, 600) + "…" : raw
    console.error(
      `[preparation/research] Gemini ${label} ${stage} failed${
        finishReason ? ` (finishReason=${finishReason})` : ""
      }: ${detail}`,
    )
    console.error(`[preparation/research] Gemini ${label} raw excerpt:`, excerpt)
  }

  const accept = (parsed: unknown): T => {
    if (validate && !validate(parsed)) {
      throw new GeminiJsonError({
        label,
        stage: "shape",
        rawExcerpt: "",
        parseMessage: "parsed JSON failed shape validation",
      })
    }
    return parsed as T
  }

  // ── Attempt 1: raw + repair ────────────────────────────────────────────────
  let firstRaw = ""
  let firstFinish: string | undefined
  try {
    const result = await model.generateContent(user)
    const extracted = extractResponseText(result)
    firstRaw = extracted.text
    firstFinish = extracted.finishReason
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new GeminiJsonError({
      label,
      stage: "parse",
      rawExcerpt: "",
      parseMessage: `transport error: ${message}`,
    })
  }

  // 1a: strict parse
  try {
    return accept(JSON.parse(firstRaw))
  } catch (strictErr) {
    const strictMsg = strictErr instanceof Error ? strictErr.message : String(strictErr)

    // 1b: repair + parse
    const repaired = repairJsonPayload(firstRaw)
    if (repaired) {
      try {
        const parsed = JSON.parse(repaired)
        if (!validate || validate(parsed)) {
          console.warn(
            `[preparation/research] Gemini ${label} recovered via JSON repair (finishReason=${firstFinish ?? "n/a"})`,
          )
          return parsed as T
        }
      } catch {
        // fall through to retry
      }
    }
    logStage("strict parse", firstRaw, strictMsg, firstFinish)
  }

  // ── Attempt 2: correction retry ────────────────────────────────────────────
  // Feed the malformed output back to Gemini with a strict correction prompt.
  // We use temperature 0 to maximize determinism and a dedicated system
  // instruction so the model cannot pull in outside knowledge.
  const correctionSystem =
    "أنت محوّل JSON صارم. ستتلقى نصاً هدفه أن يكون JSON لكنه غير صالح. " +
    "مهمتك الوحيدة: إعادة نفس المحتوى بصيغة JSON صحيحة تماماً. " +
    "ممنوع إضافة أي نص خارج الـ JSON، ممنوع markdown، ممنوع شرح. " +
    "إذا كان الأصل مبتوراً (مقطوعاً)، أكمل الحقول الناقصة بقيم فارغة (\"\" أو [] أو null) بدون اختراع محتوى."
  const correctionUser =
    `النص الأصلي أدناه هو محاولة فاشلة لإنتاج JSON. ` +
    `أعد نفس البنية بصيغة JSON صالحة فقط، بدون أي نص إضافي.\n\n` +
    `--- START MALFORMED ---\n${firstRaw.slice(0, 12000)}\n--- END MALFORMED ---`

  try {
    const correctionModel = genAI.getGenerativeModel({
      model: GEMINI_REASONING_MODEL,
      systemInstruction: correctionSystem,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    })
    const result2 = await correctionModel.generateContent(correctionUser)
    const extracted2 = extractResponseText(result2)
    const raw2 = extracted2.text

    // Strict parse on the correction output.
    try {
      const parsed = JSON.parse(raw2)
      if (!validate || validate(parsed)) {
        console.warn(
          `[preparation/research] Gemini ${label} recovered via correction retry`,
        )
        return parsed as T
      }
    } catch {
      // Try one last repair on the correction output.
      const repaired2 = repairJsonPayload(raw2)
      if (repaired2) {
        try {
          const parsed = JSON.parse(repaired2)
          if (!validate || validate(parsed)) {
            console.warn(
              `[preparation/research] Gemini ${label} recovered via correction retry + repair`,
            )
            return parsed as T
          }
        } catch {
          // fall through
        }
      }
      logStage("correction retry", raw2, "still invalid after retry", extracted2.finishReason)
    }

    // Correction returned something but it failed validation — log raw2.
    logStage("correction retry (shape)", raw2, "retry parsed but failed validation", extracted2.finishReason)
    throw new GeminiJsonError({
      label,
      stage: "retry",
      rawExcerpt: raw2.slice(0, 600),
      parseMessage: "correction retry produced invalid JSON",
      finishReason: extracted2.finishReason,
    })
  } catch (err) {
    if (err instanceof GeminiJsonError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new GeminiJsonError({
      label,
      stage: "retry",
      rawExcerpt: firstRaw.slice(0, 600),
      parseMessage: `correction retry threw: ${message}`,
      finishReason: firstFinish,
    })
  }
}
