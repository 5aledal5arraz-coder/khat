/**
 * Phase X Step 2 — Original Thinking generator.
 *
 *   generateOriginalTopics({ language, count, seasonId?, excludedTitles?,
 *                            allowKuwaitBias?, lensKeys? })
 *
 * Single AI call (`editorial` task kind → gpt-4o). Asks the model to
 * produce N topics drawn from the editorial lens registry. Outputs are
 * judged by `novelty.judgeCandidate`; rejected candidates are dropped
 * with reasons logged.
 *
 * IMPORTANT: this layer NEVER reads market_topic_signals or
 * market_topic_clusters. The Hybrid Generator (Step 3) does that.
 *
 * One AI call per generation request. We pass excludedTitles + lens
 * descriptions as context. We do NOT retry on partial rejection — the
 * job logs the rejected outputs and accepts whatever survives, so the
 * editor can call "generate again" if the yield is low.
 */

import { runAiTask } from "@/lib/ai-router"
import { buildOriginalThinkingPrompt } from "@/lib/ai/prompts/original-thinking"
import { loadLenses, type EditorialLens } from "./lenses"
import {
  judgeCandidate,
  type CandidateTopic,
  type NoveltyContext,
  type RejectionReason,
  REJECTION_RULES,
} from "./novelty"
import {
  insertOriginalTopics,
  getExistingTitles,
  type OriginalThinkingTopic,
} from "./bank"

export interface GenerateRequest {
  language: "ar" | "en"
  count: number
  /** Optional EIR/season scope for telemetry. */
  seasonId?: string | null
  /** Additional titles to exclude beyond what is already in the bank. */
  excludedTitles?: string[]
  /** Default false — set true ONLY if the editor explicitly wants Kuwait. */
  allowKuwaitBias?: boolean
  /** Restrict generation to a subset of lens keys. */
  lensKeys?: string[]
}

export interface GenerateResult {
  ok: boolean
  ai_run_id: string | null
  asked: number
  accepted: OriginalThinkingTopic[]
  rejected: Array<{
    candidate: CandidateTopic
    reasons: RejectionReason[]
  }>
  /** Lenses sampled by the generator on this call. */
  lenses_used: string[]
  language: string
  used_market_data: false
}

export async function generateOriginalTopics(
  req: GenerateRequest,
): Promise<GenerateResult> {
  const lenses = await loadLenses()
  const eligibleLenses = req.lensKeys?.length
    ? lenses.filter((l) => req.lensKeys!.includes(l.key))
    : lenses
  if (eligibleLenses.length === 0) {
    return {
      ok: false,
      ai_run_id: null,
      asked: req.count,
      accepted: [],
      rejected: [],
      lenses_used: [],
      language: req.language,
      used_market_data: false,
    }
  }

  // Build the exclusion set: bank titles + caller-supplied exclusions.
  const bankTitles = await getExistingTitles(req.language)
  const excludedTitles = unique([...bankTitles, ...(req.excludedTitles ?? [])])
  const validLensKeys = new Set(eligibleLenses.map((l) => l.key))

  const ai = await callEditorialModel({
    language: req.language,
    count: req.count,
    lenses: eligibleLenses,
    excludedTitles,
    allowKuwaitBias: !!req.allowKuwaitBias,
    seasonId: req.seasonId ?? null,
  })
  const ai_run_id = ai.runId

  // If the call failed entirely, return early — no inserts.
  if (ai.status !== "succeeded" || !ai.parsed?.topics) {
    return {
      ok: false,
      ai_run_id,
      asked: req.count,
      accepted: [],
      rejected: [],
      lenses_used: eligibleLenses.map((l) => l.key),
      language: req.language,
      used_market_data: false,
    }
  }

  const ctx: NoveltyContext = {
    excludedTitles,
    validLensKeys,
    allowKuwaitBias: !!req.allowKuwaitBias,
  }
  const accepted: CandidateTopic[] = []
  const rejected: GenerateResult["rejected"] = []
  const seenInBatch = new Set<string>()

  for (const c of ai.parsed.topics) {
    // Coerce types — we trust nothing from the model.
    const candidate: CandidateTopic = {
      title: String(c.title ?? "").trim(),
      lens: String(c.lens ?? "").trim(),
      philosophical_frame: String(c.philosophical_frame ?? "").trim(),
      conflict: String(c.conflict ?? "").trim(),
      emotional_hook: String(c.emotional_hook ?? "").trim(),
    }
    // In-batch dedup (the model sometimes repeats inside one response).
    const norm = candidate.title.toLowerCase()
    if (seenInBatch.has(norm)) {
      rejected.push({ candidate, reasons: ["duplicate_title"] })
      continue
    }
    const decision = judgeCandidate(candidate, ctx)
    if (!decision.ok) {
      rejected.push({ candidate, reasons: decision.reasons })
      continue
    }
    seenInBatch.add(norm)
    accepted.push(candidate)
  }

  // Persist accepted candidates only.
  const insertedRows = await insertOriginalTopics(
    accepted.map((c) => ({ ...c, language: req.language })),
  )

  return {
    ok: true,
    ai_run_id,
    asked: req.count,
    accepted: insertedRows,
    rejected,
    lenses_used: eligibleLenses.map((l) => l.key),
    language: req.language,
    used_market_data: false,
  }
}

// ─── AI call ───────────────────────────────────────────────────────────

interface CallArgs {
  language: "ar" | "en"
  count: number
  lenses: EditorialLens[]
  excludedTitles: string[]
  allowKuwaitBias: boolean
  seasonId: string | null
}
interface RawTopic {
  title?: string
  lens?: string
  philosophical_frame?: string
  conflict?: string
  emotional_hook?: string
}

async function callEditorialModel(args: CallArgs) {
  // Phase 0 — prompt now built by the consolidated builder so the
  // wording lives in one place and ai_runs.prompt_version is meaningful.
  // The output is byte-equivalent to the previous inline code.
  const { system, user, version } = buildOriginalThinkingPrompt({
    language: args.language,
    count: args.count,
    lenses: args.lenses,
    excludedTitles: args.excludedTitles,
    allowKuwaitBias: args.allowKuwaitBias,
  })

  return await runAiTask<{ topics: RawTopic[] }>({
    taskKind: "editorial",
    subjectTable: "original_thinking_topics",
    subjectId: args.seasonId ?? null,
    promptVersion: version,
    input: {
      language: args.language,
      count: args.count,
      lens_keys: args.lenses.map((l) => l.key),
      exclusions: args.excludedTitles.length,
      allow_kuwait_bias: args.allowKuwaitBias,
    },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.85 },
  })
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

// Re-export for the smoke + UI.
export { REJECTION_RULES }
