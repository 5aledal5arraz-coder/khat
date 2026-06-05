"use client"

/**
 * HostStudioView — the presenter's cockpit during live recording.
 *
 * Layout:
 *   ┌──────────┬──────────────────────────────────────┐
 *   │ Timeline │  Timer (large)                        │
 *   │ (sidebar)│  Active card (hero: spoken_kuwaiti)   │
 *   │          │    + guidance, entries, follow-ups     │
 *   │          │    + team notes (urgent highlighted)   │
 *   │          │  Next card preview                     │
 *   │          │  Markers (collapsed)                   │
 *   │          │  Host notes editor                     │
 *   └──────────┴──────────────────────────────────────┘
 */

import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { useRoomState, useRoomCards, useRoomTimer } from "@/app/admin/preparation/[id]/room/contexts"
import { StudioTimer } from "./studio-timer"
import { StudioCardDisplay } from "./studio-card-display"
import { StudioCardTimeline } from "./studio-card-timeline"
import { StudioNotesPanel } from "./studio-notes-panel"
import { StudioMarkers } from "./studio-markers"
import { FileText, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export function HostStudioView() {
  const { room, updateHostNotes, isHost } = useRoomState()
  const { cards, activeCardId, getCardState, getCardNotes } = useRoomCards()

  // ── Derive active + next card ───────────────────────────────────

  const sortedCards = useMemo(
    () => cards.slice().sort((a, b) => a.sort_order - b.sort_order),
    [cards],
  )

  const activeCard = useMemo(
    () => (activeCardId ? sortedCards.find((c) => c.id === activeCardId) : null),
    [sortedCards, activeCardId],
  )

  const nextCard = useMemo(() => {
    if (!activeCard) {
      return sortedCards.find((c) => {
        const st = getCardState(c.id)
        return !st || st.status === "pending"
      })
    }
    const idx = sortedCards.findIndex((c) => c.id === activeCard.id)
    for (let i = idx + 1; i < sortedCards.length; i++) {
      const st = getCardState(sortedCards[i].id)
      if (!st || st.status === "pending") return sortedCards[i]
    }
    return undefined
  }, [sortedCards, activeCard, getCardState])

  const activeNotes = activeCardId ? getCardNotes(activeCardId) : []

  // ── Host notes (debounced auto-save) ────────────────────────────

  const [hostNotes, setHostNotes] = useState(room?.host_notes ?? "")
  const [notesDirty, setNotesDirty] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!notesDirty && room?.host_notes !== undefined) {
      setHostNotes(room.host_notes)
    }
  }, [room?.host_notes, notesDirty])

  const handleNotesChange = useCallback(
    (value: string) => {
      setHostNotes(value)
      setNotesDirty(true)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        await updateHostNotes(value)
        setNotesDirty(false)
      }, 3000)
    },
    [updateHostNotes],
  )

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (notesDirty) e.preventDefault() }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [notesDirty])

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* Sidebar: card timeline (desktop only) */}
      <div className="hidden lg:block">
        <StudioCardTimeline layout="sidebar" />
      </div>

      {/* Mobile: horizontal card strip */}
      <div className="contents lg:hidden">
        {/* This renders above the main content on mobile */}
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Mobile card strip */}
        <div className="lg:hidden">
          <StudioCardTimeline layout="horizontal" />
        </div>

        <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 lg:p-8">
          {/* Timer */}
          <section className="flex justify-center">
            <StudioTimer />
          </section>

          {/* Active card hero */}
          {activeCard ? (
            <section className="rounded-2xl border border-border/20 bg-card/20 p-6 lg:p-8">
              <StudioCardDisplay
                card={activeCard}
                notes={activeNotes}
                showGuidance
                showMaterials
              />
            </section>
          ) : (
            <section className="flex items-center justify-center rounded-2xl border border-dashed border-border/20 bg-muted/5 p-12">
              <div className="text-center text-muted-foreground/40">
                <FileText className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-sm">لم يتم تفعيل بطاقة بعد</p>
                <p className="mt-1 text-xs text-muted-foreground/30">
                  ينتظر المخرج لتفعيل البطاقة الأولى
                </p>
              </div>
            </section>
          )}

          {/* Team notes */}
          {activeCard && (
            <section>
              <StudioNotesPanel />
            </section>
          )}

          {/* Next card preview */}
          {nextCard && (
            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/30">
                <ChevronDown className="h-3 w-3" />
                التالي
              </div>
              <div className="rounded-xl border border-border/15 bg-card/10 px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-[10px] text-muted-foreground/30">
                    {nextCard.sort_order + 1}
                  </span>
                  <span className="font-medium text-muted-foreground/70">
                    {nextCard.short_title}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground/40 text-sm">
                  {nextCard.spoken_kuwaiti}
                </p>
              </div>
            </section>
          )}

          {/* Session markers */}
          <StudioMarkers />

          {/* Host notes editor */}
          {isHost && (
            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/30">
                  ملاحظاتي
                </span>
                {notesDirty && (
                  <span className="text-[10px] text-amber-400/60">غير محفوظ</span>
                )}
              </div>
              <textarea
                value={hostNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="اكتب ملاحظاتك الشخصية هنا..."
                className="h-24 w-full resize-none rounded-xl border border-border/20 bg-muted/5 px-4 py-3 text-sm placeholder:text-muted-foreground/20 focus:border-primary/30 focus:outline-none"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
