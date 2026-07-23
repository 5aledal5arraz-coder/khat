/**
 * Regression — editorial enrichment must never report coverage it did not
 * achieve, and must never hang the synchronous «توليد» request.
 *
 * REPRODUCED FAILURES (local runs, season 5e014eb1-… / ae2cae07-…):
 *   1. `enrichTopicsEditorially` asked ONE AI call to enrich SIX topics. The
 *      model returned a SINGLE object; five topics persisted NULL across every
 *      editorial column while the panel printed «تم توليد 6 مرشّحاً».
 *      (ai_runs 2dfb5bd2-…: status=succeeded, tokens_out=1475, parsed = lone obj.)
 *   2. That same batch call carried NO timeoutMs, so it inherited the router
 *      default 120s × 3 = 361s and TIMED OUT the request.
 *      (ai_runs, run 2: status=timed_out, latency 361.9s — the 120×3 signature.)
 *
 * The module now runs ONE call PER TOPIC, so:
 *   - a lone object is the CORRECT answer for a single-topic call (fixes #1 at
 *     the root — output truncation is impossible for one topic),
 *   - each call carries an explicit 90s timeout (fixes #2),
 *   - a single topic that fails to enrich degrades exactly ONE card and is
 *     counted precisely in `missingIndexes`,
 *   - and no call is launched past the wall-clock deadline.
 *
 * These tests drive the mocked model per-topic and assert every one of those.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const runAiTaskMock = vi.fn()
vi.mock("@/lib/ai-router", () => ({
  runAiTask: (args: unknown) => runAiTaskMock(args),
}))

import { enrichTopicsEditorially } from "@/lib/khat-map/v2/editorial-enrich"
import type { EnrichTopicInput } from "@/lib/khat-map/v2/prompts-enrich"

/** One fully-formed enriched object, exactly the shape the model returns. */
function enrichedObject(index: number): Record<string, unknown> {
  return {
    index,
    category: "culture",
    subcategory: "food_culture",
    lenses: ["hidden_shame"],
    titles: { premium: "عنوان", recommended: "premium", recommended_reason: "سبب" },
    main_axes: ["محور أول", "محور ثانٍ"],
    suggested_questions: ["سؤال أول", "سؤال ثانٍ", "سؤال ثالث"],
    debate_axis: "محور الجدل",
    viral_angle: "زاوية الانتشار",
    regional_note: "ملاءمة خليجية",
    global_note: "صلة عالمية",
    why_this_topic: "لماذا هذا الموضوع",
    success: {
      click_potential: 8, retention_potential: 8, discussion_potential: 8,
      shareability: 8, guest_potential: 8, sponsor_appeal: 8,
      timeless_value: 8, regional_relevance: 8, global_relevance: 8,
      brand_alignment: 8, originality: 8, depth: 8,
      risk_calibration: 8, production_feasibility: 8,
    },
    why_succeed: "لأنها قريبة",
    why_fail: "قد تبدو عامة",
    is_overdone: false,
    reference_potential: true,
    clip_potential: true,
  }
}

function topicInput(index: number): EnrichTopicInput {
  return {
    index,
    title: `موضوع ${index}`,
    why_it_matters: "يهم",
    why_now: "الآن",
    hook: "خطاف",
    conflict_angle: "تعارض",
    market_inspiration: "إشارة سوق",
    episode_type: "signature_khat",
    topic_domain: "modern_society",
  }
}

const sixTopics = [0, 1, 2, 3, 4, 5].map(topicInput)

function succeeded(parsed: unknown) {
  return { status: "succeeded", parsed, runId: "run-1" }
}
function failed() {
  return { status: "failed", parsed: null, runId: "run-1" }
}

/** The topic index a given mocked call was made for (`input.index`). */
function calledIndex(args: unknown): number {
  return (args as { input: { index: number } }).input.index
}

beforeEach(() => {
  runAiTaskMock.mockReset()
})

