/**
 * UX-7 Phase D — Bounded undo/redo history.
 *
 * Generic over a snapshot type T. Stores up to `capacity` past states.
 * Push semantics: a new state replaces the redo stack. Coalesces
 * rapid pushes within `coalesceMs` (default 350ms) so a fast typer
 * doesn't blow out the buffer.
 *
 * The engine is pure — call sites push state snapshots when meaningful
 * editorial events happen (edit a segment, delete a paragraph, etc.).
 * The transcript editor scopes one history per session.
 *
 * Capacity defaults to 100; calibrated for an editing session with
 * frequent micro-edits without runaway memory. Each snapshot in
 * production is the FULL transcript array (~1-3MB for very long
 * episodes), so 100 caps memory at roughly 300MB worst-case — still
 * comfortably within tab memory.
 */

export interface UndoHistoryOptions {
  capacity?: number
  coalesceMs?: number
}

export interface UndoHistorySnapshot {
  canUndo: boolean
  canRedo: boolean
  pastCount: number
  futureCount: number
  /** Monotonic counter for React useEffect deps. */
  revision: number
}

export interface UndoHistory<T> {
  /** Push a snapshot of the current state. Coalesces with the previous
   *  push if it arrived within `coalesceMs`. */
  push(state: T): void
  /** Undo: returns the previous state, or null if no past. The current
   *  state must be passed in so we can move it to the redo stack. */
  undo(current: T): T | null
  /** Redo: returns the next state, or null if no future. The current
   *  state must be passed in so we can move it to the past stack. */
  redo(current: T): T | null
  /** Wipe history without changing the current document. */
  clear(): void
  snapshot(): UndoHistorySnapshot
  subscribe(listener: (s: UndoHistorySnapshot) => void): () => void
}

export function createUndoHistory<T>(
  options: UndoHistoryOptions = {},
): UndoHistory<T> {
  const capacity = options.capacity ?? 100
  const coalesceMs = options.coalesceMs ?? 350
  const past: T[] = []
  const future: T[] = []
  let lastPushAt = 0
  let revision = 0
  const listeners = new Set<(s: UndoHistorySnapshot) => void>()

  function snapshot(): UndoHistorySnapshot {
    return {
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      pastCount: past.length,
      futureCount: future.length,
      revision,
    }
  }

  function notify() {
    revision++
    const s = snapshot()
    for (const l of listeners) l(s)
  }

  return {
    push(state: T) {
      const now = Date.now()
      // Coalesce: if the last push was very recent, replace the most
      // recent past snapshot instead of stacking another one. The
      // editor's debounced typing burst becomes a single undo step.
      if (past.length > 0 && now - lastPushAt < coalesceMs) {
        past[past.length - 1] = state
        lastPushAt = now
        // No notify — observable shape didn't change.
        return
      }
      past.push(state)
      if (past.length > capacity) past.shift()
      // Pushing kills the redo stack — classic editor undo semantics.
      if (future.length > 0) future.length = 0
      lastPushAt = now
      notify()
    },
    undo(current: T) {
      const prev = past.pop()
      if (prev === undefined) return null
      future.push(current)
      if (future.length > capacity) future.shift()
      notify()
      return prev
    },
    redo(current: T) {
      const next = future.pop()
      if (next === undefined) return null
      past.push(current)
      if (past.length > capacity) past.shift()
      notify()
      return next
    },
    clear() {
      if (past.length === 0 && future.length === 0) return
      past.length = 0
      future.length = 0
      lastPushAt = 0
      notify()
    },
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
