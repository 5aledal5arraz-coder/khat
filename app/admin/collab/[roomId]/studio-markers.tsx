"use client"

/**
 * StudioMarkers — session markers panel (timestamped event log).
 *
 * Preset quick-add buttons + custom marker input.
 * Director+ can add/delete markers. Others see read-only list.
 */

import { useState, useCallback } from "react"
import { useRoomMarkers, useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import type { SessionMarkerType, RoomSessionMarker } from "@/types/collaboration"
import { cn } from "@/lib/utils"
import {
  Flag,
  Coffee,
  RotateCcw,
  Star,
  AlertTriangle,
  MessageSquare,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

// ─── Marker type config ──────────────────────────────────────────────

const MARKER_CONFIG: Record<SessionMarkerType, { label: string; icon: typeof Flag; color: string }> = {
  episode_started: { label: "بداية", icon: Flag, color: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20" },
  break: { label: "استراحة", icon: Coffee, color: "text-sky-700 bg-sky-500/10 border-sky-500/20" },
  retake: { label: "إعادة", icon: RotateCcw, color: "text-orange-700 bg-orange-500/10 border-orange-500/20" },
  important: { label: "مهم", icon: Star, color: "text-amber-700 bg-amber-500/10 border-amber-500/20" },
  technical_issue: { label: "مشكلة تقنية", icon: AlertTriangle, color: "text-red-700 bg-red-500/10 border-red-500/20" },
  custom: { label: "ملاحظة", icon: MessageSquare, color: "text-muted-foreground bg-muted/20 border-border/30" },
}

const QUICK_MARKERS: SessionMarkerType[] = ["break", "retake", "important", "technical_issue"]

function formatRecordingMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`
}

// ─── Component ───────────────────────────────────────────────────────

export function StudioMarkers({ defaultExpanded }: { defaultExpanded?: boolean }) {
  const { markers, addMarker, deleteMarker } = useRoomMarkers()
  const { isDirectorOrAbove } = useRoomState()

  const [expanded, setExpanded] = useState(defaultExpanded ?? false)
  const [customNote, setCustomNote] = useState("")
  const [sending, setSending] = useState(false)

  const handleQuickMarker = useCallback(
    async (type: SessionMarkerType) => {
      setSending(true)
      await addMarker(type, MARKER_CONFIG[type].label)
      setSending(false)
    },
    [addMarker],
  )

  const handleCustomMarker = useCallback(async () => {
    if (!customNote.trim()) return
    setSending(true)
    await addMarker("custom", customNote.trim())
    setCustomNote("")
    setSending(false)
  }, [customNote, addMarker])

  return (
    <div className="rounded-xl border border-border/30 bg-card/30">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5"
      >
        <div className="flex items-center gap-2">
          <Flag className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">
            علامات الجلسة
          </span>
          {markers.length > 0 && (
            <span className="rounded-full bg-muted/50 px-1.5 text-[10px] text-muted-foreground">
              {markers.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/20 px-4 py-3 space-y-3">
          {/* Quick-add buttons (director+) */}
          {isDirectorOrAbove && (
            <div className="flex flex-wrap gap-1.5">
              {QUICK_MARKERS.map((type) => {
                const cfg = MARKER_CONFIG[type]
                const Icon = cfg.icon
                return (
                  <button
                    key={type}
                    onClick={() => handleQuickMarker(type)}
                    disabled={sending}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-opacity",
                      cfg.color,
                      sending && "opacity-50",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Custom marker input (director+) */}
          {isDirectorOrAbove && (
            <div className="flex items-center gap-2">
              <input
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleCustomMarker()
                  }
                }}
                placeholder="علامة مخصصة..."
                className="min-w-0 flex-1 rounded-lg border border-border/30 bg-muted/10 px-3 py-1.5 text-xs placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none"
                disabled={sending}
              />
              <button
                onClick={handleCustomMarker}
                disabled={!customNote.trim() || sending}
                className="rounded-lg bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 disabled:opacity-30"
              >
                إضافة
              </button>
            </div>
          )}

          {/* Markers list */}
          {markers.length > 0 ? (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {markers.map((marker) => (
                <MarkerRow
                  key={marker.id}
                  marker={marker}
                  canDelete={isDirectorOrAbove}
                  onDelete={() => deleteMarker(marker.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-[11px] text-muted-foreground py-2">
              لا توجد علامات بعد
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function MarkerRow({
  marker,
  canDelete,
  onDelete,
}: {
  marker: RoomSessionMarker
  canDelete: boolean
  onDelete: () => void
}) {
  const cfg = MARKER_CONFIG[marker.marker_type] ?? MARKER_CONFIG.custom
  const Icon = cfg.icon

  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/10">
      {/* Time offset */}
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatRecordingMs(marker.recording_ms)}
      </span>

      {/* Type icon */}
      <Icon className={cn("h-3 w-3 shrink-0", cfg.color.split(" ")[0])} />

      {/* Label */}
      <span className="min-w-0 flex-1 truncate text-xs">
        {marker.label}
        {marker.note && marker.marker_type !== "custom" && (
          <span className="mr-1 text-muted-foreground"> — {marker.note}</span>
        )}
      </span>

      {/* Delete */}
      {canDelete && (
        <button
          onClick={onDelete}
          className="shrink-0 rounded p-0.5 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-700"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
