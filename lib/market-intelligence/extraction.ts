/**
 * Phase X Step 1 — extract theme + emotional_trigger + controversy_score
 * from raw market signals via the AI router.
 *
 * Batch-oriented for cost: a single ai_runs row processes up to N items
 * at once. The AI router writes the ai_runs entry automatically.
 *
 * Strict closed vocabulary so cluster keys are stable across runs.
 */

import { eq, isNull, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { marketTopicSignals } from "@/lib/db/schema/market-intelligence"
import { runAiTask } from "@/lib/ai-router"

export const THEME_VOCAB = [
  "relationships",
  "success",
  "money",
  "loneliness",
  "childhood",
  "identity",
  "religion",
  "philosophy",
  "psychology",
  "social_media",
  "technology",
  "betrayal",
  "family",
  "masculinity",
  "failure",
  "mental_health",
  "grief",
  "other",
] as const

export const EMOTION_VOCAB = [
  "fear",
  "longing",
  "anger",
  "shame",
  "hope",
  "awe",
  "disgust",
  "curiosity",
  "pride",
  "none",
] as const

interface ExtractionRow {
  id: string
  title: string
  description: string | null
  language: string
}

interface ExtractedFields {
  theme: string | null
  emotional_trigger: string | null
  controversy_score: number | null
}

// Index signature widens this type to match the job-registry constraint
// (`JobHandler<P extends Record<string, unknown>, R extends Record<string, unknown>>`).
// Fields stay strictly typed; the index signature is purely structural.
export interface ExtractionResult extends Record<string, unknown> {
  scanned: number
  processed: number
  ai_run_ids: string[]
}

export async function extractPendingSignals(opts?: {
  batchSize?: number
  limit?: number
}): Promise<ExtractionResult> {
  const batchSize = opts?.batchSize ?? 10
  const limit = opts?.limit ?? 50

  const rows = await db!
    .select({
      id: marketTopicSignals.id,
      title: marketTopicSignals.title,
      description: marketTopicSignals.description,
      language: marketTopicSignals.language,
    })
    .from(marketTopicSignals)
    .where(isNull(marketTopicSignals.theme))
    .limit(limit)

  let processed = 0
  const ai_run_ids: string[] = []
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { extracted, runId } = await extractBatch(batch)
    if (runId) ai_run_ids.push(runId)
    for (let j = 0; j < batch.length; j++) {
      const e = extracted[j]
      if (!e) continue
      await db!
        .update(marketTopicSignals)
        .set({
          theme: e.theme,
          emotional_trigger: e.emotional_trigger,
          controversy_score: e.controversy_score,
        })
        .where(eq(marketTopicSignals.id, batch[j].id))
      processed++
    }
  }
  return { scanned: rows.length, processed, ai_run_ids }
}

interface BatchExtractionOutcome {
  extracted: Array<ExtractedFields | null>
  runId: string | null
}

async function extractBatch(batch: ExtractionRow[]): Promise<BatchExtractionOutcome> {
  if (batch.length === 0) return { extracted: [], runId: null }

  const items = batch.map((r, idx) => ({
    idx,
    title: r.title.slice(0, 220),
    description: (r.description ?? "").slice(0, 280),
    language: r.language,
  }))

  const system = [
    "You analyze podcast/video titles for editorial signals.",
    "Return JSON with key 'items', an array of objects each containing:",
    `  idx: integer (matches input)`,
    `  theme: one of ${THEME_VOCAB.join(", ")}`,
    `  emotional_trigger: one of ${EMOTION_VOCAB.join(", ")}`,
    `  controversy_score: real in [0,1]; 0 = neutral, 1 = highly controversial`,
    "Be precise. If unsure, use 'other' / 'none' / 0. Never invent.",
  ].join("\n")

  const result = await runAiTask<{
    items: Array<{
      idx: number
      theme?: string
      emotional_trigger?: string
      controversy_score?: number
    }>
  }>({
    taskKind: "structural",
    subjectTable: "market_topic_signals",
    subjectId: batch.map((b) => b.id).join(","),
    input: { count: batch.length, language: batch[0]?.language ?? "ar" },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ items }) },
    ],
    expectJson: true,
  })

  const out: Array<ExtractedFields | null> = batch.map(() => null)
  if (result.status !== "succeeded" || !result.parsed?.items) {
    return { extracted: out, runId: result.runId }
  }
  for (const it of result.parsed.items) {
    if (typeof it.idx !== "number" || it.idx < 0 || it.idx >= batch.length) continue
    const theme = clampVocab(it.theme, THEME_VOCAB, "other")
    const trigger = clampVocab(it.emotional_trigger, EMOTION_VOCAB, "none")
    const score =
      typeof it.controversy_score === "number"
        ? Math.max(0, Math.min(1, it.controversy_score))
        : null
    out[it.idx] = {
      theme,
      emotional_trigger: trigger,
      controversy_score: score,
    }
  }
  return { extracted: out, runId: result.runId }
}

/** Snap to the closed vocabulary; default when AI invents a value. */
function clampVocab<T extends readonly string[]>(
  value: string | undefined,
  vocab: T,
  fallback: T[number],
): T[number] {
  if (!value) return fallback
  const v = value.toLowerCase().trim()
  return (vocab as readonly string[]).includes(v) ? (v as T[number]) : fallback
}

/**
 * Direct, AI-free extraction path used by the smoke when OPENAI_API_KEY
 * is unset. NEVER call from production code.
 */
export async function applyMockedExtraction(
  rowIds: string[],
  patch: ExtractedFields,
): Promise<number> {
  if (rowIds.length === 0) return 0
  const r = await db!
    .update(marketTopicSignals)
    .set({
      theme: patch.theme,
      emotional_trigger: patch.emotional_trigger,
      controversy_score: patch.controversy_score,
    })
    .where(inArray(marketTopicSignals.id, rowIds))
    .returning({ id: marketTopicSignals.id })
  return r.length
}
