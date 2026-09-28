/**
 * Discovery propose — the latency/cost budget.
 *
 * 2026-09-26: the 2nd paid story-first trial timed out at the propose step
 * (sol at "high" crossed 240s on v2-propose-4). The fix lives in the
 * registry (effort "medium") so a Settings override can still change the
 * effort — a per-call `providerOptions.reasoningEffort` would silently beat
 * Settings in the OpenAI adapter.
 *
 * 2026-09-28: the 180s wall that came with it never let the story-first
 * prompt succeed on prod (two back-to-back 180s timeouts, 0 retries, on
 * episode 93c83176) — measured medium-effort calls are 118–151s, so 180s
 * had ~20% headroom. Now 300s + ONE retry on a timeout only, and the
 * discovery_v2.run job budget (worker HANDLER_TIMEOUT_MS =
 * DISCOVERY_JOB_BUDGET_MS) grew to fit the worst case.
 *
 * These tests drive the REAL runAiTask composition (fake adapter captures
 * the ResolvedRequest) on the default model-selection path — the path the
 * propose call takes, since it passes no preferredModel.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, mockInsertReturning, resetMock } from "../db-mock"

const state = vi.hoisted(() => ({
  executeCalls: 0,
  lastResolved: null as null | {
    timeoutMs: number
    reasoningEffort?: string
    providerOptions: Record<string, unknown>
  },
  throwTimeout: false,
  /** Throw a provider 5xx instead (a class discovery must NOT retry). */
  throwServerError: false,
  /** Fail only the first N attempts (then succeed). */
  failFirst: Infinity,
  /** What Settings → الذكاء الاصطناعي holds for discovery (null = nothing). */
  settingsEffort: null as null | string,
}))

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/db/validators", () => ({
  validateJsonbWrite: () => {},
  aiRunsInputSnapshotSchema: {},
  aiRunsOutputSnapshotSchema: {},
  AI_RUNS_INPUT_SNAPSHOT_COLUMN: "input_snapshot",
  AI_RUNS_OUTPUT_SNAPSHOT_COLUMN: "output_snapshot",
  AI_RUNS_TABLE: "ai_runs",
}))

vi.mock("@/lib/ai-router/rate-limit", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    acquireRateLimitPermit: async () => ({
      decision: "allowed",
      enforced: false,
      tier: "expensive",
      permit: { release: async () => {} },
    }),
  }
})

// Stand-in for the real resolveModelChoice: same contract (Settings override
// effort ?? registry default), with the Settings value driven by the test.
vi.mock("@/lib/ai-router/model-selection", async () => {
  const { DEFAULT_MODELS } = await import("@/lib/ai-router/registry")
  return {
    resolveModelChoice: async (taskKind: keyof typeof DEFAULT_MODELS) => ({
      modelName: DEFAULT_MODELS[taskKind].modelName,
      requestedModel: DEFAULT_MODELS[taskKind].modelName,
      fallbackReason: null,
      reasoningEffort: state.settingsEffort ?? DEFAULT_MODELS[taskKind].reasoningEffort,
    }),
  }
})

vi.mock("@/lib/ai-router/providers/openai", () => ({
  openaiAdapter: {
    provider: "openai",
    isAvailable: () => true,
    execute: async (req: {
      timeoutMs: number
      reasoningEffort?: string
      providerOptions: Record<string, unknown>
    }) => {
      state.executeCalls++
      state.lastResolved = req
      if (state.executeCalls <= state.failFirst) {
        if (state.throwTimeout) throw new Error(`Provider timeout after ${req.timeoutMs}ms`)
        if (state.throwServerError) throw Object.assign(new Error("502 Bad Gateway"), { status: 502 })
      }
      return { rawText: '{"people":[]}', tokensIn: 1, tokensOut: 1, costUsd: 0 }
    },
  },
}))

import { runAiTask } from "@/lib/ai-router/router"
import { DEFAULT_MODELS } from "@/lib/ai-router/registry"
import {
  DISCOVERY_JOB_BUDGET_MS,
  POST_PROPOSE_RESERVE_MS,
  POST_STORY_RESERVE_MS,
  STORY_CHECK_MIN_MS,
  TOPUP_MIN_MS,
  proposeWorstCaseMs,
} from "@/lib/discovery-v2/pipeline"
import { PROPOSE_MAX_OUTPUT_TOKENS } from "@/lib/discovery-v2/propose"

/** The discovery_v2.run handler budget, read from the worker source so this
 *  test cannot keep passing against a number the worker no longer uses. */
function discoveryJobLimitMs(): number {
  const src = readFileSync(join(process.cwd(), "lib/jobs/worker.ts"), "utf8")
  const m = /"discovery_v2\.run":\s*(\d+)\s*\*\s*60_000/.exec(src)
  if (!m) throw new Error("discovery_v2.run budget not found in lib/jobs/worker.ts")
  return Number(m[1]) * 60_000
}

beforeEach(() => {
  resetMock()
  state.executeCalls = 0
  state.lastResolved = null
  state.throwTimeout = false
  state.throwServerError = false
  state.failFirst = Infinity
  state.settingsEffort = null
  mockInsertReturning([{ id: "run-test-1" }])
})

