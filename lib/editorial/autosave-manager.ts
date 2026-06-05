/**
 * UX-7 Phase D + UX-7.5 Phase B — Autosave manager.
 *
 * Hardened beyond the original UX-7 implementation. Key invariants:
 *
 *   1. **At most one in-flight save.** Concurrent `request()` /
 *      `flush()` calls coalesce; the run-loop schedules a follow-up
 *      cycle if new edits arrived during the trip.
 *
 *   2. **Last-write-wins.** Inside a debounce window, only the latest
 *      payload is sent. A failed-but-retrying save reads the latest
 *      `pendingPayload` at retry time, so an operator who keeps typing
 *      during a network hiccup never has stale data committed.
 *
 *   3. **Stale-save rejection via txn IDs.** Every save attempt is
 *      assigned a monotonic transaction id. If `dispose()` or `cancel()`
 *      runs while a save is in flight, the result is dropped — no
 *      setState into a torn-down editor, no count corruption.
 *
 *   4. **Abortable backoff.** Retry sleeps respond to `dispose()` so
 *      tab close / unmount don't keep timers (and therefore Promises)
 *      alive. No memory leaks on session end.
 *
 *   5. **Telemetry counters.** Snapshot exposes save count, retry
 *      count, error count, conflict count, last save duration. The
 *      editor's `window.KHAT_EDITOR_DEBUG` (Phase F) reads these.
 *
 *   6. **Idempotent dispose.** Safe to call multiple times. After
 *      dispose, `request` / `flush` are no-ops.
 *
 * The manager is pure — no React, no DOM, no I/O outside `saver`.
 * The React adapter is in `components/editorial/use-autosave.ts`.
 */

export type AutosaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error"
  | "offline"

export interface AutosaveTelemetry {
  /** Total successful saves since manager creation. */
  saveCount: number
  /** Total failed save attempts (across retries). */
  errorCount: number
  /** Total retries (excludes the initial attempt). */
  retryCount: number
  /** Times the saver returned a "conflict" — caller's `onConflict`
   *  hook (if any) interprets this. The manager itself doesn't know
   *  about conflicts; it counts errors. */
  conflictCount: number
  /** Saves discarded because dispose() / cancel() ran during the trip. */
  discardedCount: number
  /** Duration of the most recent successful save round-trip, in ms. */
  lastSaveDurationMs: number | null
  /** Average save duration over the last 20 saves, in ms. */
  rollingAvgDurationMs: number | null
}

export interface AutosaveSnapshot {
  status: AutosaveStatus
  /** Last successful save timestamp (ms epoch). Null if never saved. */
  savedAt: number | null
  /** Last error message. Null if no error. */
  error: string | null
  /** Pending save count — useful for `pending changes (N)` UI. */
  pendingChanges: number
  /** Monotonic revision; bumps on every transition. */
  revision: number
  /** Most recent transaction id. */
  txnId: number
  /** Telemetry counters. */
  telemetry: AutosaveTelemetry
}

export interface AutosaveOptions<T> {
  /** Async function that performs the actual save. */
  saver: (payload: T, ctx: SaveContext) => Promise<void>
  /** Debounce window in ms. Default 1500. */
  debounceMs?: number
  /** Max retry attempts on save failure. Default 3 (initial + 2). */
  maxAttempts?: number
  /** Optional hook called when status transitions. */
  onChange?: (s: AutosaveSnapshot) => void
  /** Stable identifier for this editor surface (e.g. "transcript:eir-id").
   *  Used for `window.KHAT_EDITOR_DEBUG` registry and telemetry. */
  surfaceId?: string
}

/**
 * Context passed to the saver. The saver can use `txnId` to log /
 * trace, and `signal` to abort long-running fetches when the manager
 * is disposed. The contract: if the AbortSignal fires, the saver
 * should reject with an AbortError; the manager will treat that as a
 * "discarded" save (no error count bump).
 */
