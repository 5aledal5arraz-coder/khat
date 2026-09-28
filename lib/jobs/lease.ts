/**
 * Worker job leases — how a dead worker's running job gets back to the queue.
 *
 * THE MODEL (2026-09-28, replaces the "widened lease" backstop)
 * ------------------------------------------------------------
 * A claimed job carries `locked_by` + `locked_at`. The worker that owns it
 * RENEWS `locked_at` every LEASE_RENEW_INTERVAL_MS from a timer — independent
 * of the handler, so a handler that goes quiet for ten minutes between two
 * Whisper chunks still has a fresh lease. (`ctx.reportProgress` renews too.)
 *
 * A job whose lease has not been renewed for the stale window
 * (`WORKER_LEASE_MS`, default DEFAULT_LEASE_STALE_MS) has an owner that is not
 * running any more, and the reaper — on its OWN timer, never behind a claim
 * loop that may be busy for 30 minutes — returns it to the queue.
 *
 * The old model widened the reap window past the longest handler budget
 * (30 min + 1) because nothing renewed a quiet handler's lease. That is what
 * left a job orphaned by `kill -9` stuck `running` for 31–55 minutes, with
 * «إعادة توليد الإعداد» disabled by the dedupe index the whole time. With
 * worker-side renewal the window no longer has to cover a handler's budget —
 * a timed-out handler is failed by its own worker, which then stops renewing.
 *
 * Boot adds an immediate path on top (worker.ts): if the previous heartbeat
 * was written from THIS host by a process that no longer exists, its running
 * jobs are reclaimed at once, before the first claim.
 *
 * RE-RUN CAP: a reclaimed job gets ONE extra run beyond its attempts budget
 * (an AI job with max_attempts 1 runs at most twice). If it is orphaned again
 * it is dead-lettered with REQUEUE_EXHAUSTED_MESSAGE instead of looping —
 * a job that kills its worker every time must not kill it forever, and the
 * operator decides whether to pay for another run («أعد المحاولة»).
 */

/** How often the owning worker renews the lease of each job it is running. */
export const LEASE_RENEW_INTERVAL_MS = 20_000

/** Default no-renewal window after which a running job is reclaimed. */
export const DEFAULT_LEASE_STALE_MS = 120_000

/**
 * Floor for a configured window: at least three missed renewals, so one slow
 * write or a GC pause can never make a live job look orphaned.
 */
export const MIN_LEASE_STALE_MS = 3 * LEASE_RENEW_INTERVAL_MS

/** How often the reaper runs (its own timer). */
export const REAP_INTERVAL_MS = 30_000

/** The stale window to use for a configured value (WORKER_LEASE_MS), clamped to the floor. */
export function leaseStaleMs(configured: number | null | undefined): number {
  const n = Number(configured)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LEASE_STALE_MS
  return Math.max(MIN_LEASE_STALE_MS, n)
}

/** error_message on a job the reaper put back in the queue. */
export const REQUEUED_MESSAGE =
  "توقّف عامل المهام أثناء تنفيذ هذه المهمة (أُعيد تشغيله) — أُعيدت إلى الطابور وستُنفَّذ مرة أخرى تلقائياً."

/** error_message on a job orphaned again after its one automatic re-run. */
export const REQUEUE_EXHAUSTED_MESSAGE =
  "توقّف عامل المهام أثناء تنفيذ هذه المهمة مرتين، فلم نُعِد تشغيلها تلقائياً مرة ثالثة. اضغط «أعد المحاولة» لتشغيلها من جديد."
