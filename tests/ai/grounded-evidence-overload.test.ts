/**
 * gatherGroundedEvidence — a Gemini overload spell (2026-09-29).
 *
 * Live runs 7fa3843c / d495c7cd: most `research_retrieval` calls (the
 * discovery harvest + story checks) died on HTTP 503 «This model is
 * currently experiencing high demand». They WERE retried — this service's
 * own loop, not the router's (retrieval goes through `recordAiRun`, so the
 * registry's retry policy never applies) — but three attempts 1.5s + 3s
 * apart all land inside the same spell. Under a deadline the loop now keeps
 * backing off (exponential, capped) for as long as the budget allows; with
 * no deadline the attempt count is unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const g = vi.hoisted(() => ({
  /** the clock (ms) until which Gemini answers 503 */
  overloadedUntil: 0,
  calls: [] as number[],
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

/** The exact shape @google/genai throws (ApiError: JSON body as the message). */
function overloadError(): Error {
  const e = new Error(
    JSON.stringify({
      error: {
        code: 503,
        message: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
        status: "UNAVAILABLE",
      },
    }),
  )
  e.name = "ApiError"
  ;(e as Error & { status: number }).status = 503
  return e
}

const generateContent = vi.fn(async () => {
  g.calls.push(Date.now())
  if (Date.now() < g.overloadedUntil) throw overloadError()
  return HIT
})

vi.mock("@/lib/ai/gemini", () => ({
  getGeminiClient: () => ({ models: { generateContent } }),
  isGeminiConfigured: () => true,
  GEMINI_RETRIEVAL_MODEL: "gemini-test-retrieval",
}))
vi.mock("@/lib/ai-router/record-run", () => ({
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

import { gatherGroundedEvidence, transientBackoffMs } from "@/lib/ai/grounded-evidence"

/** Run a gather to completion under fake timers (the backoff sleeps are fake). */
async function settle<T>(p: Promise<T>): Promise<{ ok: T } | { err: unknown }> {
  let out: { ok: T } | { err: unknown } | null = null
  p.then((ok) => (out = { ok }), (err) => (out = { err }))
  for (let i = 0; i < 200 && !out; i++) await vi.advanceTimersByTimeAsync(1_000)
  if (!out) throw new Error("gather never settled")
  return out
}

let t0 = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
  t0 = Date.now()
  g.calls = []
  generateContent.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("gatherGroundedEvidence — a 503 overload spell", () => {
  it("rides out a ~15s spell inside a 90s budget (the harvest / story-check budget)", async () => {
    g.overloadedUntil = t0 + 15_000
    const r = await settle(gatherGroundedEvidence("q", { timeoutMs: 90_000 }))
    expect("ok" in r).toBe(true)
    if ("ok" in r) expect(r.ok.sources).toHaveLength(1)
    expect(generateContent.mock.calls.length).toBeGreaterThan(3)
  })

  it("never outlives its budget: a spell longer than the budget fails before the deadline", async () => {
    g.overloadedUntil = Infinity
    const r = await settle(gatherGroundedEvidence("q", { timeoutMs: 60_000 }))
    expect("err" in r).toBe(true)
    if ("err" in r) expect(String((r.err as Error).message)).toMatch(/503|high demand/)
    // No attempt started with less than MIN_ATTEMPT_MS (10s) left of the 60s.
    for (const at of g.calls) expect(at - t0).toBeLessThanOrEqual(50_000)
  })

  it("with no deadline the attempt count is unchanged (3) — no unbounded caller waits longer", async () => {
    g.overloadedUntil = Infinity
    const r = await settle(gatherGroundedEvidence("q"))
    expect("err" in r).toBe(true)
    expect(generateContent).toHaveBeenCalledTimes(3)
  })

  it("under a deadline the loop pauses by transientBackoffMs — 2,4,8,16,20,20s — not the old 1.5s × attempt", async () => {
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0) // no jitter: exact gaps
    try {
      g.overloadedUntil = Infinity
      const r = await settle(gatherGroundedEvidence("q", { timeoutMs: 90_000 }))
      expect("err" in r).toBe(true)
      const gaps = g.calls.slice(1).map((at, i) => at - g.calls[i])
      // 1 + 6 retries; the last fits because 70s + MIN_ATTEMPT_MS ≤ 90s.
      expect(gaps).toEqual([2_000, 4_000, 8_000, 16_000, 20_000, 20_000])
    } finally {
      rnd.mockRestore()
    }
  })

  it("the backoff grows and is capped", () => {
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0)
    expect(transientBackoffMs(1)).toBe(2_000)
    expect(transientBackoffMs(2)).toBe(4_000)
    expect(transientBackoffMs(3)).toBe(8_000)
    expect(transientBackoffMs(10)).toBe(20_000)
    rnd.mockRestore()
  })
})
