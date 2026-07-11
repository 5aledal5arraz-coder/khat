import { env } from "@/lib/env"
import { createHash } from "node:crypto"
import OpenAI from "openai"
import { runAiTask } from "@/lib/ai-router"

// ---------------------------------------------------------------------------
// Prompt versioning
// ---------------------------------------------------------------------------
export const STUDIO_PROMPT_VERSION = "v3"
export const ANALYZER_PROMPT_VERSION = "v1"

// ---------------------------------------------------------------------------
// Model specialization
// ---------------------------------------------------------------------------

/**
 * Fast model for structural extraction: timestamps, chapters, clips, metadata.
 * Kept in sync with the AI-router registry (`structural` task kind) — the
 * registry is authoritative; this constant survives as a telemetry label
 * for legacy tables.
 */
export const STRUCTURE_MODEL = "gpt-5.6-luna"

/**
 * Deep reasoning model for editorial quality: quotes, ideas, summaries, analysis.
 * Kept in sync with the AI-router registry (`editorial` task kind).
 */
export const EDITORIAL_MODEL = "gpt-5.6-sol"

let client: OpenAI | null = null

export function getClient(): OpenAI {
  if (!client) {
    const apiKey = env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set")
    }
    client = new OpenAI({ apiKey })
  }
  return client
}

// Minimum usable transcript length (chars)
const MIN_TRANSCRIPT_CHARS = 10

// Token-safe transcript limit for a single API call (~8000 words Arabic)
const MAX_TRANSCRIPT_CHARS = 24000

// Maximum chars to feed into summarizer input
const SUMMARIZER_INPUT_CAP = 100000

// Chunk size for positional transcript preparation
const CHUNK_CHARS = 20000

/**
 * If the transcript exceeds the safe limit, ask GPT to summarize it.
 * The summary now processes the FULL transcript by chunking first, then
 * merging chunk summaries into a single coherent condensed version.
 *
 * Returns either the original text or a condensed summary.
 * Throws if the transcript is too short to be usable.
 */
/**
 * Optional EIR context for telemetry. Callers that pass it get
 * ai_runs rows linked to the right episode; legacy callers that
 * pass nothing still work — the run is logged with subject_table set
 * but eir_id null.
 */
export interface PrepEirContext {
  eirId?: string | null
  subjectTable?: string | null
  subjectId?: string | null
}

// ─── Prepared-transcript memo ────────────────────────────────────────────────
//
// The expensive prep paths below (chunk-summarize a >24k-char transcript via
// the AI router) are each called independently by ~8 generators for the SAME
// session transcript. Within one generate-stream run — where steps execute
// sequentially — that repeats the summarization up to ~7×, the single biggest
// token waste in the Studio pipeline.
//
// Memoize by a content hash of the (namespaced) input so the first caller pays
// the cost and every other generator reuses the result. This is also a quality
// win: all generators now derive from the SAME condensation instead of a
// slightly different LLM summary each time. Cache is content-addressed, so an
// edited/re-transcribed episode (different hash) recomputes automatically.
//
// Promises are cached for in-flight dedup across concurrent standalone-endpoint
// calls; a rejected promise is evicted so a later call can retry.

const PREP_CACHE_MAX = 8
const prepCache = new Map<string, Promise<string>>()

function prepCacheKey(namespace: string, text: string): string {
  return `${namespace}:${createHash("sha256").update(text).digest("hex")}`
}

function memoizePrep(key: string, compute: () => Promise<string>): Promise<string> {
  const existing = prepCache.get(key)
  if (existing) {
    // Refresh recency (move to newest) so the LRU eviction is meaningful.
    prepCache.delete(key)
    prepCache.set(key, existing)
    return existing
  }

  const promise = compute().catch((err) => {
    // Never cache a failure — drop it so the next caller recomputes.
    if (prepCache.get(key) === promise) prepCache.delete(key)
    throw err
  })

  prepCache.set(key, promise)
  while (prepCache.size > PREP_CACHE_MAX) {
    const oldest = prepCache.keys().next().value
    if (oldest === undefined) break
    prepCache.delete(oldest)
  }
  return promise
}

/**
 * Prepare a transcript for downstream editorial generation.
 *
 * Migrated to AI Router (Khat Brain Phase 5). The `openai` parameter
 * stays in the signature for backwards compatibility with existing
 * callers that already created a client; internally we route every
 * chunk + final-condensation call through `runAiTask` so each makes
 * its own `ai_runs` row.
 */
