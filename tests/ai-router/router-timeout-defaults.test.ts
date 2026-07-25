/**
 * Router — per-task_kind timeout / retry defaults.
 *
 * The systemic fix: instead of every long-running generator remembering to
 * pass an explicit `timeoutMs`/`maxRetries`, the registry now carries a
 * per-task_kind default that the router reads. This is the single place the
 * "120s × 3 = 361s → timed_out" class of bug (documented in
 * tests/khat-map-enrich-coverage.test.ts) is fixed for all ~35 call sites.
 *
 * These tests drive the REAL `runAiTask` composition with a fake adapter
 * that captures the ResolvedRequest and counts execute attempts, proving:
 *   1. a task_kind with a registry default (editorial=280s, research=240s)
 *      applies that default when the caller passes no timeout,
 *   2. a task_kind WITHOUT an explicit registry override (structural) still
 *      falls back to the global 120s default (nothing gets a shorter cap),
 *   3. an explicit per-call `timeoutMs`/`maxRetries` STILL wins over the
 *      registry default — the `??` precedence is explicit → registry → global.
 *      This is load-bearing: the hybrid work passes explicit values that MUST
 *      keep winning.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, mockInsertReturning, resetMock } from "../db-mock"

// Hoisted mutable state the fake adapter records into.
const state = vi.hoisted(() => ({
  executeCalls: 0,
  lastResolved: null as null | {
    timeoutMs: number
    modelName: string
    prompt?: Array<{ role: string; content: string }>
  },
  throwTransient: false,
  rawText: "{}",
}))

vi.mock("@/lib/db", () => ({ db: mockDb }))

// JSONB snapshot validation is pure but pulls schema — stub to no-op so the
// test isolates the router's timeout/retry composition.
vi.mock("@/lib/db/validators", () => ({
  validateJsonbWrite: () => {},
  aiRunsInputSnapshotSchema: {},
  aiRunsOutputSnapshotSchema: {},
  AI_RUNS_INPUT_SNAPSHOT_COLUMN: "input_snapshot",
  AI_RUNS_OUTPUT_SNAPSHOT_COLUMN: "output_snapshot",
  AI_RUNS_TABLE: "ai_runs",
}))

// Keep the real RateLimitError (router does `instanceof` + re-export); stub
// only the permit acquisition so no rate-limit DB work runs.
vi.mock("@/lib/ai-router/rate-limit", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    acquireRateLimitPermit: async () => ({
      decision: "allowed",
      enforced: false,
      tier: "editorial",
      permit: { release: async () => {} },
    }),
  }
})

// Fake OpenAI adapter — captures the ResolvedRequest the router built and
// counts attempts. Transient-throw mode drives the retry path.
vi.mock("@/lib/ai-router/providers/openai", () => ({
  openaiAdapter: {
    provider: "openai",
    isAvailable: () => true,
    execute: async (req: {
      timeoutMs: number
      modelName: string
      prompt?: Array<{ role: string; content: string }>
    }) => {
      state.executeCalls++
      state.lastResolved = req
      if (state.throwTransient) {
        const e = new Error("service unavailable") as Error & { status?: number }
        e.status = 503 // → classifyError "server_error" (retryable)
        throw e
      }
      return { rawText: state.rawText, tokensIn: 1, tokensOut: 1, costUsd: 0 }
    },
  },
}))

import { runAiTask } from "@/lib/ai-router/router"
import type { AiTaskKind } from "@/lib/ai-router/types"

/** Minimal request; preferredModel skips the network model-selection path. */
function req(taskKind: AiTaskKind, model: string, extra: Record<string, unknown> = {}) {
  return {
    taskKind,
    preferredProvider: "openai" as const,
    preferredModel: model,
    input: {},
    prompt: "hi",
    ...extra,
  }
}

beforeEach(() => {
  resetMock()
  state.executeCalls = 0
  state.lastResolved = null
  state.throwTransient = false
  state.rawText = "{}"
  mockInsertReturning([{ id: "run-test-1" }])
})

