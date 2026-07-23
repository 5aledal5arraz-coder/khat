/**
 * Khat Brain — job runtime types.
 */

import type { JobStatus } from "@/lib/db/schema/jobs"

export type { JobStatus }

/**
 * A7 — Thrown by the worker when a handler exceeds its per-type
 * timeout. Surfaces distinctly from generic Errors so:
 *   • the worker's catch block can label log lines + events with a
 *     "timed out" marker (better operator signal than "Error: x");
 *   • future code can branch on instanceof if it needs to (e.g. a
 *     retry-policy override could decide not to retry a timeout).
 *
 * The error message includes the elapsed-ms vs configured-ms so the
 * fail-log row is operator-actionable: "did the timeout fire because
 * the handler is genuinely wedged, or because the budget is too low?"
 */
export class HandlerTimeoutError extends Error {
  readonly elapsed_ms: number
  readonly timeout_ms: number
  readonly job_type: string
  constructor(opts: { jobType: string; elapsedMs: number; timeoutMs: number }) {
    super(
      `Handler "${opts.jobType}" timed out after ${opts.elapsedMs}ms ` +
        `(budget ${opts.timeoutMs}ms)`,
    )
    this.name = "HandlerTimeoutError"
    this.elapsed_ms = opts.elapsedMs
    this.timeout_ms = opts.timeoutMs
    this.job_type = opts.jobType
  }
}

/**
 * Thrown (or recognized) when a job failed for a reason where retrying is
 * futile — e.g. the OpenAI account is out of quota/credit. The worker
 * dead-letters it IMMEDIATELY (skips the remaining attempts) and surfaces
 * `message` verbatim as the job's `error_message`, so the UI shows a clear
 * cause at once instead of spinning through 3 doomed retries (~8 min). Quota
 * errors are also recognized structurally at the worker via
 * `isQuotaExceededError`, so a handler need not wrap them explicitly; this
 * class is for a handler that wants to signal "terminal" for any other reason.
 */
export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NonRetryableJobError"
  }
}

/**
 * Handler shape. Every job type registers one. The handler receives the
 * payload it was enqueued with and the row metadata, and returns a
 * result that gets stored on the job row. Throwing causes the worker to
 * mark the job as failed (and retry, if attempts < max_attempts).
 */
export type JobHandler<TPayload = Record<string, unknown>, TResult = Record<string, unknown> | void> = (
  payload: TPayload,
  ctx: JobContext,
) => Promise<TResult>

export interface JobContext {
  jobId: string
  jobType: string
  /** Current attempt number (1-indexed). */
  attempt: number
  maxAttempts: number
  /** Worker identity stamped on the row when claimed. */
  workerId: string
  /**
   * Best-effort live-progress heartbeat for long jobs. The handler calls this
   * as it works; the value lands on `jobs.progress` for a status poller to
   * read. It NEVER throws — a progress-write failure is swallowed so it can
   * never fail the job (see createProgressReporter). Handlers that don't
   * report progress simply never call it. The shape is generic
   * (`Record<string, unknown>`); Studio transcription writes
   * `{ stage, currentChunk, totalChunks, fraction, etaSeconds }`.
   */
  reportProgress: (progress: Record<string, unknown>) => Promise<void>
}

export interface EnqueueOptions {
  /** Higher numbers run first. Default 0. */
  priority?: number
  /** Delay execution until this timestamp. */
  runAfter?: Date
  /** Default 3. */
  maxAttempts?: number
}

export interface JobRow {
  id: string
  type: string
  status: JobStatus
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  /** Live-progress heartbeat written by the running handler; null until reported. */
  progress: Record<string, unknown> | null
  error_message: string | null
  priority: number
  attempts: number
  max_attempts: number
  run_after: string
  locked_by: string | null
  locked_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}
