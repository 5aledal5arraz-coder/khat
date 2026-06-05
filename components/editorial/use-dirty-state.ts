"use client"

import { useEffect, useMemo, useState } from "react"
import {
  createDirtyStateEngine,
  type DirtyStateEngine,
  type DirtyStateSnapshot,
} from "@/lib/editorial/dirty-state"

export interface UseDirtyState {
  isDirty: boolean
  dirtyFields: string[]
  isFieldDirty: (id: string) => boolean
  markDirty: (id: string) => void
  markFieldClean: (id: string) => void
  markClean: () => void
  /** Underlying engine (rare uses — e.g. cross-component subscription). */
  engine: DirtyStateEngine
  /** Bumps every change — useful for useEffect deps. */
  revision: number
}

/**
 * React adapter for `createDirtyStateEngine`. One engine per editor
 * surface (transcript, prep, chapters, …). The engine survives
 * re-renders via useMemo.
 */
export function useDirtyState(): UseDirtyState {
  const engine = useMemo(() => createDirtyStateEngine(), [])
  const [snap, setSnap] = useState<DirtyStateSnapshot>(() => engine.snapshot())

  useEffect(() => {
    return engine.subscribe(setSnap)
  }, [engine])

  return {
    isDirty: snap.isDirty,
    dirtyFields: snap.dirtyFields,
    revision: snap.revision,
    isFieldDirty: (id: string) => engine.isFieldDirty(id),
    markDirty: (id: string) => engine.markDirty(id),
    markFieldClean: (id: string) => engine.markFieldClean(id),
    markClean: () => engine.markClean(),
    engine,
  }
}
