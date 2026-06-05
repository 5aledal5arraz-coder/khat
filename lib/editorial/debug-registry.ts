/**
 * UX-7.5 Phase F — Editor debug registry.
 *
 * Lightweight observability layer for editor surfaces. In development
 * mode (NODE_ENV !== 'production'), the registry attaches itself to
 * `window.KHAT_EDITOR_DEBUG` so operators / engineers can introspect
 * autosave state, telemetry counters, undo depth, and editor health
 * straight from the DevTools console:
 *
 *   > window.KHAT_EDITOR_DEBUG.list()
 *   ["transcript:eir-abc", "prep-inputs:eir-abc"]
 *
 *   > window.KHAT_EDITOR_DEBUG.snapshot("transcript:eir-abc")
 *   { status: "saved", savedAt: ..., telemetry: { ... } }
 *
 *   > window.KHAT_EDITOR_DEBUG.flush("transcript:eir-abc")
 *   // forces a save right now
 *
 * In production the registry no-ops (zero runtime cost).
 *
 * The registry is process-singleton; every editor surface registers
 * its manager on mount and unregisters on unmount. Surfaces are keyed
 * by a stable id like `transcript:<eir-id>`.
 */

const IS_DEV =
  typeof process !== "undefined" &&
  process.env.NODE_ENV !== "production"

export interface AutosaveDebugEntry {
  kind: "autosave"
  getSnapshot: () => unknown
  // The full manager so the console can call request/flush/cancel.
  // Typed as `unknown` to avoid a circular import — callers know.
  manager: unknown
}

export interface DirtyStateDebugEntry {
  kind: "dirty-state"
  getSnapshot: () => unknown
}

export interface UndoHistoryDebugEntry {
  kind: "undo-history"
  getSnapshot: () => unknown
}

export type DebugEntry =
  | AutosaveDebugEntry
  | DirtyStateDebugEntry
  | UndoHistoryDebugEntry

const registry = new Map<string, DebugEntry>()

export function registerEditorDebug(id: string, entry: DebugEntry): void {
  if (!IS_DEV) return
  registry.set(id, entry)
  ensureWindowGlobal()
}

export function unregisterEditorDebug(id: string): void {
  if (!IS_DEV) return
  registry.delete(id)
}

interface WindowDebugApi {
  list: () => string[]
  snapshot: (id: string) => unknown
  snapshotAll: () => Record<string, unknown>
  flush: (id: string) => void | Promise<void>
  cancel: (id: string) => void
  /** Pretty-print a one-line summary across all surfaces. */
  summary: () => string
}

function ensureWindowGlobal(): void {
  if (!IS_DEV) return
  if (typeof window === "undefined") return
  const w = window as unknown as { KHAT_EDITOR_DEBUG?: WindowDebugApi }
  if (w.KHAT_EDITOR_DEBUG) return
  w.KHAT_EDITOR_DEBUG = {
    list() {
      return [...registry.keys()]
    },
    snapshot(id: string) {
      return registry.get(id)?.getSnapshot()
    },
    snapshotAll() {
      const out: Record<string, unknown> = {}
      for (const [k, v] of registry) out[k] = v.getSnapshot()
      return out
    },
    flush(id: string) {
      const e = registry.get(id)
      if (!e || e.kind !== "autosave") return
      const m = e.manager as { flush?: () => Promise<void> }
      return m.flush?.()
    },
    cancel(id: string) {
      const e = registry.get(id)
      if (!e || e.kind !== "autosave") return
      const m = e.manager as { cancel?: () => void }
      m.cancel?.()
    },
    summary() {
      const lines: string[] = []
      for (const [id, entry] of registry) {
        const s = entry.getSnapshot()
        if (entry.kind === "autosave") {
          const snap = s as {
            status: string
            pendingChanges: number
            telemetry?: { saveCount: number; errorCount: number; retryCount: number; lastSaveDurationMs: number | null }
          }
          lines.push(
            `${id}  ${snap.status}  pending=${snap.pendingChanges}  saves=${snap.telemetry?.saveCount ?? 0}  errors=${snap.telemetry?.errorCount ?? 0}  retries=${snap.telemetry?.retryCount ?? 0}  last=${snap.telemetry?.lastSaveDurationMs?.toFixed(0) ?? "?"}ms`,
          )
        } else {
          lines.push(`${id}  (${entry.kind})  ${JSON.stringify(s)}`)
        }
      }
      return lines.join("\n")
    },
  }
}

/** Test/utility: clear the registry (used by smokes). No-op in prod. */
export function _resetEditorDebugRegistry(): void {
  registry.clear()
}
