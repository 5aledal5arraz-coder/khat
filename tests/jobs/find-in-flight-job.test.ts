/**
 * Job queue — `findInFlightJobByPayload`.
 *
 * The primitive behind two Studio fixes: RE-ATTACHING the UI to an in-flight
 * transcription after a page refresh, and DEDUPING a second enqueue for the same
 * session. It must return the mapped row when a non-terminal job exists and null
 * when none does. DB is the shared drizzle mock — no real database.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "../db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import { findInFlightJobByPayload } from "@/lib/jobs/queue"

function jobRow(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    id: "job-1",
    type: "studio.episode_map",
    status: "running",
    payload: { sessionId: "sess-1" },
    result: null,
    progress: { stage: "transcribing", fraction: 0.3 },
    error_message: null,
    priority: 0,
    attempts: 1,
    max_attempts: 3,
    run_after: now,
    locked_by: "worker-1",
    locked_at: now,
    started_at: now,
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

beforeEach(() => {
  resetMock()
})

describe("findInFlightJobByPayload", () => {
  it("returns the mapped in-flight job when one exists", async () => {
    mockSelectResult([jobRow()])
    const job = await findInFlightJobByPayload(
      "studio.episode_map",
      "sessionId",
      "sess-1",
    )
    expect(job).not.toBeNull()
    expect(job!.id).toBe("job-1")
    expect(job!.status).toBe("running")
    // mapRow normalisation: timestamps come back as ISO strings, progress passes through.
    expect(typeof job!.started_at).toBe("string")
    expect(job!.progress).toEqual({ stage: "transcribing", fraction: 0.3 })
  })

  it("returns null when no non-terminal job matches", async () => {
    mockSelectResult([])
    const job = await findInFlightJobByPayload(
      "studio.episode_review",
      "editedSessionId",
      "sess-2",
    )
    expect(job).toBeNull()
  })

  it("only takes the first (latest) row when several are queued", async () => {
    // The query is ORDER BY created_at DESC LIMIT 1 — the mock resolves whatever
    // the single .limit() call yields, so we assert the top-of-list contract.
    mockSelectResult([jobRow({ id: "newest" })])
    const job = await findInFlightJobByPayload("studio.episode_map", "sessionId", "sess-1")
    expect(job!.id).toBe("newest")
  })
})