describe("enrichTopicsEditorially — per-topic coverage honesty", () => {
  it("carries an explicit per-call timeout and disables the router's own retry", async () => {
    // The whole point of the fix: the call can no longer inherit the router's
    // 120s × 3 = 361s default and hang the request.
    runAiTaskMock.mockImplementation(async (args) =>
      succeeded(enrichedObject(calledIndex(args))),
    )

    await enrichTopicsEditorially("season-1", sixTopics)

    expect(runAiTaskMock).toHaveBeenCalled()
    for (const call of runAiTaskMock.mock.calls) {
      const arg = call[0] as { timeoutMs?: number; maxRetries?: number }
      expect(arg.timeoutMs).toBe(90_000)
      expect(arg.maxRetries).toBe(0)
    }
  })

  it("enriches every topic — a lone object per call is now the CORRECT answer", async () => {
    // Feed the EXACT production failure input: every call answers with ONE bare
    // object. Batched, that lost 5 of 6. Per-topic, every topic enriches.
    runAiTaskMock.mockImplementation(async () => succeeded(enrichedObject(0)))

    const outcome = await enrichTopicsEditorially("season-1", sixTopics)

    expect(outcome.requested).toBe(6)
    expect(outcome.enriched).toBe(6)
    expect(outcome.missingIndexes).toEqual([])
    // One call per topic — no repair pass needed.
    expect(runAiTaskMock).toHaveBeenCalledTimes(6)
    // The enrichment is real, not a hollow row.
    const first = outcome.byIndex.get(0)!
    expect(first.success_score).toBeGreaterThan(0)
    expect(first.main_axes.length).toBeGreaterThan(0)
    expect(first.editorial_intel).toBeTruthy()
  })

  it("reports an ACCURATE partial count when one topic fails (1 of 6)", async () => {
    // Index 3 fails on BOTH its attempts; the other five enrich first try.
    runAiTaskMock.mockImplementation(async (args) => {
      const i = calledIndex(args)
      return i === 3 ? failed() : succeeded(enrichedObject(i))
    })

    const outcome = await enrichTopicsEditorially("season-1", sixTopics)

    expect(outcome.requested).toBe(6)
    expect(outcome.enriched).toBe(5)
    // The one that failed is named precisely — never folded into the 5.
    expect(outcome.missingIndexes).toEqual([3])
    expect(outcome.byIndex.has(3)).toBe(false)
    // The banner copy uses missingIndexes.length → «١ من ٦».
    expect(outcome.missingIndexes.length).toBe(1)
  })

  it("gives each failed topic exactly ONE bounded retry", async () => {
    // Index 3: first attempt fails, retry succeeds. Everyone else: one call.
    const attempts = new Map<number, number>()
    runAiTaskMock.mockImplementation(async (args) => {
      const i = calledIndex(args)
      const n = (attempts.get(i) ?? 0) + 1
      attempts.set(i, n)
      if (i === 3 && n === 1) return failed()
      return succeeded(enrichedObject(i))
    })

    const outcome = await enrichTopicsEditorially("season-1", sixTopics)

    expect(outcome.enriched).toBe(6)
    expect(outcome.missingIndexes).toEqual([])
    // Index 3 tried twice; every other topic exactly once. Total = 7.
    expect(attempts.get(3)).toBe(2)
    for (const i of [0, 1, 2, 4, 5]) expect(attempts.get(i)).toBe(1)
    expect(runAiTaskMock).toHaveBeenCalledTimes(7)
  })

  it("does NOT retry more than once — a persistently failing topic stays plain", async () => {
    const attempts = new Map<number, number>()
    runAiTaskMock.mockImplementation(async (args) => {
      const i = calledIndex(args)
      attempts.set(i, (attempts.get(i) ?? 0) + 1)
      return i === 2 ? failed() : succeeded(enrichedObject(i))
    })

    const outcome = await enrichTopicsEditorially("season-1", sixTopics)

    expect(outcome.missingIndexes).toEqual([2])
    // Exactly two attempts for the doomed topic — the retry is bounded at one.
    expect(attempts.get(2)).toBe(2)
  })

  it("spends one call per topic when the model obeys the wrapper shape", async () => {
    runAiTaskMock.mockImplementation(async (args) =>
      succeeded({ topics: [enrichedObject(calledIndex(args))] }),
    )

    const outcome = await enrichTopicsEditorially("season-1", sixTopics)

    expect(outcome.enriched).toBe(6)
    expect(outcome.missingIndexes).toEqual([])
    expect(runAiTaskMock).toHaveBeenCalledTimes(6)
  })

  it("never launches a call past the wall-clock deadline", async () => {
    runAiTaskMock.mockImplementation(async (args) =>
      succeeded(enrichedObject(calledIndex(args))),
    )

    // Deadline already passed → not a single AI call may be spent; every topic
    // is reported un-enriched honestly instead of the button hanging.
    const outcome = await enrichTopicsEditorially("season-1", sixTopics, {
      deadlineAt: Date.now() - 1,
    })

    expect(outcome.requested).toBe(6)
    expect(outcome.enriched).toBe(0)
    expect(outcome.missingIndexes).toEqual([0, 1, 2, 3, 4, 5])
    expect(runAiTaskMock).not.toHaveBeenCalled()
  })

  it("keeps the lone-object path working for a genuine one-topic batch", async () => {
    runAiTaskMock.mockImplementation(async () => succeeded(enrichedObject(0)))

    const outcome = await enrichTopicsEditorially("season-1", [topicInput(0)])

    expect(outcome.requested).toBe(1)
    expect(outcome.enriched).toBe(1)
    expect(outcome.missingIndexes).toEqual([])
    expect(runAiTaskMock).toHaveBeenCalledTimes(1)
  })

  it("returns an empty outcome without calling the model for an empty batch", async () => {
    const outcome = await enrichTopicsEditorially("season-1", [])
    expect(outcome).toEqual({
      byIndex: new Map(),
      requested: 0,
      enriched: 0,
      missingIndexes: [],
    })
    expect(runAiTaskMock).not.toHaveBeenCalled()
  })
})
