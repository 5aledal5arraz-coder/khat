/**
 * Effective worker-lease computation — the stale-lease reaper backstop.
 *
 * The reaper (`reclaimStaleJobs`) returns any `running` job whose `locked_at` is
 * older than the lease to `pending`, assuming its worker died. A live handler
 * refreshes `locked_at` on every progress heartbeat (`reportJobProgress`), so a
 * healthy long job keeps its lease fresh — that is the PRIMARY protection. This
 * is the BACKSTOP for the gap where a handler goes quiet BETWEEN two long chunks
 * (no heartbeat): if the configured lease is shorter than a handler's own
 * timeout budget, the reaper could reclaim a job that is still legitimately
 * running → DOUBLE execution (e.g. lease=5min vs studio.* map/review=30min).
 *
 * The invariant: the effective lease is ALWAYS STRICTLY GREATER than the longest
 * handler budget. When the configured lease is ≤ that budget we widen to
 * (budget + buffer); a configured lease already above the budget is kept as-is.
 * Strict inequality matters — if lease == budget, a handler that hits its own
 * timeout at the edge races the reaper; keeping lease > budget guarantees the
 * worker fails (and can retry) a timed-out handler BEFORE the reaper would ever
 * treat its row as stale. Self-correcting and loud (via `onWiden`) — never a
 * throw, because a worker that refuses to boot is worse than one running on a
 * widened lease.
 */

export const LEASE_SAFETY_BUFFER_MS = 60_000

/**
 * Dedicated window for the BOOT-time stale reclaim (worker.ts), distinct from the
 * in-loop reaper's (possibly widened) lease. See worker.ts for the full rationale:
 * at boot the predecessor worker is dead-for-certain (single PM2 worker in prod),
 * and a job stalled seconds before a restart has a locked_at only seconds old —
 * far younger than the ~31-min widened lease — so keying boot reclaim on that lease
 * would SKIP it and leave the user on a frozen counter until the loop reaper fires.
 * A small fixed window recovers it promptly and stays safe even multi-worker,
 * because a live handler renews its lease every chunk (~1–3 min) so its locked_at
 * never ages past 5 min.
 */
export const BOOT_RECLAIM_STALE_MS = 5 * 60_000

export interface EffectiveLeaseInput {
  /** Lease from WORKER_LEASE_MS (or its default). */
  configuredLeaseMs: number
  /** Per-type handler timeouts (worker.ts HANDLER_TIMEOUT_MS). */
  handlerTimeouts: Record<string, number>
  /** Fallback timeout for types without a per-type override. */
  defaultTimeoutMs: number
  /** Head-room added on top of the longest budget when widening. */
  bufferMs?: number
  /** Called ONLY when the lease is widened, so the caller can warn loudly. */
  onWiden?: (info: {
    configuredLeaseMs: number
    maxHandlerTimeoutMs: number
    effectiveLeaseMs: number
  }) => void
}

/**
 * Returns the configured lease, or a widened lease when the configured value is
 * shorter than the longest handler budget. See module doc for the why.
 */
export function effectiveLeaseMs(input: EffectiveLeaseInput): number {
  const buffer = input.bufferMs ?? LEASE_SAFETY_BUFFER_MS
  const maxHandlerTimeoutMs = Math.max(
    input.defaultTimeoutMs,
    ...Object.values(input.handlerTimeouts),
  )
  // `<=` (not `<`): when the configured lease equals the longest budget we STILL
  // widen, so the effective lease stays strictly greater than the budget and a
  // handler timing out at the edge is always failed by the worker before the
  // reaper could reclaim its row.
  if (input.configuredLeaseMs <= maxHandlerTimeoutMs) {
    const widened = maxHandlerTimeoutMs + buffer
    input.onWiden?.({
      configuredLeaseMs: input.configuredLeaseMs,
      maxHandlerTimeoutMs,
      effectiveLeaseMs: widened,
    })
    return widened
  }
  return input.configuredLeaseMs
}
