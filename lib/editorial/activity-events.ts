/**
 * UX-7 Phase D — Editorial activity events.
 *
 * A typed event bus for editor activity. The transcript / prep /
 * chapter editors emit events, and downstream listeners (status bar,
 * activity log card, telemetry) consume them. Pure logic.
 *
 * Why not just pass props: editor activity needs to flow up to the
 * workspace shell and across to the activity-log surface. A typed
 * event bus prevents prop-drilling and keeps the activity shape
 * uniform across every editor we'll ever build.
 */

export type EditorEventKind =
  | "edit"
  | "save_started"
  | "save_succeeded"
  | "save_failed"
  | "undo"
  | "redo"
  | "regenerate_requested"
  | "conflict_detected"
  | "field_focused"
  | "field_blurred"

export interface EditorEvent {
  kind: EditorEventKind
  /** Editor surface id, e.g. "transcript", "prep_inputs", "chapters". */
  surface: string
  /** Optional field id within the surface (e.g. "segment-12.text"). */
  fieldId?: string
  /** Free-form payload — kept narrow per kind by convention. */
  payload?: Record<string, unknown>
  /** Operator id (admin user) if known. Filled by the React wrapper. */
  actorId?: string | null
  timestamp: number // ms epoch
}

export interface EditorEventBus {
  emit(event: Omit<EditorEvent, "timestamp"> & { timestamp?: number }): void
  subscribe(listener: (e: EditorEvent) => void): () => void
  /** Subscribe to a single event kind. */
  on(kind: EditorEventKind, listener: (e: EditorEvent) => void): () => void
  /** Most recent N events for a surface (in-memory, lossy). */
  recent(surface?: string, limit?: number): EditorEvent[]
}

const RECENT_CAPACITY = 200

export function createEditorEventBus(): EditorEventBus {
  const listeners = new Set<(e: EditorEvent) => void>()
  const recent: EditorEvent[] = []
  return {
    emit(event) {
      const e: EditorEvent = {
        ...event,
        timestamp: event.timestamp ?? Date.now(),
      }
      recent.push(e)
      if (recent.length > RECENT_CAPACITY) recent.shift()
      for (const l of listeners) l(e)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    on(kind, listener) {
      const wrapped = (e: EditorEvent) => {
        if (e.kind === kind) listener(e)
      }
      listeners.add(wrapped)
      return () => {
        listeners.delete(wrapped)
      }
    },
    recent(surface, limit = 50) {
      const filtered = surface
        ? recent.filter((e) => e.surface === surface)
        : recent.slice()
      return filtered.slice(-limit)
    },
  }
}

/**
 * Singleton bus shared across editor surfaces in the same React tree.
 * Tests can call `resetEditorEventBus()` to wipe state between cases.
 */
let _bus: EditorEventBus | null = null
export function getEditorEventBus(): EditorEventBus {
  if (!_bus) _bus = createEditorEventBus()
  return _bus
}
export function resetEditorEventBus(): void {
  _bus = null
}
