/**
 * «أعد المحاولة» (retryJobAction) — re-enqueue a finished job with EXACTLY the
 * payload it ran with, only for the slow-AI types the admin cards show.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api-utils", () => ({
  requireActionRole: vi.fn(async () => ({ ok: true as const, user: { id: "admin-1" } })),
}))
vi.mock("@/lib/jobs/queue", () => ({
  getJob: vi.fn(),
  enqueueJobOnce: vi.fn(async () => ({ job: { id: "job-new" }, alreadyRunning: false })),
}))

import { requireActionRole } from "@/lib/api-utils"
import { getJob, enqueueJobOnce } from "@/lib/jobs/queue"
import { retryJobAction } from "@/app/admin/components/job-retry-actions"

const PAYLOAD = {
  preparationId: "prep-1",
  eirId: "eir-1",
  language: "ar",
  format: "course",
  targetMinutes: 90,
  force: true,
  trigger: "regenerate",
  requestedBy: "admin-1",
}
const job = (over: Record<string, unknown> = {}) => ({
  id: "job-old",
  type: "prep.generate_v2",
  status: "dead",
  payload: PAYLOAD,
  dedupe_key: "prep_v2:prep-1",
  max_attempts: 1,
  priority: 10,
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("retryJobAction", () => {
  it("re-enqueues a dead job with the same type, payload, dedupe key, budget and priority", async () => {
    vi.mocked(getJob).mockResolvedValue(job() as never)
    const r = await retryJobAction("job-old")
    expect(r).toMatchObject({ ok: true, jobId: "job-new", alreadyRunning: false })
    expect(enqueueJobOnce).toHaveBeenCalledWith("prep.generate_v2", PAYLOAD, {
      dedupeKey: "prep_v2:prep-1",
      maxAttempts: 1,
      priority: 10,
    })
  })

  it("works for every card type (warning / not-done results too)", async () => {
    for (const type of ["season.hybrid_generate", "season.batch_generate", "original.generate_topics", "studio.transcribe"]) {
      vi.mocked(getJob).mockResolvedValueOnce(job({ type, status: "succeeded", dedupe_key: `${type}:k` }) as never)
      const r = await retryJobAction("job-old")
      expect(r.ok).toBe(true)
    }
    expect(enqueueJobOnce).toHaveBeenCalledTimes(4)
  })

  it("refuses a type the cards don't show (never re-runs e.g. a newsletter send)", async () => {
    for (const type of ["newsletter.send_campaign", "partner.task_reminder", "market.extract"]) {
      vi.mocked(getJob).mockResolvedValueOnce(job({ type, dedupe_key: "x" }) as never)
      const r = await retryJobAction("job-old")
      expect(r.ok).toBe(false)
      expect(r.message).toMatch(/لا يمكن/)
    }
    expect(enqueueJobOnce).not.toHaveBeenCalled()
  })

  it("refuses a job without a dedupe key, and a missing job", async () => {
    vi.mocked(getJob).mockResolvedValueOnce(job({ dedupe_key: null }) as never)
    expect((await retryJobAction("job-old")).ok).toBe(false)
    vi.mocked(getJob).mockResolvedValueOnce(null)
    expect((await retryJobAction("nope")).ok).toBe(false)
    expect(enqueueJobOnce).not.toHaveBeenCalled()
  })

  it("a job still in flight is returned as-is — no second run", async () => {
    vi.mocked(getJob).mockResolvedValue(job({ status: "running" }) as never)
    const r = await retryJobAction("job-old")
    expect(r).toMatchObject({ ok: true, jobId: "job-old", alreadyRunning: true })
    expect(enqueueJobOnce).not.toHaveBeenCalled()
  })

  it("requires the EDITOR role", async () => {
    vi.mocked(requireActionRole).mockResolvedValueOnce({ ok: false, error: "ليس لديك صلاحية" } as never)
    const r = await retryJobAction("job-old")
    expect(r).toEqual({ ok: false, message: "ليس لديك صلاحية" })
    expect(getJob).not.toHaveBeenCalled()
  })
})