export async function prepareTranscript(
  _openai: OpenAI,
  transcript: string,
  eirContext?: PrepEirContext,
): Promise<string> {
  const trimmed = transcript.trim()
  if (trimmed.length < MIN_TRANSCRIPT_CHARS) {
    throw new Error("النص قصير جداً — يجب أن يحتوي على 10 أحرف على الأقل لتوليد المحتوى")
  }

  if (trimmed.length <= MAX_TRANSCRIPT_CHARS) {
    return trimmed
  }

  return memoizePrep(prepCacheKey("flat", trimmed), async () => {
    const fullText = trimmed.slice(0, SUMMARIZER_INPUT_CAP)
    const chunks = splitIntoChunks(fullText, CHUNK_CHARS)

    // Summarize each chunk in parallel — each call writes one ai_runs row.
    const chunkSummaries = await Promise.all(
      chunks.map(async (chunk, idx) => {
        const result = await runAiTask<unknown>({
          taskKind: "structural",
          eirId: eirContext?.eirId ?? null,
          subjectTable: eirContext?.subjectTable ?? "transcript_prep",
          subjectId: eirContext?.subjectId ?? null,
          input: { phase: "chunk_summary", chunkIndex: idx, totalChunks: chunks.length, chars: chunk.length },
          prompt: [
            {
              role: "system",
              content: `أنت مساعد متخصص في تلخيص نصوص بودكاست طويلة.

لخّص هذا الجزء (الجزء ${idx + 1} من ${chunks.length}) مع الحفاظ على:
- جميع المحاور والأفكار الرئيسية
- الاقتباسات والجمل المؤثرة كما هي (حرفياً)
- أسماء الأشخاص والأماكن المذكورة
- ترتيب المواضيع كما وردت

اكتب الملخص بالعربية. كن مفصلاً — لا تحذف أي محور مهم.`,
            },
            { role: "user", content: chunk },
          ],
          providerOptions: { temperature: 0.2 },
        })
        return result.rawText ?? ""
      }),
    )

    const merged = chunkSummaries.filter(Boolean).join("\n\n---\n\n")

    if (merged.length <= MAX_TRANSCRIPT_CHARS) {
      return merged
    }

    // Final condensation pass.
    const finalResult = await runAiTask<unknown>({
      taskKind: "structural",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "transcript_prep",
      subjectId: eirContext?.subjectId ?? null,
      input: { phase: "final_condensation", chars: merged.length },
      prompt: [
        {
          role: "system",
          content: `أنت مساعد متخصص في تلخيص نصوص بودكاست طويلة.

لخّص النص التالي (وهو ملخص مجمّع من أجزاء متعددة) مع الحفاظ على:
- جميع المحاور والأفكار الرئيسية من كل جزء
- الاقتباسات والجمل المؤثرة كما هي
- ترتيب المواضيع الزمني من البداية للنهاية
- أسماء الأشخاص والأماكن المذكورة

اكتب الملخص بالعربية في حدود 4000 كلمة. غطِّ كامل الحلقة من أولها لآخرها.`,
        },
        { role: "user", content: merged.slice(0, SUMMARIZER_INPUT_CAP) },
      ],
      providerOptions: { temperature: 0.2 },
    })

    return finalResult.rawText || merged.slice(0, MAX_TRANSCRIPT_CHARS)
  })
}

/**
 * Prepare a transcript with positional annotations for timestamp-aware generation.
 *
 * Instead of a lossy summary, this splits the full transcript into labeled sections
 * with approximate time positions, so the AI can place chapters/clips across the
 * entire episode duration.
 *
 * Each section is labeled like:
 *   [الجزء 3/8 — تقريباً من الدقيقة 22 إلى الدقيقة 33]
 *
 * This preserves temporal awareness that a flat summary destroys.
 */
/**
 * Migrated to AI Router (Khat Brain Phase 5). Each positional-chunk
 * call writes its own ai_runs row.
 */
