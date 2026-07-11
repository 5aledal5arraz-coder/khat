/**
 * Benchmark executor — runs the 9-dimension suite for candidate vs
 * baseline and writes the scorecard to model_benchmarks.
 *
 * Suite (uniform across tiers; tier only changes aggregation weights):
 *   extraction ×3     — chapters/quotes/guest JSON from the medium
 *                       transcript; run #1 grades accuracy, all 3 grade
 *                       consistency. Planted-fact matching, no judge.
 *   long_context ×1   — 5 needles + 1 ordering question over a ~35k-char
 *                       document. Exact matching.
 *   discovery ×1      — propose & rank 8 guests for a topic.   (judged)
 *   editorial ×1      — titles + hero summary from transcript.  (judged)
 *   research ×1       — synthesis brief w/ citations from snippets. (judged)
 *   cost / latency / token_efficiency — measured off the same calls.
 *
 * Judging is blind pairwise (A/B then B/A to cancel position bias) with a
 * pinned judge model, following the lib/evals "pairwise > absolute" rule.
 *
 * ~20 AI calls total per run. Never throws — failures land on the row as
 * status="failed" with the error message.
 */

import { runAiTask } from "@/lib/ai-router/router"
import type { AiTaskKind } from "@/lib/ai-router/types"
import type { BenchmarkTier } from "@/lib/db/schema/model-benchmarks"
import {
  buildMediumTranscript,
  buildLongDocument,
  DISCOVERY_TOPIC,
  RESEARCH_SNIPPETS,
  NEEDLES,
  ORDER_QUESTION,
} from "./fixtures"
import {
  gradeExtraction,
  gradeConsistency,
  gradeLongContext,
  candidateWinShare,
  buildScorecard,
  decide,
  type JudgedKey,
  type JudgeVerdict,
  type BenchmarkSummary,
} from "./scoring"
import {
  createBenchmarkRow,
  finishBenchmarkRow,
  readBenchmarkThresholds,
} from "./store"
import { FALLBACK_CHAINS } from "@/lib/ai-router/registry"

export const SUITE_VERSION = "bench-v1"
/** Pinned judge — recorded on every row so scorecards stay auditable. */
export const BENCHMARK_JUDGE_MODEL = "gpt-5.6-sol"

/** Which production default each tier's benchmark defends. */
export const TIER_BASELINE_TASK: Record<BenchmarkTier, AiTaskKind> = {
  flagship: "editorial",
  balanced: "research",
  efficient: "structural",
}

export function tierBaselineModel(tier: BenchmarkTier): string {
  return FALLBACK_CHAINS[TIER_BASELINE_TASK[tier]][0]
}

/** Suffix heuristic: which tier a newly-discovered model likely targets. */
export function tierForCandidate(modelId: string): BenchmarkTier {
  if (/(-luna|-mini|-nano)$/.test(modelId)) return "efficient"
  if (/-terra$/.test(modelId)) return "balanced"
  return "flagship" // -sol, -pro, bare gpt-X.Y, unknown suffixes
}

// ─── Model + judge calls ─────────────────────────────────────────────────────

interface CallMetrics {
  latencies: number[]
  costs: Array<number | null>
  tokensOut: number
}

interface ModelRun {
  rawText: string | null
  parsed: unknown
  ok: boolean
}

async function callModel(
  model: string,
  taskKind: AiTaskKind,
  benchmarkId: string,
  prompt: string,
  metrics: CallMetrics,
  timeoutMs = 240_000,
): Promise<ModelRun> {
  const r = await runAiTask({
    taskKind,
    preferredModel: model,
    input: { benchmark: SUITE_VERSION, task: taskKind },
    prompt,
    expectJson: true,
    timeoutMs,
    maxRetries: 1,
    bypassRateLimit: true,
    actorId: "model-benchmark",
    subjectTable: "model_benchmarks",
    subjectId: benchmarkId,
  })
  metrics.latencies.push(r.latencyMs)
  metrics.costs.push(r.costUsd)
  metrics.tokensOut += r.tokensOut ?? 0
  return { rawText: r.rawText, parsed: r.parsed, ok: r.status === "succeeded" && r.parsed !== null }
}

interface JudgeCriteria {
  task: string
  input: string
}

