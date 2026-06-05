/**
 * UX-7 Phase D — Editor conflict manager.
 *
 * Detects when a second operator (or another tab) edits the same
 * document while the current editor has unsaved changes. The strategy
 * is **optimistic with version stamps**, not full operational
 * transform — appropriate for our scale (1-3 operators per episode,
 * not Google Docs).
 *
 * Server contract:
 *   • Every save sends `expectedVersion` (the version the client read).
 *   • Server compares to current `data.version` in the row.
 *     - Match → bump version, persist, return `{ ok, version: v+1 }`.
 *     - Mismatch → return `{ ok: false, code: "version_conflict",
 *                            currentVersion, currentData }`.
 *   • Client-side conflict manager wraps that response and surfaces
 *     a "Someone else edited this. Reload? Overwrite?" prompt.
 *
 * This module is the client-side lookup state. The server-side check
 * lives in the per-editor server action (e.g. `transcript-actions.ts`).
 */

export interface ConflictState {
  /** True ⇒ the most recent save was rejected for version conflict. */
  hasConflict: boolean
  /** Version stamp the server holds. Null if we don't know yet. */
  currentVersion: number | null
  /** Snapshot of the server's current data (for "Reload to theirs" UX). */
  currentData: unknown | null
  /** Version stamp the client believes is current. */
  expectedVersion: number | null
  detectedAt: number | null
}

export interface ConflictManager {
  state(): ConflictState
  /** Initialise / reset the expected version. */
  setExpectedVersion(v: number | null): void
  /** Called when the server confirms a successful save with a new
   *  version. */
  recordSuccess(newVersion: number): void
  /** Called when the server reports a version conflict. */
  recordConflict(serverVersion: number, serverData: unknown): void
  /** Operator chose "their version wins" — clear conflict and adopt
   *  server data. */
  resolveByReload(): { adoptedVersion: number; adoptedData: unknown } | null
  /** Operator chose "mine wins" — clear conflict and keep local. The
   *  next save will use the new server version. */
  resolveByOverwrite(): { adoptedVersion: number } | null
  subscribe(listener: (s: ConflictState) => void): () => void
}

export function createConflictManager(): ConflictManager {
  let expectedVersion: number | null = null
  let conflict: {
    serverVersion: number
    serverData: unknown
    detectedAt: number
  } | null = null
  const listeners = new Set<(s: ConflictState) => void>()

  function state(): ConflictState {
    return {
      hasConflict: conflict !== null,
      currentVersion: conflict?.serverVersion ?? null,
      currentData: conflict?.serverData ?? null,
      expectedVersion,
      detectedAt: conflict?.detectedAt ?? null,
    }
  }

  function notify(): void {
    const s = state()
    for (const l of listeners) l(s)
  }

  return {
    state,
    setExpectedVersion(v) {
      expectedVersion = v
      notify()
    },
    recordSuccess(newVersion) {
      expectedVersion = newVersion
      if (conflict !== null) {
        conflict = null
      }
      notify()
    },
    recordConflict(serverVersion, serverData) {
      conflict = {
        serverVersion,
        serverData,
        detectedAt: Date.now(),
      }
      notify()
    },
    resolveByReload() {
      if (!conflict) return null
      const out = {
        adoptedVersion: conflict.serverVersion,
        adoptedData: conflict.serverData,
      }
      expectedVersion = conflict.serverVersion
      conflict = null
      notify()
      return out
    },
    resolveByOverwrite() {
      if (!conflict) return null
      const out = { adoptedVersion: conflict.serverVersion }
      expectedVersion = conflict.serverVersion
      conflict = null
      notify()
      return out
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
