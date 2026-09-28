/**
 * W1-2 regression — `generateBatchAction` must never throw.
 *
 * `getSeasonById()` used to be awaited ABOVE the action's try block, so a
 * pool hiccup on that one line escaped the `Result` contract entirely.
 * The consequence is not silence: the rejected Server Action reaches
 * app/admin/error.tsx, which renders «حدث خطأ غير متوقع في اللوحة» and —
 * because it is an error boundary — remounts the segment and destroys
 * every pending card the operator hasn't decided on yet.
 *
 * These tests force the lookup to throw and assert the action degrades to
 * a `{ success: false }` Result with an Arabic message instead.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("./db-mock")
  return { db: mockDb }
})

vi.mock("@/lib/api-utils", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1", role: "ADMIN" })),
  requireActionRole: vi.fn(async () => ({
    ok: true as const,
    user: { id: "admin-1" },
  })),
  getAdminAuthUser: vi.fn(async () => ({ id: "admin-1" })),
}))

vi.mock("@/lib/khat-map/core/queries", () => ({
  getSeasonById: vi.fn(),
  createSeason: vi.fn(),
  patchSeasonControls: vi.fn(),
  createEpisodeCandidate: vi.fn(),
  getEpisodeCandidateById: vi.fn(),
  updateEpisodeCandidateStatus: vi.fn(),
}))

vi.mock("@/lib/khat-map/v2", () => ({
  generateBatch: vi.fn(),
  generateGuestFirstCards: vi.fn(),
  recordDecisionAndFingerprint: vi.fn(),
  undoDecisionAndFingerprint: vi.fn(),
}))

vi.mock("@/lib/khat-brain", () => ({ ensureEirForCandidate: vi.fn() }))
// The engines run in the worker now (season.batch_generate); the action only
// enqueues. Mocked so no test ever reaches a real queue row.
vi.mock("@/lib/jobs/queue", () => ({
  enqueueJobOnce: vi.fn(async () => ({
    job: { id: "job-1", status: "pending" },
    alreadyRunning: false,
  })),
  listAttachableJobsByDedupeKeys: vi.fn(async () => new Map()),
}))
vi.mock("@/lib/khat-map/learning/decisions", () => ({ recordDecision: vi.fn() }))

import { getSeasonById } from "@/lib/khat-map/core/queries"
import { generateBatch } from "@/lib/khat-map/v2"
import { AngleBankExhaustedError } from "@/lib/khat-map/v2/strict"
import { generateBatchAction } from "@/app/admin/khat-brain/seasons/actions"
import { runSeasonBatchGenerate } from "@/lib/jobs/handlers/season-batch"
import { enqueueJobOnce } from "@/lib/jobs/queue"

const INPUT = { seasonId: "season-1", size: 4 }

/** A batch result with cards — the plain success shape. */
const OK_BATCH = {
  cards: [{ id: "card-1" }],
  stats: { oversampled: 0, editorial_dropped: 0, dedup_dropped: 0 },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("generateBatchAction — getSeasonById failure is contained", () => {
  it("returns a Result instead of throwing when the season lookup fails", async () => {
    vi.mocked(getSeasonById).mockRejectedValue(
      new Error("Connection terminated unexpectedly"),
    )

    // The assertion that matters: this call resolves. Before the fix it
    // rejected, and the rejection is what wiped the operator's workspace.
    const r = await generateBatchAction(INPUT)

    expect(r.success).toBe(false)
    expect(generateBatch).not.toHaveBeenCalled()
  })

  it("surfaces an Arabic, non-empty message — never a blank screen", async () => {
    vi.mocked(getSeasonById).mockRejectedValue(new Error("pool timeout"))

    const r = await generateBatchAction(INPUT)

    expect(r.success).toBe(false)
    if (r.success) throw new Error("unreachable")
    expect(r.error.length).toBeGreaterThan(0)
  })

  it("a non-Error throw still yields the Arabic fallback copy", async () => {
    vi.mocked(getSeasonById).mockRejectedValue("ECONNRESET")

    const r = await generateBatchAction(INPUT)

    expect(r.success).toBe(false)
    if (r.success) throw new Error("unreachable")
    expect(r.error).toBe("حدث خطأ غير متوقع")
  })
})

describe("generateBatchAction — pre-existing branches still behave", () => {
  it("missing season still returns the 'not found' Result", async () => {
    vi.mocked(getSeasonById).mockResolvedValue(null)

    const r = await generateBatchAction(INPUT)

    expect(r).toEqual({ success: false, error: "الموسم غير موجود" })
    expect(generateBatch).not.toHaveBeenCalled()
  })

  it("manual mode is still refused before the engine runs", async () => {
    vi.mocked(getSeasonById).mockResolvedValue({ v2_mode: "manual" } as never)

    const r = await generateBatchAction(INPUT)

    expect(r.success).toBe(false)
    if (r.success) throw new Error("unreachable")
    expect(r.error).toContain("الوضع اليدوي")
    expect(generateBatch).not.toHaveBeenCalled()
  })

  it("AngleBankExhaustedError keeps its dedicated code (not swallowed) — now in the job result", async () => {
    vi.mocked(getSeasonById).mockResolvedValue({ v2_mode: "guided" } as never)
    vi.mocked(generateBatch).mockRejectedValue(new AngleBankExhaustedError(1, 4))

    const r = await runSeasonBatchGenerate(
      { seasonId: "season-1", mode: "generate", adminId: "admin-1", size: 4 },
      async () => {},
    )

    expect(r.ok).toBe(false)
    expect(r.code).toBe("ANGLE_BANK_EXHAUSTED")
    expect(r.messageAr).toContain("بنك الزوايا نفد")
    expect(r.retryable).toBe(false)
  })

  it("a valid request enqueues one job and never runs the engine in the request", async () => {
    vi.mocked(getSeasonById).mockResolvedValue({ v2_mode: "guided" } as never)
    vi.mocked(generateBatch).mockResolvedValue(OK_BATCH as never)

    const r = await generateBatchAction(INPUT)

    expect(r).toEqual({ success: true, data: { jobId: "job-1", alreadyRunning: false } })
    expect(generateBatch).not.toHaveBeenCalled()
    expect(enqueueJobOnce).toHaveBeenCalledOnce()
    expect(vi.mocked(enqueueJobOnce).mock.calls[0][0]).toBe("season.batch_generate")
  })

  it("the handler reports a successful batch with its count and batch index", async () => {
    vi.mocked(getSeasonById).mockResolvedValue({ v2_mode: "guided" } as never)
    vi.mocked(generateBatch).mockResolvedValue({
      ...OK_BATCH,
      batch_index: 3,
      cards: [{ topic_candidate: { working_title: "عنوان" } }],
    } as never)

    const r = await runSeasonBatchGenerate(
      { seasonId: "season-1", mode: "generate", adminId: "admin-1", size: 4 },
      async () => {},
    )

    expect(r).toMatchObject({ ok: true, cards: 1, batch_index: 3, titles: ["عنوان"] })
  })
})
