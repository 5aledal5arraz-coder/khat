"use client"

import type { ReactNode } from "react"

export interface EditorToolbarAction {
  id: string
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: "default" | "primary" | "danger"
  /** Show an Arabic shortcut hint, e.g. "Ctrl+Z". */
  shortcut?: string
  /** When true, render before the divider. Used to group save/undo
   *  primary actions to the start of the bar. */
  primary?: boolean
}

export interface EditorToolbarProps {
  /** Actions in render order (start-to-end). Marked `primary` actions
   *  are visually emphasised. */
  actions: EditorToolbarAction[]
  /** Right-aligned content (status badge, search box, etc.). */
  trailing?: ReactNode
  /** Sticky to top of scroll container. Default true. */
  sticky?: boolean
}

/**
 * Generic editor toolbar. The transcript / prep / chapters editors all
 * compose this. RTL-safe; primary actions to the right (start) per
 * Arabic convention.
 */
export function EditorToolbar({
  actions,
  trailing,
  sticky = true,
}: EditorToolbarProps) {
  return (
    <div
      className={
        "flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/40 bg-card/50 px-2.5 py-1.5 backdrop-blur-sm " +
        (sticky ? "sticky top-2 z-10" : "")
      }
    >
      {actions.map((a, i) => (
        <ToolbarButton key={a.id} action={a} divider={a.primary && actions[i + 1] && !actions[i + 1].primary} />
      ))}
      {trailing && (
        <div className="ms-auto flex items-center gap-1.5">{trailing}</div>
      )}
    </div>
  )
}

function ToolbarButton({
  action,
  divider,
}: {
  action: EditorToolbarAction
  divider?: boolean
}) {
  const variant = action.variant ?? "default"
  const cls =
    variant === "primary"
      ? "border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
      : variant === "danger"
        ? "border-rose-500/30 bg-rose-500/5 text-rose-200 hover:bg-rose-500/15"
        : "border-border/50 bg-background/40 text-foreground/85 hover:bg-background/60"
  return (
    <>
      <button
        type="button"
        onClick={action.onClick}
        disabled={action.disabled}
        title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
        className={
          "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
          cls
        }
      >
        {action.icon}
        <span>{action.label}</span>
        {action.shortcut && (
          <kbd className="rounded bg-background/70 px-1 text-[9.5px] text-muted-foreground" dir="ltr">
            {action.shortcut}
          </kbd>
        )}
      </button>
      {divider && (
        <span className="mx-0.5 h-4 w-px bg-border/50" aria-hidden />
      )}
    </>
  )
}
