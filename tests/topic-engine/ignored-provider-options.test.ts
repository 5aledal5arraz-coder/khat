/**
 * Topic-engine defect #1 — `temperature` was silently dropped for reasoning
 * models. The OpenAI adapter (correctly) refuses to send samplers to a model
 * that reasons, but nothing recorded that the caller's 0.8 / 0.5 / 0.85 never
 * reached the provider, so ai_runs read as if they had.
 *
 * Contract now:
 *   - each adapter can say which caller options it will NOT send
 *     (`ignoredOptions`), decided from the same rule it uses to build the
 *     request — one source of truth, no duplicated model logic;
 *   - the router stamps that into ai_runs.input_snapshot under
 *     `_ignored_provider_options` BEFORE the call, so even a failed run says it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, mockInsertReturning, resetMock } from "../db-mock"

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

// The real OpenAI client is never constructed: execute() is replaced, but the
// real `ignoredOptions` rule is kept so the router test exercises it.
const created = vi.hoisted(() => ({ params: [] as Array<Record<string, unknown>> }))
vi.mock("@/lib/ai/client", () => ({
  getClient: () => ({
    responses: {
      create: async (params: Record<string, unknown>) => {
        created.params.push(params)
        return { output_text: "{}", usage: { input_tokens: 1, output_tokens: 1 } }
      },
    },
  }),
}))
vi.mock("@/lib/env", () => ({ env: { OPENAI_API_KEY: "test-key" } }))

import { openaiAdapter } from "@/lib/ai-router/providers/openai"
import { geminiAdapter } from "@/lib/ai-router/providers/gemini"
import { runAiTask } from "@/lib/ai-router/router"

function resolved(modelName: string, providerOptions: Record<string, unknown>, effort?: string) {
  return {
    modelName,
    prompt: [{ role: "user" as const, content: "x" }],
    expectJson: true,
    providerOptions,
    timeoutMs: 1000,
    reasoningEffort: effort as never,
  }
}

beforeEach(() => {
  resetMock()
  mockDb.insert.mockClear()
  created.params = []
  mockInsertReturning([{ id: "run-1" }])
})

describe("openaiAdapter.ignoredOptions", () => {
  it("reports temperature as ignored for a reasoning model (gpt-5.6-sol, effort medium)", () => {
    expect(
      openaiAdapter.ignoredOptions!(resolved("gpt-5.6-sol", { temperature: 0.8 }, "medium")),
    ).toEqual({
      options: { temperature: 0.8 },
      reason: expect.stringMatching(/not accepted by a reasoning model/),
    })
  })

  it("reports nothing for a sampling model (gpt-4o fallback) — temperature IS sent there", async () => {
    const r = resolved("gpt-4o", { temperature: 0.8 })
    expect(openaiAdapter.ignoredOptions!(r)).toBeNull()
    await openaiAdapter.execute(r)
    expect(created.params[0].temperature).toBe(0.8)
  })

  it("reports nothing for a GPT-5 call with reasoning explicitly 'none'", () => {
    expect(
      openaiAdapter.ignoredOptions!(resolved("gpt-5.6-sol", { temperature: 0.5 }, "none")),
    ).toBeNull()
  })

  it("agrees with execute(): what it calls ignored is exactly what is not sent", async () => {
    const r = resolved("gpt-5.6-sol", { temperature: 0.8, top_p: 0.9 }, "medium")
    expect(openaiAdapter.ignoredOptions!(r)?.options).toEqual({ temperature: 0.8, top_p: 0.9 })
    await openaiAdapter.execute(r)
    expect(created.params[0]).not.toHaveProperty("temperature")
    expect(created.params[0]).not.toHaveProperty("top_p")
  })
})

describe("geminiAdapter.ignoredOptions", () => {
  it("reports temperature as ignored (Google deprecated samplers)", () => {
    expect(
      geminiAdapter.ignoredOptions!(resolved("gemini-3.6-flash", { temperature: 0.3 })),
    ).toEqual({
      options: { temperature: 0.3 },
      reason: expect.stringMatching(/deliberately not sent.*deprecated/),
    })
  })
})

describe("router — the drop is recorded in ai_runs", () => {
  it("stamps _ignored_provider_options into input_snapshot for a reasoning-model call", async () => {
    await runAiTask({
      taskKind: "editorial",
      preferredProvider: "openai",
      preferredModel: "gpt-5.6-sol",
      input: { a: 1 },
      prompt: "hi",
      expectJson: true,
      providerOptions: { temperature: 0.8 },
    })
    const insertChain = mockDb.insert.mock.results[0].value as {
      values: { mock: { calls: Array<[Record<string, unknown>]> } }
    }
    const row = insertChain.values.mock.calls[0][0]
    const snap = row.input_snapshot as Record<string, unknown>
    expect(snap.a).toBe(1)
    expect(snap._ignored_provider_options).toMatchObject({
      options: { temperature: 0.8 },
      model: "gpt-5.6-sol",
      reason: expect.stringMatching(/reasoning model/),
    })
  })

  it("adds nothing when every option is honoured", async () => {
    await runAiTask({
      taskKind: "editorial",
      preferredProvider: "openai",
      preferredModel: "gpt-4o",
      input: { a: 1 },
      prompt: "hi",
      providerOptions: { temperature: 0.8 },
    })
    const insertChain = mockDb.insert.mock.results[0].value as {
      values: { mock: { calls: Array<[Record<string, unknown>]> } }
    }
    const snap = insertChain.values.mock.calls[0][0].input_snapshot as Record<string, unknown>
    expect(snap).not.toHaveProperty("_ignored_provider_options")
  })
})