async function judgePair(
  benchmarkId: string,
  spec: JudgeCriteria,
  outputA: string,
  outputB: string,
): Promise<JudgeVerdict> {
  const r = await runAiTask({
    taskKind: "verification",
    preferredModel: BENCHMARK_JUDGE_MODEL,
    providerOptions: { reasoningEffort: "high" },
    input: { benchmark: SUITE_VERSION, judge: spec.task },
    prompt: [
      {
        role: "system",
        content:
          "أنت حكم تحريري صارم لبودكاست عربي معياره: عمق، أصالة، دقة لغوية، واحترام ذكاء المستمع. " +
          "ستقارن مخرجين (A وB) لنفس المهمة دون معرفة مصدرهما. " +
          'أجب بصيغة JSON فقط: {"winner": "A" | "B" | "tie", "rationale": "سطر واحد"}. ' +
          "اختر tie فقط عند تعادل حقيقي.",
      },
      {
        role: "user",
        content:
          `المهمة: ${spec.task}\n\nالمدخل المشترك (مختصر):\n${spec.input}\n\n` +
          `── المخرج A ──\n${outputA.slice(0, 6000)}\n\n── المخرج B ──\n${outputB.slice(0, 6000)}\n\n` +
          'أعد JSON: {"winner": ..., "rationale": ...}',
      },
    ],
    expectJson: true,
    timeoutMs: 120_000,
    maxRetries: 1,
    bypassRateLimit: true,
    actorId: "model-benchmark-judge",
    subjectTable: "model_benchmarks",
    subjectId: benchmarkId,
  })
  const w = (r.parsed as { winner?: unknown } | null)?.winner
  return w === "A" || w === "B" ? w : "tie"
}

/** Blind pairwise, both orders. Returns candidate win share 0..1 (null when
 *  both sides failed to produce output). */
