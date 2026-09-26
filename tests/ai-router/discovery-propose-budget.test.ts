/**
 * Discovery propose — the latency/cost budget (2026-09-26).
 *
 * The 2nd paid story-first trial timed out at the propose step: sol at the
 * registry's reasoning effort "high" crossed the 240s discovery timeout on
 * the stricter v2-propose-4 prompt. The fix lives in the registry (effort
 * "medium", 180s, no router retry) so that a Settings override can still
 * change the effort — a per-call `providerOptions.reasoningEffort` would
 * silently beat Settings in the OpenAI adapter.
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
      if (state.throwTimeout) throw new Error(`Provider timeout after ${req.timeoutMs}ms`)
      return { rawText: '{"people":[]}', tokensIn: 1, tokensOut: 1, costUsd: 0 }
    },
  },
}))

import { runAiTask } from "@/lib/ai-router/router"
import { DEFAULT_MODELS } from "@/lib/ai-router/registry"

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
  it("defaults to sol at medium effort, 180s, no router retry", () => {
    expect(DEFAULT_MODELS.discovery.modelName).toBe("gpt-5.6-sol")
    expect(DEFAULT_MODELS.discovery.reasoningEffort).toBe("medium")
    expect(DEFAULT_MODELS.discovery.defaultTimeoutMs).toBe(180_000)
    expect(DEFAULT_MODELS.discovery.defaultMaxRetries).toBe(0)
  })

  it("worst-case propose wall time leaves most of the job limit for the fan-out", () => {
    const d = DEFAULT_MODELS.discovery
    const worst = d.defaultTimeoutMs! * (1 + d.defaultMaxRetries!)
    // Trial 1 spent ~212s after propose; demand a propose worst case of at
    // most a third of the job limit so that fan-out keeps > 2× headroom.
    expect(worst).toBeLessThanOrEqual(discoveryJobLimitMs() / 3)
  })
})

describe("router — discovery on the default (Settings-aware) path", () => {
  it("resolves effort 'medium' and the 180s timeout when Settings is silent", async () => {
    await runAiTask(discoveryReq())
    expect(state.lastResolved?.reasoningEffort).toBe("medium")
    expect(state.lastResolved?.timeoutMs).toBe(180_000)
  })

  it("a Settings effort override still wins over the registry default", async () => {
    state.settingsEffort = "high"
    await runAiTask(discoveryReq())
    expect(state.lastResolved?.reasoningEffort).toBe("high")
  })

  it("a timeout is not retried by the router — exactly one attempt", async () => {
    state.throwTimeout = true
    const r = await runAiTask(discoveryReq())
    expect(r.status).toBe("timed_out")
    expect(state.executeCalls).toBe(1)
  })
})