export interface SaveContext {
  txnId: number
  signal: AbortSignal
}

export interface AutosaveManager<T> {
  request(payload: T): void
  flush(): Promise<void>
  cancel(): void
  snapshot(): AutosaveSnapshot
  subscribe(listener: (s: AutosaveSnapshot) => void): () => void
  dispose(): void
  /** True if dispose() has been called. After disposal, all writes are no-ops. */
  isDisposed(): boolean
}

const ROLLING_WINDOW = 20

export function createAutosaveManager<T>(
  options: AutosaveOptions<T>,
): AutosaveManager<T> {
  const debounceMs = options.debounceMs ?? 1500
  const maxAttempts = options.maxAttempts ?? 3

  let status: AutosaveStatus = "idle"
  let savedAt: number | null = null
  let error: string | null = null
  let pendingChanges = 0
  let revision = 0
  let txnId = 0
  let pendingPayload: T | undefined
  let inflightTxnId: number | null = null
  let inflightAbort: AbortController | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let savedClearTimer: ReturnType<typeof setTimeout> | null = null
  let backoffTimer: ReturnType<typeof setTimeout> | null = null
  let backoffResolve: (() => void) | null = null
  const listeners = new Set<(s: AutosaveSnapshot) => void>()
  let disposed = false

  const tel: AutosaveTelemetry = {
    saveCount: 0,
    errorCount: 0,
    retryCount: 0,
    conflictCount: 0,
    discardedCount: 0,
    lastSaveDurationMs: null,
    rollingAvgDurationMs: null,
  }
  const recentDurations: number[] = []

  function snapshot(): AutosaveSnapshot {
    return {
      status,
      savedAt,
      error,
      pendingChanges,
      revision,
      txnId,
      telemetry: { ...tel },
    }
  }

  function emit(): void {
    revision++
    const s = snapshot()
    options.onChange?.(s)
    for (const l of listeners) l(s)
  }

  function setStatus(next: AutosaveStatus): void {
    if (status === next) return
    status = next
    emit()
  }

  function recordDuration(ms: number): void {
    tel.lastSaveDurationMs = ms
    recentDurations.push(ms)
    if (recentDurations.length > ROLLING_WINDOW) recentDurations.shift()
    const sum = recentDurations.reduce((a, b) => a + b, 0)
    tel.rollingAvgDurationMs = recentDurations.length > 0 ? sum / recentDurations.length : null
  }

  /** Abortable sleep used between retries. Resolves early on dispose. */
  function abortableSleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (disposed) return resolve()
      backoffResolve = resolve
      backoffTimer = setTimeout(() => {
        backoffTimer = null
        backoffResolve = null
        resolve()
      }, ms)
    })
  }

  function clearBackoff(): void {
    if (backoffTimer) {
      clearTimeout(backoffTimer)
      backoffTimer = null
    }
    if (backoffResolve) {
      const r = backoffResolve
      backoffResolve = null
      // Resolve early so the runSave loop's `await abortableSleep()`
      // returns and the loop can observe `disposed`.
      r()
    }
  }

  async function runSave(): Promise<void> {
    if (disposed) return
    if (inflightTxnId !== null) return
    if (pendingPayload === undefined) return

    txnId++
    const myTxn = txnId
    inflightTxnId = myTxn
    inflightAbort = new AbortController()
    setStatus("saving")

    let attempt = 0
    let lastErr: unknown = null
    const startedAt = performance.now()

    while (attempt < maxAttempts) {
      // Re-check at every attempt: dispose / cancel may have wiped
      // `pendingPayload`, in which case we discard rather than save
      // possibly-stale data.
      if (disposed || pendingPayload === undefined || inflightTxnId !== myTxn) {
        // The save was superseded or torn down. Treat as discarded.
        tel.discardedCount++
        inflightTxnId = null
        inflightAbort = null
        if (!disposed) emit()
        return
      }
      const payload = pendingPayload
      const abort = inflightAbort
      if (!abort) {
        // Disposed concurrently. Discard.
        tel.discardedCount++
        inflightTxnId = null
        return
      }
      try {
        await options.saver(payload, {
          txnId: myTxn,
          signal: abort.signal,
        })

        // Late-arrival-during-save check: if a fresh edit landed
        // *between* the saver starting and resolving, the new edit's
        // payload may be different. We keep `pendingPayload` around
        // for the follow-up cycle.
        const arrivedDuring = pendingPayload !== payload

        // Stale-save rejection: if dispose() / cancel() ran while we
        // awaited, our txnId is no longer the in-flight one. Discard
        // the result silently.
        if (disposed || inflightTxnId !== myTxn) {
          tel.discardedCount++
          inflightTxnId = null
          inflightAbort = null
          if (!disposed) emit()
          return
        }

        // Success.
        if (!arrivedDuring) pendingPayload = undefined
        savedAt = Date.now()
        error = null
        if (!arrivedDuring) pendingChanges = 0
        const durationMs = performance.now() - startedAt
        recordDuration(durationMs)
        tel.saveCount++
        inflightTxnId = null
        inflightAbort = null
        setStatus("saved")
        if (savedClearTimer) clearTimeout(savedClearTimer)
        savedClearTimer = setTimeout(() => {
          savedClearTimer = null
          if (disposed) return
          if (status === "saved") {
            setStatus(pendingChanges > 0 ? "pending" : "idle")
          }
        }, 2200)
        if (arrivedDuring) {
          // Schedule the follow-up save for the late edit.
          schedule()
        }
        return
      } catch (e) {
        // Aborted by dispose? Not an error — discarded.
        if (
          (e instanceof Error && e.name === "AbortError") ||
          disposed ||
          inflightTxnId !== myTxn
        ) {
          tel.discardedCount++
          inflightTxnId = null
          inflightAbort = null
          if (!disposed) emit()
          return
        }
        attempt++
        lastErr = e
        tel.errorCount++
        if (attempt >= maxAttempts) break
        tel.retryCount++
        // 1s → 3s → 7s exponential backoff; abortable.
        const backoffMs = Math.pow(2, attempt) * 1000 - 1000
        await abortableSleep(Math.max(500, backoffMs))
        if (disposed || inflightTxnId !== myTxn) {
          tel.discardedCount++
          inflightTxnId = null
          inflightAbort = null
          return
        }
      }
    }

    // Final failure after maxAttempts.
    inflightTxnId = null
    inflightAbort = null
    error =
      lastErr instanceof Error
        ? lastErr.message
        : typeof lastErr === "string"
          ? lastErr
          : "Unknown autosave error"
    setStatus("error")
  }

  function schedule(): void {
    if (disposed) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runSave()
    }, debounceMs)
  }

  return {
    request(payload: T) {
      if (disposed) return
      pendingPayload = payload
      pendingChanges++
      if (status !== "saving") setStatus("pending")
      schedule()
    },
    async flush() {
      if (disposed) return
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      await runSave()
    },
    cancel() {
      if (disposed) return
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      pendingPayload = undefined
      pendingChanges = 0
      // Mark in-flight as superseded so its result is discarded.
      if (inflightTxnId !== null) {
        inflightAbort?.abort()
        inflightTxnId = null
        inflightAbort = null
        clearBackoff()
      }
      if (status === "pending") setStatus("idle")
    },
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (debounceTimer) clearTimeout(debounceTimer)
      if (savedClearTimer) clearTimeout(savedClearTimer)
      clearBackoff()
      // Abort any in-flight saver and wipe the pending state so a
      // late-resolving promise can't write into a torn-down editor.
      inflightAbort?.abort()
      inflightAbort = null
      inflightTxnId = null
      pendingPayload = undefined
      listeners.clear()
    },
    isDisposed() {
      return disposed
    },
  }
}