async function judgeTask(
  benchmarkId: string,
  spec: JudgeCriteria,
  baseline: ModelRun,
  candidate: ModelRun,
): Promise<number | null> {
  if (!baseline.ok && !candidate.ok) return null
  if (!candidate.ok) return 0 // candidate failed the task outright
  if (!baseline.ok) return 1
  const candText = candidate.rawText ?? ""
  const baseText = baseline.rawText ?? ""
  const [candidateIsA, candidateIsB] = await Promise.all([
    judgePair(benchmarkId, spec, candText, baseText),
    judgePair(benchmarkId, spec, baseText, candText),
  ])
  return candidateWinShare(candidateIsA, candidateIsB)
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

function extractionPrompt(transcript: string): string {
  return (
    "من النص التالي لحلقة بودكاست، استخرج JSON بالبنية:\n" +
    '{"guest_name": "...", "chapters": [{"title": "..."}], "quotes": ["...", "...", "..."]}\n' +
    "الشروط: من 3 إلى 8 فصول بعناوين عربية موجزة، وثلاثة اقتباسات منقولة حرفياً كما وردت في النص دون أي تعديل.\n\n" +
    `النص:\n${transcript}`
  )
}

function longContextPrompt(doc: string): string {
  const questions = [...NEEDLES.map((n) => n.question), ORDER_QUESTION.question]
  return (
    "اقرأ الوثيقة الطويلة التالية ثم أجب عن الأسئلة الستة بدقة من الوثيقة نفسها.\n" +
    'أعد JSON فقط: {"answers": ["...", "...", "...", "...", "...", "..."]} بترتيب الأسئلة.\n\n' +
    `الأسئلة:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n` +
    `الوثيقة:\n${doc}`
  )
}

function discoveryPrompt(): string {
  return (
    `اقترح 8 ضيوف حقيقيين محتملين لحلقة بودكاست عربية عن: «${DISCOVERY_TOPIC}».\n` +
    "رتّبهم من الأنسب إلى الأقل، ولكل ضيف: الاسم بالعربية، الدور/الصفة، وسطر واحد يشرح لماذا هو مناسب لهذا الموضوع تحديداً.\n" +
    'أعد JSON فقط: {"candidates": [{"name": "...", "role": "...", "why": "..."}]}'
  )
}

function editorialPrompt(transcript: string): string {
  return (
    "من نص الحلقة التالي، اكتب حزمة تحريرية بالعربية:\n" +
    '{"titles": ["ثلاثة عناوين مقترحة"], "hero_summary": "ملخص جذاب من 60 إلى 100 كلمة"}\n' +
    "المعيار: عمق وصدق بلا عناوين مبتذلة أو مبالغات تسويقية. أعد JSON فقط.\n\n" +
    `النص:\n${transcript}`
  )
}

function researchPrompt(): string {
  const snippets = RESEARCH_SNIPPETS.map((s) => `[${s.id}] ${s.text}`).join("\n\n")
  return (
    "لخّص المقتطفات البحثية التالية في موجز تحضيري لمقدم بودكاست (150-220 كلمة) يمهّد لحوار عميق، " +
    "مع ذكر معرفات المصادر التي استندت إليها.\n" +
    'أعد JSON فقط: {"brief": "...", "citations": ["S1", ...]}\n\n' +
    `المقتطفات:\n${snippets}`
  )
}

// ─── The run ─────────────────────────────────────────────────────────────────

export interface RunBenchmarkArgs {
  tier: BenchmarkTier
  candidateModel: string
  baselineModel?: string
  triggeredBy: "manual" | "auto-discovery" | "cli"
  /** Reuse an existing row (job path); otherwise a row is created. */
  benchmarkId?: string
}

export async function runModelBenchmark(args: RunBenchmarkArgs): Promise<{
  id: string
  status: "completed" | "failed"
  summary: BenchmarkSummary | null
}> {
  const baseline = args.baselineModel ?? tierBaselineModel(args.tier)
  const id =
    args.benchmarkId ??
    (await createBenchmarkRow({
      tier: args.tier,
      baseline_model: baseline,
      candidate_model: args.candidateModel,
      suite_version: SUITE_VERSION,
      triggered_by: args.triggeredBy,
    }))

  const baseMetrics: CallMetrics = { latencies: [], costs: [], tokensOut: 0 }
  const candMetrics: CallMetrics = { latencies: [], costs: [], tokensOut: 0 }

  try {
    const transcript = buildMediumTranscript()
    const longDoc = buildLongDocument()
    const thresholds = await readBenchmarkThresholds()

    const pair = (taskKind: AiTaskKind, prompt: string, timeoutMs?: number) =>
      Promise.all([
        callModel(baseline, taskKind, id, prompt, baseMetrics, timeoutMs),
        callModel(args.candidateModel, taskKind, id, prompt, candMetrics, timeoutMs),
      ])

    // Extraction ×3 (also feeds consistency), sequential to keep load sane.
    const exPrompt = extractionPrompt(transcript)
    const ex1 = await pair("structural", exPrompt)
    const ex2 = await pair("structural", exPrompt)
    const ex3 = await pair("structural", exPrompt)

    const [longCtx, discovery, editorial, research] = [
      await pair("research", longContextPrompt(longDoc), 300_000),
      await pair("discovery", discoveryPrompt()),
      await pair("editorial", editorialPrompt(transcript)),
      await pair("research", researchPrompt()),
    ]

    // Judged dimensions (blind pairwise, both orders, in parallel).
    const inputBrief = (s: string) => s.slice(0, 1200)
    const [discoveryShare, editorialShare, researchShare] = await Promise.all([
      judgeTask(
        id,
        { task: `اقتراح وترتيب ضيوف لموضوع: ${DISCOVERY_TOPIC}`, input: "الموضوع أعلاه — قيّم الوجاهة والتنوع وقوة المواءمة." },
        discovery[0],
        discovery[1],
      ),
      judgeTask(
        id,
        { task: "حزمة تحريرية (عناوين + ملخص) من نص حلقة", input: inputBrief(transcript) },
        editorial[0],
        editorial[1],
      ),
      judgeTask(
        id,
        {
          task: "موجز بحثي تحضيري من مقتطفات مصادر (قيّم التغطية والأمانة للمصادر)",
          input: RESEARCH_SNIPPETS.map((s) => `[${s.id}] ${s.text}`).join("\n"),
        },
        research[0],
        research[1],
      ),
    ])

    const judged: Record<JudgedKey, number | null> = {
      discovery: discoveryShare,
      editorial: editorialShare,
      research: researchShare,
    }

    const median = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b)
      return s.length ? s[Math.floor(s.length / 2)] : 0
    }
    const totalCost = (cs: Array<number | null>) =>
      cs.some((c) => c === null) ? null : cs.reduce((a: number, b) => a + (b ?? 0), 0)

    const { dimensions, aggregates } = buildScorecard({
      tier: args.tier,
      judged,
      programmatic: {
        extraction: {
          baseline: gradeExtraction(ex1[0].parsed),
          candidate: gradeExtraction(ex1[1].parsed),
        },
        long_context: {
          baseline: gradeLongContext(longCtx[0].parsed),
          candidate: gradeLongContext(longCtx[1].parsed),
        },
        consistency: {
          baseline: gradeConsistency([ex1[0].parsed, ex2[0].parsed, ex3[0].parsed]),
          candidate: gradeConsistency([ex1[1].parsed, ex2[1].parsed, ex3[1].parsed]),
        },
      },
      measured: {
        cost: { baseline: totalCost(baseMetrics.costs), candidate: totalCost(candMetrics.costs) },
        latencyMs: { baseline: median(baseMetrics.latencies), candidate: median(candMetrics.latencies) },
        tokensOut: { baseline: baseMetrics.tokensOut, candidate: candMetrics.tokensOut },
      },
    })

    const decision = decide(aggregates, thresholds)
    const summary: BenchmarkSummary = { ...aggregates, ...decision }

    await finishBenchmarkRow(id, {
      status: "completed",
      scores: { dimensions },
      summary,
      thresholds,
      judge_model: BENCHMARK_JUDGE_MODEL,
      error: null,
    })
    return { id, status: "completed", summary }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finishBenchmarkRow(id, { status: "failed", error: message }).catch(() => {})
    return { id, status: "failed", summary: null }
  }
}
