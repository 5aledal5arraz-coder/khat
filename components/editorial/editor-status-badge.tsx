"use client"

import { Cloud, CloudOff, Loader2, AlertTriangle, Check } from "lucide-react"
import type { AutosaveStatus } from "@/lib/editorial/autosave-manager"

export interface EditorStatusBadgeProps {
  status: AutosaveStatus
  savedAt: number | null
  error?: string | null
  pendingChanges?: number
  /** Compact: icon + 1-2 words. Default: full label. */
  compact?: boolean
}

function formatRelative(ts: number): string {
  const delta = Math.max(0, Date.now() - ts)
  if (delta < 5_000) return "الآن"
  if (delta < 60_000) return `قبل ${Math.floor(delta / 1000)} ث`
  if (delta < 3_600_000) return `قبل ${Math.floor(delta / 60_000)} د`
  return new Date(ts).toLocaleTimeString("ar")
}

/**
 * Reusable status badge for any autosave-driven editor. Matches
 * existing workspace tone (rose-on-error / amber-on-pending / emerald-
 * on-saved). RTL-safe.
 *
 * Colour weights are `-700`, never `-200`: admin is a single forced LIGHT
 * surface, where `-200` text measured 1.02–1.15:1 against the background —
 * i.e. invisible, against a 4.5 requirement. The `error` state was in that
 * set, so a failed save had no visible signal at all. This is the rule in
 * `admin-light-contrast`; the badge is used by 5 editors, so a regression
 * here is a regression everywhere.
 */
export function EditorStatusBadge({
  status,
  savedAt,
  error,
  pendingChanges = 0,
  compact = false,
}: EditorStatusBadgeProps) {
  const variant = (() => {
    switch (status) {
      case "saving":
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          cls: "border-violet-500/30 bg-violet-500/10 text-violet-700",
          label: compact ? "جارٍ الحفظ" : "جارٍ الحفظ…",
        }
      case "saved":
        return {
          icon: <Check className="h-3 w-3" />,
          cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
          label: compact
            ? "محفوظ"
            : savedAt
              ? `محفوظ ${formatRelative(savedAt)}`
              : "محفوظ",
        }
      case "pending":
        return {
          icon: <Cloud className="h-3 w-3" />,
          cls: "border-amber-500/30 bg-amber-500/10 text-amber-800",
          label: compact
            ? `${pendingChanges} غير محفوظ`
            : `تغييرات قيد الحفظ${pendingChanges > 0 ? ` (${pendingChanges})` : ""}`,
        }
      case "error":
        return {
          icon: <AlertTriangle className="h-3 w-3" />,
          cls: "border-rose-500/30 bg-rose-500/10 text-rose-700",
          label: compact ? "خطأ" : error ? `خطأ: ${error}` : "خطأ في الحفظ",
        }
      case "offline":
        return {
          icon: <CloudOff className="h-3 w-3" />,
          cls: "border-slate-500/30 bg-slate-500/10 text-slate-700",
          label: compact ? "غير متصل" : "غير متصل — سيُحفظ لاحقاً",
        }
      default:
        return {
          icon: <Cloud className="h-3 w-3" />,
          cls: "border-border/40 bg-card/30 text-muted-foreground",
          label: savedAt
            ? compact
              ? "محفوظ"
              : `آخر حفظ ${formatRelative(savedAt)}`
            : "جاهز",
        }
    }
  })()

  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] " +
        variant.cls
      }
      role="status"
      aria-live="polite"
    >
      {variant.icon}
      <span>{variant.label}</span>
    </span>
  )
}
