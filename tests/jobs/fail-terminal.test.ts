/**
 * failJob — terminal dead-letter path (quota/billing fast-fail).
 *
 * A terminal failure (e.g. OpenAI out of quota) must dead-letter on the FIRST
 * attempt instead of burning all 3 retries over ~8 minutes behind a spinner. The
 * worker passes `{ terminal: true }` for these; a normal failure still retries
 * while attempts remain.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { mockDb, mockSelectResult, resetMock } from "../db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import { failJob } from "@/lib/jobs/queue"

beforeEach(() => {
  resetMock()
  vi.clearAllMocks()
})

const lastSet = () => {
  const chain = mockDb.update.mock.results.at(-1)!.value as {
    set: ReturnType<typeof vi.fn>
  }
  return chain.set.mock.calls[0][0] as Record<string, unknown>
}

describe("failJob — terminal dead-letters immediately", () => {
  it("marks a job DEAD on a terminal failure even with attempts remaining", async () => {
    mockSelectResult([{ attempts: 1, max_attempts: 3 }]) // 2 attempts left
    const out = await failJob("job-1", "no quota", undefined, { terminal: true })

    expect(out.status).toBe("dead")
    const setArg = lastSet()
    expect(setArg.status).toBe("dead")
    expect(setArg.completed_at).toBeInstanceOf(Date) // terminal → completed stamped
    expect(setArg.error_message).toBe("no quota")
  })

  it("still RETRIES a non-terminal failure while attempts remain", async () => {
    mockSelectResult([{ attempts: 1, max_attempts: 3 }])
    const out = await failJob("job-1", "transient blip")

    expect(out.status).toBe("pending")
    const setArg = lastSet()
    expect(setArg.status).toBe("pending")
    expect(setArg.completed_at).toBeNull()
  })

  it("terminal:false with attempts exhausted is still dead (no regression)", async () => {
    mockSelectResult([{ attempts: 3, max_attempts: 3 }])
    const out = await failJob("job-1", "x", undefined, { terminal: false })
    expect(out.status).toBe("dead")
  })
})
