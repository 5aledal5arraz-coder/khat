/**
 * W1-3 regression — `generateHybridTopicsAction` must never throw.
 *
 * The action is the «توليد» button inside a season. Before this fix its
 * 123-line body had no try/catch at all, so a throw from any of its four
 * awaited dependencies escaped the declared `HybridActionResult` contract
 * and hit app/admin/error.tsx — the operator lost the whole workspace
 * instead of seeing a failure card in place.
 *
 * The AI router raises `RateLimitError` by design and documents that
 * generators must catch it, so it gets its own operator message: nothing
 * is broken, waiting actually fixes it.
 *
 * Each dependency is forced to throw in turn; every case must return a
 * result object with ok=false and a non-empty Arabic message.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { HybridReadiness } from "@/lib/hybrid-topics/diagnostics"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/api-utils", () => ({
  requireActionRole: vi.fn(async () => ({
    ok: true as const,
    user: { id: "admin-1" },
  })),
  getAdminAuthUser: vi.fn(async () => ({ id: "admin-1" })),
}))

vi.mock("@/lib/hybrid-topics/diagnostics", () => ({
  getHybridReadiness: vi.fn(),
}))
vi.mock("@/lib/hybrid-topics/generate", () => ({
  generateHybridTopics: vi.fn(),
}))
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob: vi.fn(), enqueueJobOnce: vi.fn() }))

import { getHybridReadiness } from "@/lib/hybrid-topics/diagnostics"
import { generateHybridTopics } from "@/lib/hybrid-topics/generate"
import { enqueueJob, enqueueJobOnce } from "@/lib/jobs/queue"
import { generateHybridTopicsAction } from "@/app/admin/khat-brain/seasons/[seasonId]/_components/hybrid-actions"
import { runSeasonHybridGenerate } from "@/lib/jobs/handlers/season-hybrid"
import type { HybridJobPayload } from "@/lib/jobs/season-jobs"

/**
 * The generation itself runs in the worker now (`season.hybrid_generate`);
 * the action does the pre-flight and enqueues. Generator-failure cases are
 * pinned on the handler, which produces the operator message; the result is
 * adapted to the same shape so the assertions below read unchanged.
 */
const JOB: HybridJobPayload = {
  seasonId: "season-1",
  language: "ar",
  count: 10,
  allowKuwaitBias: false,
  createdBy: "admin-1",
  analysisKicked: false,
}
async function runJob() {
  const r = await runSeasonHybridGenerate(JOB, async () => {})
  return { ...r, message: r.ok ? null : r.messageAr ?? "" }
}

/** Readiness snapshot: generator ready, nothing to kick. */
function readyState(over: Partial<HybridReadiness> = {}): HybridReadiness {
  return {
    market_signals_total: 10,
    market_signals_extracted: 10,
    market_signals_unextracted: 0,
    market_signals_scored: 10,
    market_clusters_total: 3,
    original_topics_fresh: 4,
    worked_strong_domains: 2,
    worked_weak_domains: 1,
    has_clusters: true,
    has_recent_signals: true,
    has_scored_signals: true,
    has_originals: true,
    has_memory: true,
    generator_ready: true,
    blocking_reason: null,
    should_trigger_extraction: false,
    should_trigger_scoring: false,
    should_trigger_clustering: false,
    inflight: { collect: false, extract: false, score: false, cluster: false },
    ...over,
  }
}

/** Mirrors lib/ai-router/rate-limit.ts — the router sets `name` so call
 *  sites can recognise it without importing the rate-limit module. */
function rateLimitError(): Error {
  const e = new Error("AI rate limit blocked: blocked_daily_cost — ledger maxed")
  e.name = "RateLimitError"
  return e
}

const INPUT = { seasonId: "season-1", language: "ar" as const, count: 10 }