export async function prepareTranscriptWithPositions(
  _openai: OpenAI,
  transcript: string,
  durationSeconds: number | null,
  eirContext?: PrepEirContext,
): Promise<string> {
  const trimmed = transcript.trim()
  if (trimmed.length < MIN_TRANSCRIPT_CHARS) {
    throw new Error("النص قصير جداً — يجب أن يحتوي على 10 أحرف على الأقل لتوليد المحتوى")
  }

  if (trimmed.length <= MAX_TRANSCRIPT_CHARS) {
    return trimmed
  }

  // Output depends on durationSeconds (it drives the per-chunk time labels),
  // so it's part of the cache namespace.
  return memoizePrep(prepCacheKey(`pos:${durationSeconds ?? "auto"}`, trimmed), async () => {
    const fullText = trimmed.slice(0, SUMMARIZER_INPUT_CAP)
    const chunks = splitIntoChunks(fullText, CHUNK_CHARS)
    const totalChunks = chunks.length
    const totalDuration = durationSeconds || estimateDurationFromChars(fullText.length)

    const chunkSummaries = await Promise.all(
      chunks.map(async (chunk, idx) => {
        const startMin = Math.round((idx / totalChunks) * totalDuration / 60)
        const endMin = Math.round(((idx + 1) / totalChunks) * totalDuration / 60)
        const posLabel = `[الجزء ${idx + 1}/${totalChunks} — تقريباً من الدقيقة ${startMin} إلى الدقيقة ${endMin}]`

        const result = await runAiTask<unknown>({
          taskKind: "structural",
          eirId: eirContext?.eirId ?? null,
          subjectTable: eirContext?.subjectTable ?? "transcript_prep_positional",
          subjectId: eirContext?.subjectId ?? null,
          input: {
            phase: "positional_chunk_summary",
            chunkIndex: idx,
            totalChunks,
            startMin,
            endMin,
            chars: chunk.length,
          },
          prompt: [
            {
              role: "system",
              content: `أنت مساعد متخصص في تلخيص أجزاء من نصوص بودكاست.

لخّص هذا الجزء ${posLabel} مع الحفاظ على:
- كل المواضيع والأفكار المطروحة (لا تحذف أي محور)
- الاقتباسات المؤثرة كما هي حرفياً
- أسماء الأشخاص والأماكن المذكورة
- اللحظات العاطفية أو المهمة
- التحولات في الموضوع

اكتب بالعربية. كن مفصلاً قدر الإمكان.`,
            },
            { role: "user", content: chunk },
          ],
          providerOptions: { temperature: 0.2 },
        })

        const summary = result.rawText ?? ""
        return `${posLabel}\n${summary}`
      }),
    )

    return chunkSummaries.filter(Boolean).join("\n\n")
  })
}

/**
 * Split text into chunks at word boundaries.
 */
function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + chunkSize

    if (end >= text.length) {
      chunks.push(text.slice(start).trim())
      break
    }

    // Find last space within the chunk to avoid splitting mid-word
    const lastSpace = text.lastIndexOf(" ", end)
    if (lastSpace > start) {
      end = lastSpace
    }

    chunks.push(text.slice(start, end).trim())
    start = end + 1
  }

  return chunks.filter(Boolean)
}

/**
 * Rough estimate: 1 char of Arabic ≈ 0.04s of speech
 * (average Arabic speaker: ~150 words/min, ~5 chars/word)
 */
function estimateDurationFromChars(chars: number): number {
  return Math.round(chars * 0.04)
}

/**
 * Format seconds to HH:MM:SS string.
 */
export function formatSecondsToTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

/**
 * Parse HH:MM:SS or MM:SS to total seconds.
 */
export function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

/**
 * Safe JSON parser for AI responses.
 * Returns a typed result or a clean Arabic error message.
 */
export function safeParseJSON<T = unknown>(
  raw: string | null | undefined,
  label?: string
): { success: true; data: T } | { success: false; error: string } {
  if (!raw) {
    return { success: false, error: label ? `لم يتم الحصول على استجابة من OpenAI (${label})` : "لم يتم الحصول على استجابة من OpenAI" }
  }
  try {
    const data = JSON.parse(raw) as T
    return { success: true, data }
  } catch {
    console.error(`[safeParseJSON] failed to parse${label ? ` (${label})` : ""}:`, raw.slice(0, 200))
    return { success: false, error: "فشل في تحليل استجابة الذكاء الاصطناعي — الرجاء المحاولة مرة أخرى" }
  }
}
