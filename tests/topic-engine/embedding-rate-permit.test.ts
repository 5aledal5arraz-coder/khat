/**
 * Topic-engine defect #5 — the embedding call skipped the rate-limit permit.
 * Every routed AI call passes `acquireRateLimitPermit` before it opens its
 * ai_runs row; `batchEmbed` / `embed` went straight to the provider through
 * `recordAiRun`, so they were invisible to the concurrency and daily-cost
 * policy (and never audited in ai_rate_limit_events).
 *
 * Embeddings now take a permit in the LIGHT tier (cheap model), audited under
 * task_kind "embedding"; an enforced block stops the provider call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, mockInsertReturning, resetMock } from "../db-mock"

const h = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(async () => {}),
  create: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/lib/ai-router/rate-limit", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, acquireRateLimitPermit: h.acquire }
})
vi.mock("@/lib/ai/client", () => ({
  getClient: () => ({ embeddings: { create: h.create } }),
}))

import { batchEmbed, embed } from "@/lib/khat-map/learning/embeddings"
import { RateLimitError, tierForTaskKind } from "@/lib/ai-router/rate-limit"

const VEC = Array.from({ length: 1536 }, () => 0.01)

beforeEach(() => {
  resetMock()
  mockInsertReturning([{ id: "run-e" }])
  h.acquire.mockReset()
  h.release.mockClear()
  h.create.mockReset()
  h.acquire.mockResolvedValue({
    decision: "allowed",
    enforced: false,
    tier: "light",
    permit: { release: h.release },
  })
  h.create.mockImplementation(async (req: { input: string | string[] }) => {
    const n = Array.isArray(req.input) ? req.input.length : 1
    return {
      data: Array.from({ length: n }, (_, index) => ({ index, embedding: VEC })),
      usage: { prompt_tokens: 10 },
    }
  })
})

describe("embeddings take a rate-limit permit", () => {
  it("batchEmbed acquires a permit (task_kind embedding) and releases it", async () => {
    await batchEmbed(["أ", "ب"])
    expect(h.acquire).toHaveBeenCalledTimes(1)
    expect(h.acquire.mock.calls[0][0]).toMatchObject({ taskKind: "embedding" })
    expect(h.release).toHaveBeenCalledTimes(1)
  })

  it("embed acquires a permit too", async () => {
    await embed("نص")
    expect(h.acquire).toHaveBeenCalledTimes(1)
    expect(h.release).toHaveBeenCalledTimes(1)
  })

  it("an enforced block stops the provider call", async () => {
    h.acquire.mockRejectedValue(new RateLimitError("blocked_daily_cost", "light-tier daily cost"))
    await expect(batchEmbed(["أ"])).rejects.toThrow(/rate limit/i)
    expect(h.create).not.toHaveBeenCalled()
  })

  it("the permit is released even when the provider fails", async () => {
    h.create.mockRejectedValue(new Error("boom"))
    // (the shared db-mock's update chain has no .catch, so the rethrown error
    // may be the mock's; what matters is that the call fails AND releases)
    await expect(batchEmbed(["أ"])).rejects.toThrow()
    expect(h.release).toHaveBeenCalledTimes(1)
  })

  it("embeddings are classified in the light tier", () => {
    expect(tierForTaskKind("embedding")).toBe("light")
    expect(tierForTaskKind("editorial")).toBe("expensive")
  })
})