/** Every failure must be a well-formed, operator-readable Arabic result. */
function expectArabicFailure(r: {
  ok: boolean
  message: string | null
  generated_for_review: number
  auto_filtered: number
  preview_titles: string[]
}) {
  expect(r.ok).toBe(false)
  expect(typeof r.message).toBe("string")
  expect(r.message!.length).toBeGreaterThan(0)
  // Arabic copy — never a raw English exception message.
  expect(r.message).toMatch(/[؀-ۿ]/)
  expect(r.message).not.toMatch(/Error|undefined|null/)
  expect(r.generated_for_review).toBe(0)
  expect(r.auto_filtered).toBe(0)
  expect(r.preview_titles).toEqual([])
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(enqueueJob).mockResolvedValue({} as never)
  vi.mocked(enqueueJobOnce).mockResolvedValue({
    job: { id: "job-1", status: "pending" },
    alreadyRunning: false,
  } as never)
  // Silence the intentional console.error in the action's catch.
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("generateHybridTopicsAction — every dependency throwing", () => {
  it("getHybridReadiness() throws → Result, not a thrown error", async () => {
    vi.mocked(getHybridReadiness).mockRejectedValue(
      new Error("Connection terminated unexpectedly"),
    )

    const r = await generateHybridTopicsAction(INPUT)

    expectArabicFailure(r)
    expect(r.reason).toBe("ai_failed")
    expect(generateHybridTopics).not.toHaveBeenCalled()
  })

  it("enqueueJob() throws → Result, not a thrown error", async () => {
    vi.mocked(getHybridReadiness).mockResolvedValue(
      readyState({ should_trigger_scoring: true }),
    )
    vi.mocked(enqueueJob).mockRejectedValue(new Error("jobs table locked"))

    const r = await generateHybridTopicsAction(INPUT)

    expectArabicFailure(r)
    expect(generateHybridTopics).not.toHaveBeenCalled()
  })

  it("enqueueJobOnce() throws → Result, not a thrown error", async () => {
    vi.mocked(getHybridReadiness).mockResolvedValue(readyState())
    vi.mocked(enqueueJobOnce).mockRejectedValue(new Error("jobs table locked"))

    const r = await generateHybridTopicsAction(INPUT)

    expectArabicFailure(r)
    expect(r.reason).toBe("ai_failed")
    expect(r.analysis_pending).toBe(false)
  })

  it("a generator throw inside the job fails the job (the worker records it) — never a silent success", async () => {
    vi.mocked(getHybridReadiness).mockResolvedValue(readyState())
    vi.mocked(generateHybridTopics).mockRejectedValue(
      new Error("openai request failed: 500"),
    )
    await expect(runSeasonHybridGenerate(JOB, async () => {})).rejects.toThrow("500")
  })

  it("a non-Error throw (string) still yields a clean Arabic Result", async () => {
    vi.mocked(getHybridReadiness).mockRejectedValue("boom")

    const r = await generateHybridTopicsAction(INPUT)

    expectArabicFailure(r)
  })
})

describe("generateHybridTopicsAction — RateLimitError is its own message", () => {
  it("distinguishes a rate limit from a generic AI failure", async () => {
    vi.mocked(getHybridReadiness).mockResolvedValue(readyState())
    vi.mocked(generateHybridTopics).mockRejectedValue(rateLimitError())

    const rateLimited = await runJob()
    expectArabicFailure(rateLimited)

    // A generic generator failure reports the generator's own reason label.
    vi.mocked(generateHybridTopics).mockResolvedValue({
      ok: false,
      generation_id: null,
      ai_run_id: null,
      asked: 10,
      accepted: [],
      rejected: [],
      rejection_summary: {},
      persisted: [],
      enrichment: { requested: 0, enriched: 0, unenriched: 0 },
      reason: "ai_failed",
    } as never)
    const generic = await runJob()
    expectArabicFailure(generic)

    // The whole point of the branch: the operator is told to wait, not
    // that something is broken.
    expect(rateLimited.message).not.toBe(generic.message)
    expect(rateLimited.message).toContain("حدّ استخدام الذكاء الاصطناعي")
  })

  it("never leaks the router's English rate-limit text", async () => {
    vi.mocked(getHybridReadiness).mockRejectedValue(rateLimitError())

    const r = await generateHybridTopicsAction(INPUT)

    expect(r.message).not.toContain("rate limit")
    expect(r.message).not.toContain("blocked_daily_cost")
  })
})

describe("generateHybridTopicsAction — happy paths still intact", () => {
  it("role gate rejection is unchanged (returns before the try)", async () => {
    const { requireActionRole } = await import("@/lib/api-utils")
    vi.mocked(requireActionRole).mockResolvedValueOnce({
      ok: false,
      error: "ليس لديك صلاحية لهذا الإجراء",
    })

    const r = await generateHybridTopicsAction(INPUT)

    expect(r.ok).toBe(false)
    expect(r.message).toBe("ليس لديك صلاحية لهذا الإجراء")
    expect(getHybridReadiness).not.toHaveBeenCalled()
  })

  it("analysis_pending short-circuit still returns without calling the AI", async () => {
    vi.mocked(getHybridReadiness).mockResolvedValue(
      readyState({ blocking_reason: "analysis_pending", generator_ready: false }),
    )

    const r = await generateHybridTopicsAction(INPUT)

    expect(r.ok).toBe(false)
    expect(r.analysis_pending).toBe(true)
    expect(r.reason).toBe("analysis_pending")
    expect(generateHybridTopics).not.toHaveBeenCalled()
  })

  it("a successful generation is unaffected by the wrapper", async () => {
    vi.mocked(getHybridReadiness).mockResolvedValue(readyState())
    vi.mocked(generateHybridTopics).mockResolvedValue({
      ok: true,
      generation_id: "gen-1",
      ai_run_id: "run-1",
      asked: 2,
      accepted: [{ title: "موضوع أول" }, { title: "موضوع ثانٍ" }],
      rejected: [{ title: "مرفوض" }],
      rejection_summary: {},
      persisted: [{ id: "c1" }, { id: "c2" }],
      enrichment: { requested: 2, enriched: 1, unenriched: 1 },
      fallback_path: "clusters",
    } as never)

    const r = await runJob()

    expect(r.ok).toBe(true)
    expect(r.message).toBeNull()
    expect(r.generated_for_review).toBe(2)
    expect(r.auto_filtered).toBe(1)
    // Coverage flows through honestly: 1 of the 2 persisted cards is unenriched.
    expect(r.unenriched).toBe(1)
    expect(r.preview_titles).toEqual(["موضوع أول", "موضوع ثانٍ"])
    // …and the partial enrichment is a visible warning, not a clean success.
    expect(r.warningAr).toMatch(/بدون إثراء تحريري/)
  })

  it("the action enqueues one job and never calls the generator in the request", async () => {
    vi.mocked(getHybridReadiness).mockResolvedValue(readyState())

    const r = await generateHybridTopicsAction(INPUT)

    expect(r.ok).toBe(true)
    expect(r.jobId).toBe("job-1")
    expect(generateHybridTopics).not.toHaveBeenCalled()
    expect(vi.mocked(enqueueJobOnce).mock.calls[0][0]).toBe("season.hybrid_generate")
    expect(vi.mocked(enqueueJobOnce).mock.calls[0][2]).toMatchObject({
      dedupeKey: "hybrid:season-1",
      maxAttempts: 1,
    })
  })
})

/**
 * Batch 3 D5b (2026-09-29): the season page kept showing «جاري تحليل إشارات
 * السوق… سنعرض المرشحات عند اكتمال التحليل.» after the hybrid job had
 * completed. The job result baked `payload.analysisKicked` — a fact from
 * ENQUEUE time — into a frozen row, and the panel re-rendered it on every
 * reload (the page re-attaches the finished job) as if it were live.
 */
describe("hybrid job — analysis banner reflects the state at completion, not at enqueue", () => {
  const OK = {
    ok: true,
    generation_id: "gen-1",
    ai_run_id: "run-1",
    asked: 1,
    accepted: [{ title: "موضوع" }],
    rejected: [],
    rejection_summary: {},
    persisted: [{ id: "c1" }],
    enrichment: { requested: 1, enriched: 1, unenriched: 0 },
    fallback_path: "clusters",
  }

  it("a stage kicked at enqueue that has since finished → analysis_pending false", async () => {
    vi.mocked(getHybridReadiness).mockResolvedValue(readyState())
    vi.mocked(generateHybridTopics).mockResolvedValue(OK as never)
    const r = await runSeasonHybridGenerate({ ...JOB, analysisKicked: true }, async () => {})
    expect(r.ok).toBe(true)
    expect(r.analysis_pending).toBe(false)
  })

  it("sight: analysis still in flight at completion → true", async () => {
    vi.mocked(getHybridReadiness).mockResolvedValue(
      readyState({ inflight: { collect: false, extract: false, score: false, cluster: true } }),
    )
    vi.mocked(generateHybridTopics).mockResolvedValue(OK as never)
    const r = await runSeasonHybridGenerate({ ...JOB, analysisKicked: false }, async () => {})
    expect(r.analysis_pending).toBe(true)
  })
})
