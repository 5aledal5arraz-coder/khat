"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createAutosaveManager,
  type AutosaveManager,
  type AutosaveSnapshot,
  type AutosaveTelemetry,
  type SaveContext,
} from "@/lib/editorial/autosave-manager"
import { registerEditorDebug, unregisterEditorDebug } from "@/lib/editorial/debug-registry"

export interface UseAutosaveOptions<T> {
  /** Async save function. Receives the latest payload + a save
   *  context exposing `txnId` (for tracing) and `signal` (for fetch
   *  abort on dispose). Throws on error. */
  saver: (payload: T, ctx?: SaveContext) => Promise<void>
  debounceMs?: number
  maxAttempts?: number
  /** UX-7.5 Phase F — surface id for the editor debug registry,
   *  e.g. "transcript:eir-abc". Defaults to a random surface id. */
  surfaceId?: string
}

export interface UseAutosave<T> {
  status: AutosaveSnapshot["status"]
  savedAt: number | null
  error: string | null
  pendingChanges: number
  /** UX-7.5 — telemetry counters for observability. */
  telemetry: AutosaveTelemetry
  /** UX-7.5 — most-recent transaction id. */
  txnId: number
  request: (payload: T) => void
  flush: () => Promise<void>
  cancel: () => void
  manager: AutosaveManager<T>
}

/**
 * React adapter for `createAutosaveManager`. Pass a stable saver
 * via useCallback for best behavior — the hook captures the saver
 * once at mount.
 *
 * Browser-tab-close safety: subscribes to `beforeunload` while there
 * are pending changes and prompts the operator with a leave warning.
 */
export function useAutosave<T>(
  options: UseAutosaveOptions<T>,
): UseAutosave<T> {
  // Capture options in a ref so re-renders don't recreate the manager.
  const optsRef = useRef(options)
  optsRef.current = options
  const surfaceIdRef = useRef<string>(
    options.surfaceId ??
      `editor-${Math.random().toString(36).slice(2, 10)}`,
  )

  const manager = useMemo(
    () =>
      createAutosaveManager<T>({
        saver: (p, ctx) => optsRef.current.saver(p, ctx),
        debounceMs: options.debounceMs,
        maxAttempts: options.maxAttempts,
        surfaceId: surfaceIdRef.current,
      }),
    // We intentionally only construct one manager per editor mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [snap, setSnap] = useState<AutosaveSnapshot>(() => manager.snapshot())

  useEffect(() => {
    return manager.subscribe(setSnap)
  }, [manager])

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      manager.dispose()
    }
  }, [manager])

  // UX-7.5 Phase F — register with the editor debug registry while
  // mounted (dev-mode only). The registry exposes manager + snapshot
  // via `window.KHAT_EDITOR_DEBUG`.
  useEffect(() => {
    const surfaceId = surfaceIdRef.current
    registerEditorDebug(surfaceId, {
      kind: "autosave",
      getSnapshot: () => manager.snapshot(),
      manager,
    })
    return () => {
      unregisterEditorDebug(surfaceId)
    }
  }, [manager])

  // Browser close-tab guard while dirty.
  useEffect(() => {
    if (snap.pendingChanges === 0 && snap.status !== "saving") return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Modern browsers ignore custom messages but still show the dialog.
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [snap.pendingChanges, snap.status])

  const request = useCallback(
    (payload: T) => manager.request(payload),
    [manager],
  )
  const flush = useCallback(() => manager.flush(), [manager])
  const cancel = useCallback(() => manager.cancel(), [manager])

  return {
    status: snap.status,
    savedAt: snap.savedAt,
    error: snap.error,
    pendingChanges: snap.pendingChanges,
    telemetry: snap.telemetry,
    txnId: snap.txnId,
    request,
    flush,
    cancel,
    manager,
  }
}