const discoveryReq = () => ({
  taskKind: "discovery" as const,
  input: {},
  prompt: "hi",
  expectJson: true,
})

describe("discovery registry budget", () => {
  it("defaults to sol at medium effort, 300s, one retry on a timeout only", () => {
    expect(DEFAULT_MODELS.discovery.modelName).toBe("gpt-5.6-sol")
    expect(DEFAULT_MODELS.discovery.reasoningEffort).toBe("medium")
    expect(DEFAULT_MODELS.discovery.defaultTimeoutMs).toBe(300_000)
    expect(DEFAULT_MODELS.discovery.defaultMaxRetries).toBe(1)
    expect(DEFAULT_MODELS.discovery.retryOn).toEqual(["timeout"])
  })

  it("the pipeline's job budget IS the worker's discovery_v2.run limit", () => {
    expect(discoveryJobLimitMs()).toBe(DISCOVERY_JOB_BUDGET_MS)
  })

  it("worst-case propose (every attempt times out + max backoff) + the rest of the run fits the job", () => {
    // 300 + 8 + 300 = 608s
    expect(proposeWorstCaseMs()).toBe(608_000)
    expect(proposeWorstCaseMs() + POST_PROPOSE_RESERVE_MS).toBeLessThanOrEqual(DISCOVERY_JOB_BUDGET_MS)
  })

  it("after a worst-case propose the top-up is skipped, not squeezed in", () => {
    // spare = budget − worst − reserve must be under TOPUP_MIN_MS, or the
    // top-up would run on top of a propose that already spent the budget.
    const spare = DISCOVERY_JOB_BUDGET_MS - proposeWorstCaseMs() - POST_PROPOSE_RESERVE_MS
    expect(spare).toBeLessThan(TOPUP_MIN_MS)
  })

  it("after a worst-case propose the story phase still has room to start a check", () => {
    const storyWindow = DISCOVERY_JOB_BUDGET_MS - POST_STORY_RESERVE_MS - proposeWorstCaseMs()
    expect(storyWindow).toBeGreaterThanOrEqual(STORY_CHECK_MIN_MS)
  })

  it("a typical propose leaves a full-timeout top-up AND the post-propose reserve", () => {
    // Measured medium-effort propose on v2-propose-6: 139–151s (local ai_runs).
    const typical = 151_000
    const spare = DISCOVERY_JOB_BUDGET_MS - typical - POST_PROPOSE_RESERVE_MS
    expect(Math.min(DEFAULT_MODELS.discovery.defaultTimeoutMs!, spare)).toBe(300_000)
  })

  it("the output-token cap lands inside the timeout at the measured rate", () => {
    // v2-propose-5/6: 6.6–7.9k output tokens in 118–151s ≈ 45 tok/s end-to-end.
    const measuredTokPerSec = 45
    expect((PROPOSE_MAX_OUTPUT_TOKENS / measuredTokPerSec) * 1000).toBeLessThan(
      DEFAULT_MODELS.discovery.defaultTimeoutMs!,
    )
  })
})

describe("router — discovery on the default (Settings-aware) path", () => {
  it("resolves effort 'medium' and the 300s timeout when Settings is silent", async () => {
    await runAiTask(discoveryReq())
    expect(state.lastResolved?.reasoningEffort).toBe("medium")
    expect(state.lastResolved?.timeoutMs).toBe(300_000)
  })

  it("a Settings effort override still wins over the registry default", async () => {
    state.settingsEffort = "high"
    await runAiTask(discoveryReq())
    expect(state.lastResolved?.reasoningEffort).toBe("high")
  })

  it("a timeout is retried exactly once — then the run is timed_out after 2 attempts", async () => {
    state.throwTimeout = true
    const r = await runAiTask(discoveryReq())
    expect(r.status).toBe("timed_out")
    expect(state.executeCalls).toBe(2)
  })

  it("a timeout followed by a good reply succeeds on the retry", async () => {
    state.throwTimeout = true
    state.failFirst = 1
    const r = await runAiTask(discoveryReq())
    expect(r.status).toBe("succeeded")
    expect(state.executeCalls).toBe(2)
  })

  it("a 5xx is NOT retried for discovery (retryOn narrows to timeout)", async () => {
    state.throwServerError = true
    const r = await runAiTask(discoveryReq())
    expect(r.status).toBe("failed")
    expect(state.executeCalls).toBe(1)
  })

  it("sight: without retryOn (editorial) the same 5xx IS retried", async () => {
    state.throwServerError = true
    state.failFirst = 1
    const r = await runAiTask({ ...discoveryReq(), taskKind: "editorial" as const })
    expect(r.status).toBe("succeeded")
    expect(state.executeCalls).toBe(2)
  })

  it("a per-call maxRetries 0 (the top-up) makes a timeout final at once", async () => {
    state.throwTimeout = true
    const r = await runAiTask({ ...discoveryReq(), maxRetries: 0 })
    expect(r.status).toBe("timed_out")
    expect(state.executeCalls).toBe(1)
  })
})
