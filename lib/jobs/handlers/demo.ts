/**
 * Demo job handler — proves the queue works end-to-end without doing
 * anything dangerous. Used by the smoke test and as a reference for how
 * to write a real handler.
 */

import { registerHandler } from "../registry"

interface DemoPayload {
  echo?: string
  /** Force the handler to throw — exercises the failure path. */
  shouldFail?: boolean
  /**
   * A7 — sleep this many ms before resolving. Used to exercise the
   * per-handler timeout path in operator smoke runs. demo.echo's
   * configured timeout is 10s (HANDLER_TIMEOUT_MS in worker.ts);
   * setting sleepMs > 10_000 trips the timeout and the job surfaces
   * a `HandlerTimeoutError` through the existing failJob → retry/dead
   * flow.
   */
  sleepMs?: number
}

interface DemoResult extends Record<string, unknown> {
  echoed: string | null
  attempt: number
  workerId: string
}

registerHandler<DemoPayload, DemoResult>("demo.echo", async (payload, ctx) => {
  if (payload.shouldFail) {
    throw new Error(`demo.echo: deliberate failure (attempt ${ctx.attempt})`)
  }
  // Tiny delay to make latency observable in jobs.completed_at - started_at.
  // A7 — when `sleepMs` is set, prefer it (used by the forced-timeout
  // smoke). Otherwise keep the existing 50ms cadence.
  await new Promise((resolve) =>
    setTimeout(resolve, payload.sleepMs ?? 50),
  )
  return {
    echoed: payload.echo ?? null,
    attempt: ctx.attempt,
    workerId: ctx.workerId,
  }
})
