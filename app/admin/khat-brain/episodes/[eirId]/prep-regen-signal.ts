"use client"

/**
 * «إعادة توليد الإعداد» is running — a tab-local signal.
 *
 * The regenerate button and the question editor are siblings under a server
 * component, so they share no React state. Regeneration writes a whole new
 * prep; an edit to a GENERATED question made while it runs is overwritten by
 * that write (authored questions are carried over under the row lock, see
 * pipeline.ts). The editor locks itself while this says so, instead of
 * accepting work it is about to lose.
 */

import { useSyncExternalStore } from "react"

const running = new Set<string>()
const listeners = new Set<() => void>()

export function setPrepRegenerating(eirId: string, on: boolean): void {
  const had = running.has(eirId)
  if (on === had) return
  if (on) running.add(eirId)
  else running.delete(eirId)
  for (const l of listeners) l()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function usePrepRegenerating(eirId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => running.has(eirId),
    () => false,
  )
}
