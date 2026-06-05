/**
 * UX-7 Phase D — Editorial dirty-state engine.
 *
 * A small, framework-agnostic state machine that tracks whether an
 * editor has unsaved changes, and at what granularity. Two scopes:
 *
 *   • document-level: any field is dirty → the document is dirty.
 *   • field-level:    individual fields keyed by string id.
 *
 * The engine is pure (no React, no DOM, no I/O). The React hook
 * (`useDirtyState`) wraps it for component use.
 *
 * Why field-level matters: an autosave manager can save just the dirty
 * fields, and the UI can put a small dot next to the inputs that
 * haven't been persisted yet — both essential for operator confidence.
 */

export interface DirtyStateSnapshot {
  /** Field ids that have unsaved changes. Stable, sorted ascending. */
  dirtyFields: string[]
  /** True iff any field is dirty. */
  isDirty: boolean
  /** Monotonic counter — bumps every time the dirty set changes. Useful
   *  as a useEffect dep without leaking the Set. */
  revision: number
  /** Last time `markDirty` was called for any field, in ms epoch. Null
   *  if no field has ever been marked dirty. */
  lastDirtyAt: number | null
  /** Last time the dirty set was fully cleared (markClean()). */
  lastCleanAt: number | null
}

export interface DirtyStateEngine {
  snapshot(): DirtyStateSnapshot
  /** Mark a single field as dirty. Idempotent. */
  markDirty(fieldId: string): void
  /** Clear a single field's dirty flag. */
  markFieldClean(fieldId: string): void
  /** Clear ALL dirty flags. Used after a successful save. */
  markClean(): void
  /** Subscribe to changes. Returns an unsubscribe fn. */
  subscribe(listener: (s: DirtyStateSnapshot) => void): () => void
  /** Cheaply check a single field. */
  isFieldDirty(fieldId: string): boolean
}

export function createDirtyStateEngine(): DirtyStateEngine {
  const dirty = new Set<string>()
  const listeners = new Set<(s: DirtyStateSnapshot) => void>()
  let revision = 0
  let lastDirtyAt: number | null = null
  let lastCleanAt: number | null = null

  function snapshot(): DirtyStateSnapshot {
    return {
      dirtyFields: [...dirty].sort(),
      isDirty: dirty.size > 0,
      revision,
      lastDirtyAt,
      lastCleanAt,
    }
  }

  function notify(): void {
    const s = snapshot()
    for (const l of listeners) l(s)
  }

  return {
    snapshot,
    markDirty(fieldId) {
      if (dirty.has(fieldId)) return
      dirty.add(fieldId)
      revision++
      lastDirtyAt = Date.now()
      notify()
    },
    markFieldClean(fieldId) {
      if (!dirty.has(fieldId)) return
      dirty.delete(fieldId)
      revision++
      if (dirty.size === 0) lastCleanAt = Date.now()
      notify()
    },
    markClean() {
      if (dirty.size === 0) return
      dirty.clear()
      revision++
      lastCleanAt = Date.now()
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    isFieldDirty(fieldId) {
      return dirty.has(fieldId)
    },
  }
}
