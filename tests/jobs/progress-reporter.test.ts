/**
 * The load-bearing safety guarantee: a progress-write failure must NEVER fail
 * the job it's reporting on. `createProgressReporter` wraps the (throwing) DB
 * writer and swallows — this proves it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/jobs/queue", () => ({ reportJobProgress: vi.fn() }))

import { reportJobProgress } from "@/lib/jobs/queue"
import { createProgressReporter } from "@/lib/jobs/progress-reporter"

beforeEach(() => vi.clearAllMocks())

describe("createProgressReporter", () => {
  it("forwards the write on the happy path, threading the claimed attempts as the fence", async () => {
    vi.mocked(reportJobProgress).mockResolvedValue(undefined)
    const report = createProgressReporter("job-1", 2)
    await expect(report({ stage: "transcribing" })).resolves.toBeUndefined()
    // The captured attempts (2) is passed through so the DB write can fence on it.
    expect(reportJobProgress).toHaveBeenCalledWith("job-1", { stage: "transcribing" }, 2)
  })

  it("SWALLOWS a rejecting write (resolves anyway) and surfaces it via onError", async () => {
    const boom = new Error("db down")
    vi.mocked(reportJobProgress).mockRejectedValue(boom)
    const onError = vi.fn()
    const report = createProgressReporter("job-1", 1, onError)
    // The whole point — this must NOT reject, or it would take down a running job.
    await expect(report({ stage: "transcribing" })).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledWith(boom)
  })

  it("still resolves when a rejecting write has no onError handler", async () => {
    vi.mocked(reportJobProgress).mockRejectedValue(new Error("db down"))
    const report = createProgressReporter("job-2", 1)
    await expect(report({ any: "shape" })).resolves.toBeUndefined()
  })
})
