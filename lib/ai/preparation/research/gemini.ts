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

import type { GenerativeModel } from "@google/generative-ai"
import type { RawRetrievedSource } from "./types"
import {
  getGeminiClient,
  isGeminiConfigured,
  GEMINI_RETRIEVAL_MODEL,
  GEMINI_REASONING_MODEL,
} from "@/lib/ai/gemini"
import {
  repairTruncatedJson,
  sanitizeJsonResponse,
} from "@/lib/ai/json-repair"

// Client + model defaults now live in lib/ai/gemini.ts (shared with the
// AI Router adapter and channel analysis). Re-export so existing callers
// keep importing from here.
export { getGeminiClient, isGeminiConfigured }

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
 * Best-effort JSON repair. The string-level implementation now lives in
 * lib/ai/json-repair.ts (shared with the khat-map hardened helper).
 * Order: truncation-aware repair first (the dominant failure mode here
 * is MAX_TOKENS cutoff), then aggressive sanitization for dirty-but-
 * complete payloads. Returns `null` when no plausible JSON root can be
 * recovered — the caller falls through to the retry correction call.
 */
export function repairJsonPayload(raw: string): string | null {
  const repaired = repairTruncatedJson(raw)
  if (repaired) return repaired
  const sanitized = sanitizeJsonResponse(raw)
  if (sanitized) {
    try {
      JSON.parse(sanitized)
      return sanitized
    } catch {
      return null
    }
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
