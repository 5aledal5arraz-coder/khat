"use client"

import { useEffect, useMemo, useState } from "react"
import {
  createUndoHistory,
  type UndoHistory,
  type UndoHistoryOptions,
  type UndoHistorySnapshot,
} from "@/lib/editorial/undo-history"

export interface UseUndoHistory<T> {
  push: (state: T) => void
  undo: (current: T) => T | null
  redo: (current: T) => T | null
  clear: () => void
  canUndo: boolean
  canRedo: boolean
  history: UndoHistory<T>
}

export function useUndoHistory<T>(
  options: UndoHistoryOptions = {},
): UseUndoHistory<T> {
  const history = useMemo(
    () => createUndoHistory<T>(options),
    // Construct once; options changes don't recreate (tune in tests).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [snap, setSnap] = useState<UndoHistorySnapshot>(() => history.snapshot())

  useEffect(() => {
    return history.subscribe(setSnap)
  }, [history])

  return {
    push: (s: T) => history.push(s),
    undo: (s: T) => history.undo(s),
    redo: (s: T) => history.redo(s),
    clear: () => history.clear(),
    canUndo: snap.canUndo,
    canRedo: snap.canRedo,
    history,
  }
}
