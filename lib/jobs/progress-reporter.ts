/**
 * Khat Brain — resilient job-progress reporter.
 *
 * The worker hands each handler a `ctx.reportProgress` bound to its job id. That
 * function MUST never throw: a progress heartbeat is a soft, best-effort signal,
 * and a transient DB blip while writing it must never take down an expensive job
 * (a 50-minute transcription failing because a status write hiccuped would be
 * absurd). So the actual DB write (`reportJobProgress`, which does throw) is
 * wrapped here and every failure is swallowed + logged, not propagated.
 *
 * Kept in its own side-effect-free module (NOT inline in worker.ts, whose import
 * boots the worker loop) so the swallow behaviour is unit-testable in isolation.
 */

import { reportJobProgress } from "./queue"

export type ProgressReporter = (progress: Record<string, unknown>) => Promise<void>

/**
 * Build the `ctx.reportProgress` for one job. The returned fn resolves whether
 * or not the underlying write succeeds; on failure it calls `onError` (if given)
 * and resolves anyway — it never rejects.
 */
export function createProgressReporter(
  jobId: string,
  onError?: (err: unknown) => void,
): ProgressReporter {
  return async (progress: Record<string, unknown>): Promise<void> => {
    try {
      await reportJobProgress(jobId, progress)
    } catch (err) {
      onError?.(err)
    }
  }
}
