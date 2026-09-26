/**
 * gatherGroundedEvidence — the `timeoutMs` budget (2026-09-26).
 *
 * The discovery story check called this with no bound: up to 3 attempts
 * (+1 empty re-roll) with nothing stopping it at the 10-minute job limit.
 * With `timeoutMs` the whole gather is one budget: each Gemini call carries
 * an abort signal at what is left, and no retry / re-roll starts that can't
 * fit. Without it, behaviour is unchanged (the sight checks below).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const g = vi.hoisted(() => ({
  /** per-call behaviour, shifted in order; default = a grounded hit */
  plan: [] as Array<"hit" | "empty" | "503">,
  /** fake-clock ms each call "takes" */
  callMs: 0,
  configs: [] as Array<Record<string, unknown>>,
}))

const HIT = {
  candidates: [
    {
      groundingMetadata: {
        groundingChunks: [{ web: { uri: "https://alanba.com.kw/a", title: "الأنباء" } }],
        groundingSupports: [{ segment: { text: "نص داعم" }, groundingChunkIndices: [0] }],
        webSearchQueries: ["q"],
      },
    },
  ],
  usageMetadata: {},
}
// The search ran and found nothing — the case the re-roll exists for.
const EMPTY = {
  candidates: [{ groundingMetadata: { groundingChunks: [], groundingSupports: [], webSearchQueries: ["q"] } }],
  usageMetadata: {},
}

const generateContent = vi.fn(async (req: { config: Record<string, unknown> }) => {
  g.configs.push(req.config)
  if (g.callMs) vi.setSystemTime(Date.now() + g.callMs)
  const step = g.plan.shift() ?? "hit"
  if (step === "503") throw new Error("503 UNAVAILABLE")
  return step === "empty" ? EMPTY : HIT
})

vi.mock("@/lib/ai/gemini", () => ({
  getGeminiClient: () => ({ models: { generateContent } }),
  isGeminiConfigured: () => true,
  GEMINI_RETRIEVAL_MODEL: "gemini-test-retrieval",
}))
vi.mock("@/lib/ai-router/record-run", () => ({
  // The real one calls `derive` on the result — the re-roll decision lives there.
  recordAiRun: async (_m: unknown, exec: () => Promise<unknown>, derive?: (r: unknown) => unknown) => {
    const r = await exec()
    derive?.(r)
    return r
  },
}))
vi.mock("@/lib/ai-router/gemini-usage", () => ({
  deriveGeminiTelemetry: () => ({ tokensIn: 1, tokensOut: 1, costUsd: null }),
}))
vi.mock("@/lib/ai-router/retrieval-budget", () => ({ assertRetrievalBudget: async () => {} }))

import {
  GroundedEvidenceDeadlineError,
  MIN_ATTEMPT_MS,
  gatherGroundedEvidence,
} from "@/lib/ai/grounded-evidence"

beforeEach(() => {
  g.plan = []
  g.callMs = 0
  g.configs = []
  generateContent.mockClear()
  // Only Date is faked: the retry/re-roll pauses stay real (≤ 1.5s).
  vi.useFakeTimers({ toFake: ["Date"] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("gatherGroundedEvidence — timeoutMs", () => {
  it("each call carries an abort signal under a budget, and none without one", async () => {
    await gatherGroundedEvidence("q", { timeoutMs: 60_000 })
    expect(g.configs[0].abortSignal).toBeInstanceOf(AbortSignal)
    await gatherGroundedEvidence("q")
    expect(g.configs[1].abortSignal).toBeUndefined()
  })

  it("an exhausted budget pays for nothing", async () => {
    await expect(gatherGroundedEvidence("q", { timeoutMs: 0 })).rejects.toBeInstanceOf(
      GroundedEvidenceDeadlineError,
    )
    expect(generateContent).not.toHaveBeenCalled()
  })

  it("a transient error is NOT retried when the retry can't fit — and IS retried when it can", async () => {
    g.plan = ["503"]
    g.callMs = 55_000 // 5s left of 60s after the failed call
    await expect(gatherGroundedEvidence("q", { timeoutMs: 60_000 })).rejects.toThrow("503")
    expect(generateContent).toHaveBeenCalledTimes(1)

    generateContent.mockClear()
    g.plan = ["503", "hit"]
    const ok = await gatherGroundedEvidence("q", { timeoutMs: 600_000 })
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(ok.sources).toHaveLength(1)
  }, 10_000)

  it("the empty re-roll is skipped when the budget can't fit it — the empty answer is returned, not thrown", async () => {
    g.plan = ["empty", "hit"]
    g.callMs = 60_000 - MIN_ATTEMPT_MS + 1 // < MIN_ATTEMPT_MS left after call 1
    const r = await gatherGroundedEvidence("q", { timeoutMs: 60_000 })
    expect(generateContent).toHaveBeenCalledTimes(1)
    expect(r.sources).toHaveLength(0)

    // sight: with room, the same empty answer IS re-rolled
    generateContent.mockClear()
    g.plan = ["empty", "hit"]
    g.callMs = 0
    const again = await gatherGroundedEvidence("q", { timeoutMs: 60_000 })
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(again.sources).toHaveLength(1)
  }, 10_000)
})