describe("router — mandatory grounding for research output", () => {
  const research = (sourceIds: number[], extra: Record<string, unknown> = {}) =>
    req("research", "gpt-5.6-terra", {
      expectJson: true,
      grounding: { mode: "required", sourceIds },
      ...extra,
    })

  it("accepts output whose citations all resolve to the retrieved corpus", async () => {
    state.rawText = JSON.stringify({
      claims: [{ claim: "ادعاء", source_ids: [1] }],
    })
    const res = await runAiTask(research([1, 2]))
    expect(res.status).toBe("succeeded")
    expect(res.errorClass).toBeNull()
    expect(res.parsed).not.toBeNull()
  })

  it("fails the run when the output cites a source that was never retrieved", async () => {
    state.rawText = JSON.stringify({
      claims: [{ claim: "ادعاء ملفّق", source_ids: [99] }],
    })
    const res = await runAiTask(research([1, 2]))
    expect(res.status).toBe("failed")
    expect(res.errorClass).toBe("ungrounded_output")
    // The payload is dropped, not handed back for a caller to persist.
    expect(res.parsed).toBeNull()
  })

  it("fails the run when the model answers from memory with no citations", async () => {
    state.rawText = JSON.stringify({
      claims: [{ claim: "ادعاء واثق بلا مصدر" }],
    })
    const res = await runAiTask(research([1, 2]))
    expect(res.status).toBe("failed")
    expect(res.errorClass).toBe("ungrounded_output")
    expect(res.errorMessage).toContain("لا يستشهد")
  })

  it("leaves a declared exemption unverified (benchmark fixtures have no corpus)", async () => {
    state.rawText = JSON.stringify({ answers: ["بلا استشهاد"] })
    const res = await runAiTask(
      req("research", "gpt-5.6-terra", {
        expectJson: true,
        grounding: { mode: "exempt", reason: "benchmark fixture" },
      }),
    )
    expect(res.status).toBe("succeeded")
    expect(res.parsed).not.toBeNull()
  })

  it("does not impose the contract on non-research kinds", async () => {
    state.rawText = JSON.stringify({ chapters: [] })
    const res = await runAiTask(req("structural", "gpt-5.6-luna", { expectJson: true }))
    expect(res.status).toBe("succeeded")
  })
})

describe("router — per-task_kind timeout defaults", () => {
  it("editorial with no explicit timeoutMs uses the registry default (280_000)", async () => {
    const res = await runAiTask(req("editorial", "gpt-5.6-sol"))
    expect(res.status).toBe("succeeded")
    expect(state.lastResolved?.timeoutMs).toBe(280_000)
  })

  it("research with no explicit timeoutMs uses its registry default (240_000)", async () => {
    // `research` is grounding-required — the contract is mandatory even here.
    await runAiTask(
      req("research", "gpt-5.6-terra", {
        grounding: { mode: "exempt", reason: "router unit test" },
      }),
    )
    expect(state.lastResolved?.timeoutMs).toBe(240_000)
  })

  it("a research call without a grounding contract is refused before any spend", async () => {
    await expect(runAiTask(req("research", "gpt-5.6-terra"))).rejects.toThrow(
      /عقد التأريض/,
    )
    // Pre-flight: the adapter was never invoked, so nothing was billed.
    expect(state.executeCalls).toBe(0)
  })

  it("the router injects the mandatory citation directive under a corpus contract", async () => {
    await runAiTask(
      req("research", "gpt-5.6-terra", {
        grounding: { mode: "required", sourceIds: [1, 2, 3] },
      }),
    )
    const first = state.lastResolved?.prompt?.[0]
    expect(first?.role).toBe("system")
    expect(first?.content).toContain("معرفتك الداخلية ليست مصدراً")
  })

  it("analysis with no explicit timeoutMs uses its registry default (150_000)", async () => {
    await runAiTask(req("analysis", "gpt-5.6-luna"))
    expect(state.lastResolved?.timeoutMs).toBe(150_000)
  })

  it("structural (no registry override) falls back to the global 120_000 default", async () => {
    await runAiTask(req("structural", "gpt-5.6-luna"))
    expect(state.lastResolved?.timeoutMs).toBe(120_000)
  })

  it("explicit req.timeoutMs still wins over the registry default", async () => {
    await runAiTask(req("editorial", "gpt-5.6-sol", { timeoutMs: 45_000 }))
    expect(state.lastResolved?.timeoutMs).toBe(45_000)
  })
})

describe("router — per-task_kind maxRetries defaults", () => {
  it("editorial default maxRetries is 1 → exactly 2 attempts on transient failure", async () => {
    state.throwTransient = true
    const res = await runAiTask(req("editorial", "gpt-5.6-sol"))
    expect(res.status).toBe("failed")
    expect(state.executeCalls).toBe(2) // 1 + maxRetries(1)
  })

  it("discovery default maxRetries is 0 → exactly 1 attempt (no retry)", async () => {
    state.throwTransient = true
    await runAiTask(req("discovery", "gpt-5.6-sol"))
    expect(state.executeCalls).toBe(1)
  })

  it("explicit maxRetries:0 wins over the editorial registry default (single attempt)", async () => {
    state.throwTransient = true
    await runAiTask(req("editorial", "gpt-5.6-sol", { maxRetries: 0 }))
    expect(state.executeCalls).toBe(1)
  })
})
