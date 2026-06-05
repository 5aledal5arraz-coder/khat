"use client"

/**
 * HostView — the presenter's live view during recording.
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │  Active card (hero, spoken_kuwaiti)  │
 *   │  + guidance + entries + follow-ups   │
 *   │  + urgent team notes                 │
 *   ├─────────────────────────────────────┤
 *   │  Next card preview (compact)         │
 *   ├─────────────────────────────────────┤
 *   │  Host notes editor                   │
 *   └─────────────────────────────────────┘
 *
 * Constraints:
 *   - spoken_kuwaiti is always the hero element
 *   - Team notes shown only for active card
 *   - No clutter — minimal chrome
 *   - Clear phase / energy / status in header (via RoomHeader)
 */

import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import { useRoomCards } from "@/app/admin/preparation/[id]/room/contexts"
import { ActiveCard, CompactCard } from "./shared-card"
import type { RoomCardStatus } from "@/types/collaboration"
import { FileText, ChevronDown, Play, Pause, Square } from "lucide-react"
import { Button } from "@/components/ui/button"

export function HostView() {
  const { room, updateHostNotes, updateStatus, isHost } = useRoomState()
  const { cards, cardStates, activeCardId, getCardState, getCardNotes } = useRoomCards()

  // ── Derive active card + next card ─────────────────────────────

  const sortedCards = useMemo(() => {
    return cards.slice().sort((a, b) => a.sort_order - b.sort_order)
  }, [cards])

  const activeCard = useMemo(
    () => (activeCardId ? sortedCards.find((c) => c.id === activeCardId) : null),
    [sortedCards, activeCardId],
  )

  const nextCard = useMemo(() => {
    if (!activeCard) {
      // No active card — first pending card is "next"
      return sortedCards.find((c) => {
        const st = getCardState(c.id)
        return !st || st.status === "pending"
      })
    }
    const idx = sortedCards.findIndex((c) => c.id === activeCard.id)
    // Find next non-completed card after active
    for (let i = idx + 1; i < sortedCards.length; i++) {
      const st = getCardState(sortedCards[i].id)
      if (!st || st.status === "pending") return sortedCards[i]
    }
    return undefined
  }, [sortedCards, activeCard, getCardState])

  const activeNotes = activeCardId ? getCardNotes(activeCardId) : []

  // ── Host notes (with dirty tracking + save guard) ──────────────

  const [hostNotes, setHostNotes] = useState(room?.host_notes ?? "")
  const [notesDirty, setNotesDirty] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync from SSE when not dirty (other source of truth)
  useEffect(() => {
    if (!notesDirty && room?.host_notes !== undefined) {
      setHostNotes(room.host_notes)
    }
  }, [room?.host_notes, notesDirty])

  const handleNotesChange = useCallback(
    (value: string) => {
      setHostNotes(value)
      setNotesDirty(true)

      // Debounced auto-save (3s)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        await updateHostNotes(value)
        setNotesDirty(false)
      }, 3000)
    },
    [updateHostNotes],
  )

  // Save on unmount if dirty
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // Warn before leaving with unsaved notes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (notesDirty) e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [notesDirty])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 p-4 lg:p-6">
      {/* Room controls (host-only) */}
      {isHost && room && (
        <div className="flex items-center gap-2">
          {room.status === "waiting" && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => updateStatus("live")}>
              <Play className="h-3.5 w-3.5" />
              بدء التسجيل
            </Button>
          )}
          {room.status === "live" && (
            <>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => updateStatus("paused")}>
                <Pause className="h-3.5 w-3.5" />
                إيقاف مؤقت
              </Button>
              <Button size="sm" variant="destructive" className="h-8 gap-1.5 text-xs" onClick={() => updateStatus("ended")}>
                <Square className="h-3.5 w-3.5" />
                إنهاء التسجيل
              </Button>
            </>
          )}
          {room.status === "paused" && (
            <>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => updateStatus("live")}>
                <Play className="h-3.5 w-3.5" />
                استئناف
              </Button>
              <Button size="sm" variant="destructive" className="h-8 gap-1.5 text-xs" onClick={() => updateStatus("ended")}>
                <Square className="h-3.5 w-3.5" />
                إنهاء التسجيل
              </Button>
            </>
          )}
        </div>
      )}

      {/* Active card hero */}
      {activeCard ? (
        <section className="rounded-2xl border border-border/40 bg-card/50 p-5 lg:p-8">
          <ActiveCard
            card={activeCard}
            notes={activeNotes}
            showGuidance
            showMaterials
          />
        </section>
      ) : (
        <section className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border/30 bg-muted/5 p-8">
          <div className="text-center text-muted-foreground">
            <FileText className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p className="text-sm">لم يتم تفعيل بطاقة بعد</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              ينتظر المخرج لتفعيل البطاقة الأولى
            </p>
          </div>
        </section>
      )}

      {/* Next card preview */}
      {nextCard && (
        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            <ChevronDown className="h-3 w-3" />
            التالي
          </div>
          <CompactCard
            card={nextCard}
            status={getCardState(nextCard.id)?.status ?? "pending"}
            isPinned={getCardState(nextCard.id)?.is_pinned}
          />
        </section>
      )}

      {/* Host notes */}
      {isHost && (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              ملاحظاتي
            </span>
            {notesDirty && (
              <span className="text-[10px] text-amber-400/80">غير محفوظ</span>
            )}
          </div>
          <textarea
            value={hostNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="اكتب ملاحظاتك الشخصية هنا..."
            className="h-24 w-full resize-none rounded-lg border border-border/30 bg-muted/10 px-3 py-2 text-sm placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none"
          />
        </section>
      )}
    </div>
  )
}
