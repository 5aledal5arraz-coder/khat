/**
 * UX-7 Phase D — Optimistic transaction helper.
 *
 * Wraps an editorial mutation: applies a local change immediately,
 * runs the server mutation, rolls back on failure. The pattern lives
 * here as a reusable primitive so transcript / chapters / clips
 * editors don't reimplement rollback logic four different ways.
 *
 * Contract: caller provides three pure functions:
 *   • applyLocally(state) → state'   (synchronous local apply)
 *   • commit(state')      → Promise  (server write; throws on failure)
 *   • rollback(prev)      → state    (return the previous state)
 *
 * The helper:
 *   1. Snapshots prev state.
 *   2. Calls applyLocally to compute state'.
 *   3. Calls commit().
 *   4. On failure: returns rollback(prev) and bubbles the error.
 *
 * The optimistic transaction is intentionally tiny — the caller owns
 * state management. We only standardise the snapshot+rollback shape
 * so we get consistent error reporting (and consistent toast copy).
 */

export interface OptimisticTxnArgs<S> {
  /** Current state before the change. */
  current: S
  /** Apply the change locally. Must be PURE — no I/O. */
  apply: (state: S) => S
  /** Persist the local change to the server. Throws on failure. */
  commit: (next: S) => Promise<void>
}

export interface OptimisticTxnResult<S> {
  /** Final state to commit to component state. */
  state: S
  /** Whether the server-side commit succeeded. False ⇒ state is the
   *  rolled-back original. */
  ok: boolean
  /** Server error if !ok. */
  error: Error | null
  /** True if the local apply executed (it always does, but kept for
   *  symmetry / future "skip if unchanged" optimization). */
  applied: boolean
}

/**
 * Run an optimistic transaction. The caller awaits the result and
 * uses `state` to update its component state — the helper has no
 * direct access to React.
 */
export async function runOptimisticTxn<S>(
  args: OptimisticTxnArgs<S>,
): Promise<OptimisticTxnResult<S>> {
  const prev = args.current
  let next: S
  try {
    next = args.apply(prev)
  } catch (e) {
    return {
      state: prev,
      ok: false,
      error: e instanceof Error ? e : new Error(String(e)),
      applied: false,
    }
  }
  try {
    await args.commit(next)
    return { state: next, ok: true, error: null, applied: true }
  } catch (e) {
    return {
      state: prev,
      ok: false,
      error: e instanceof Error ? e : new Error(String(e)),
      applied: true,
    }
  }
}
