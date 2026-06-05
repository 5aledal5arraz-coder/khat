/**
 * UX-7 Phase D — Editorial primitives barrel.
 *
 * Single import surface for editor authors:
 *   import {
 *     useDirtyState, useAutosave, useUndoHistory,
 *     EditorStatusBadge, EditorToolbar,
 *   } from "@/components/editorial"
 */

export { useDirtyState } from "./use-dirty-state"
export type { UseDirtyState } from "./use-dirty-state"

export { useAutosave } from "./use-autosave"
export type { UseAutosave, UseAutosaveOptions } from "./use-autosave"

export { useUndoHistory } from "./use-undo-history"
export type { UseUndoHistory } from "./use-undo-history"

export { EditorStatusBadge } from "./editor-status-badge"
export type { EditorStatusBadgeProps } from "./editor-status-badge"

export { EditorToolbar } from "./editor-toolbar"
export type { EditorToolbarProps, EditorToolbarAction } from "./editor-toolbar"
