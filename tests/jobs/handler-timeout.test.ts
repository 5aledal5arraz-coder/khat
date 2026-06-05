/**
 * A7 — Handler-timeout pattern unit tests.
 *
 * Pure tests. No DB. No worker process. Exercises the
 * `Promise.race([handler, timeout])` pattern the worker uses around
 * every handler invocation, plus the `HandlerTimeoutError` shape.
 *
 * What this locks down:
 *   1. `HandlerTimeoutError` has the right `name`, `message`, and
 *      structured fields (`elapsed_ms`, `timeout_ms`, `job_type`).
 *   2. A fast-resolving handler wins the race; the timeout is cleared.
 *   3. A slow handler trips the timeout; the rejection is a
 *      `HandlerTimeoutError` (so `instanceof` branches work).
 *   4. Once the timeout fires, a late-arriving handler completion
 *      does NOT cause an unhandled-rejection — the worker attaches a
 *      `.then(_, _)` catcher BEFORE Promise.race, so dangling
 *      rejections from the orphan handler stay caught.
 *
 * NOTE: this file tests the PATTERN inline because the worker keeps
 * the timeout wrapper local for readability. If a future change
 * extracts it to a shared helper, the assertions here flip from
 * "exercise the inline pattern" to "import the helper" without
 * changing what's being verified.
 */

import { describe, expect, it, vi } from "vitest"
import { HandlerTimeoutError } from "@/lib/jobs/types"

describe("HandlerTimeoutError", () => {
  it("carries name, message, and structured fields", () => {
    const err = new HandlerTimeoutError({
      jobType: "demo.echo",
      elapsedMs: 12_000,
      timeoutMs: 10_000,
    })
    expect(err.name).toBe("HandlerTimeoutError")
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(HandlerTimeoutError)
    expect(err.message).toContain("demo.echo")
    expect(err.message).toContain("12000ms")
    expect(err.message).toContain("10000ms")
    expect(err.elapsed_ms).toBe(12_000)
    expect(err.timeout_ms).toBe(10_000)
    expect(err.job_type).toBe("demo.echo")
  })
})

// ─── Pattern under test (mirrors worker.ts `processOne`) ─────────────

function raceWithTimeout<T>(
  handler: Promise<T>,
  opts: { jobType: string; timeoutMs: number },
): { result: Promise<T>; timeoutHandle: { current: ReturnType<typeof setTimeout> | null } } {
  const start = Date.now()
  const handle: { current: ReturnType<typeof setTimeout> | null } = { current: null }
  const timeout = new Promise<never>((_, reject) => {
    handle.current = setTimeout(() => {
      reject(
        new HandlerTimeoutError({
          jobType: opts.jobType,
          elapsedMs: Date.now() - start,
          timeoutMs: opts.timeoutMs,
        }),
      )
    }, opts.timeoutMs)
  })
  // Attach a late-arrival catcher exactly like worker.ts does so the
  // test exercises that branch too. We discard the result silently;
  // the worker logs it.
  handler.then(
    () => {},
    () => {},
  )
  return {
    result: Promise.race([handler, timeout]),
    timeoutHandle: handle,
  }
}

describe("worker timeout race pattern", () => {
  it("fast handler wins and returns its value", async () => {
    const handler = (async () => {
      await new Promise((r) => setTimeout(r, 5))
      return { ok: true }
    })()
    const { result, timeoutHandle } = raceWithTimeout(handler, {
      jobType: "demo.echo",
      timeoutMs: 200,
    })
    const out = await result
    expect(out).toEqual({ ok: true })
    // Clean up so the test runner can exit (mirror what worker does).
    if (timeoutHandle.current) clearTimeout(timeoutHandle.current)
  })

  it("slow handler trips the timeout — rejection is HandlerTimeoutError", async () => {
    const handler = new Promise<{ ok: true }>((resolve) => {
      // Deliberately resolve AFTER the timeout would have fired.
      setTimeout(() => resolve({ ok: true }), 200)
    })
    const { result } = raceWithTimeout(handler, {
      jobType: "demo.echo",
      timeoutMs: 30,
    })
    let caught: unknown = null
    try {
      await result
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(HandlerTimeoutError)
    if (caught instanceof HandlerTimeoutError) {
      expect(caught.job_type).toBe("demo.echo")
      expect(caught.timeout_ms).toBe(30)
      // elapsed_ms is measured at timeout fire; expect ≥ timeout_ms.
      expect(caught.elapsed_ms).toBeGreaterThanOrEqual(30)
    }
    // Let the orphan handler settle so vitest doesn't see a dangling timer.
    await handler
  })

  it("orphan handler that ALSO rejects after timeout does not throw unhandled", async () => {
    // Simulates the "handler errors, but timeout already fired first"
    // edge case. The .then(_, _) attached by the worker is what
    // prevents the unhandled-rejection warning.
    const orphanErr = new Error("late handler error")
    const handler = new Promise<{ ok: true }>((_, reject) => {
      setTimeout(() => reject(orphanErr), 100)
    })

    // Spy on process.on('unhandledRejection') indirectly by
    // installing a counter; if the orphan slips past the catcher,
    // Node will emit. We don't have a clean assertion for that in
    // vitest other than "no test runner explosion" — so we settle
    // for asserting the race result is the timeout error and the
    // orphan eventually settles cleanly.
    const sawUnhandled = vi.fn()
    const handler_ = (process.on as unknown as (e: string, fn: () => void) => void)
    handler_("unhandledRejection", sawUnhandled)

    const { result } = raceWithTimeout(handler, {
      jobType: "demo.echo",
      timeoutMs: 30,
    })
    let caught: unknown = null
    try {
      await result
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(HandlerTimeoutError)
    // Give the orphan a microtask to land + the late-arrival catcher
    // a tick to swallow it.
    await new Promise((r) => setTimeout(r, 150))
    expect(sawUnhandled).not.toHaveBeenCalled()
    process.off("unhandledRejection", sawUnhandled)
  })
})
