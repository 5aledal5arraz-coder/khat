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
vi.mock("@/lib/khat-map/learning/decisions", () => ({ recordDecision: vi.fn() }))

import { getSeasonById } from "@/lib/khat-map/core/queries"
import { generateBatch } from "@/lib/khat-map/v2"
import { AngleBankExhaustedError } from "@/lib/khat-map/v2/strict"
import { generateBatchAction } from "@/app/admin/khat-brain/seasons/actions"

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

  it("AngleBankExhaustedError keeps its dedicated code (not swallowed)", async () => {
    vi.mocked(getSeasonById).mockResolvedValue({ v2_mode: "guided" } as never)
    vi.mocked(generateBatch).mockRejectedValue(new AngleBankExhaustedError(1, 4))

    const r = await generateBatchAction(INPUT)

    expect(r.success).toBe(false)
    if (r.success) throw new Error("unreachable")
    expect(r.code).toBe("ANGLE_BANK_EXHAUSTED")
  })

  it("a successful batch is unaffected by moving the lookup", async () => {
    vi.mocked(getSeasonById).mockResolvedValue({ v2_mode: "guided" } as never)
    vi.mocked(generateBatch).mockResolvedValue(OK_BATCH as never)

    const r = await generateBatchAction(INPUT)

    expect(r.success).toBe(true)
    expect(generateBatch).toHaveBeenCalledOnce()
  })
})
