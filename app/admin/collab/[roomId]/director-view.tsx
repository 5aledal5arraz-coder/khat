"use client"

/**
 * DirectorView — the director's control panel during recording.
 *
 * Layout (two columns on desktop):
 *   ┌──────────────────┬──────────────────────┐
 *   │  Card queue       │  Active card detail   │
 *   │  (pending/used)   │  + send note form     │
 *   │                   │                       │
 *   │  Room status      │                       │
 *   └──────────────────┴──────────────────────┘
 *
 * Director CAN (server-enforced: director+ room role):
 *   - Activate / skip / mark-used cards (card-state endpoint)
 *   - Pin cards (card-state endpoint)
 *   - Send notes (normal / urgent / tactical)
 *
 * Director CANNOT (host-only on server):
 *   - Start / pause / end room
 *   - Edit host notes
 *   - Change phase / energy
 *   - Set active_card_id on room
 *
 * Note: `activeCardId` in cards context is derived from card states
 * (not room.active_card_id), so markCard(id, "active") is sufficient.
 */

import { useState, useCallback, useRef, useMemo } from "react"
import { useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import { useRoomCards } from "@/app/admin/preparation/[id]/room/contexts"
import { ActiveCard, CompactCard } from "./shared-card"
import type { RoomCardStatus, CardNoteType } from "@/types/collaboration"
import { cn } from "@/lib/utils"
import {
  Play,
  SkipForward,
  CheckCircle2,
  Pin,
  Send,
  AlertTriangle,
  Flame,
  FileText,
  Radio,
  Pause,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"

// ─── Note type selector ──────────────────────────────────────────────

const NOTE_TYPES: { value: CardNoteType; label: string; icon: typeof Send }[] = [
  { value: "normal", label: "عادي", icon: Send },
  { value: "urgent", label: "عاجل", icon: AlertTriangle },
  { value: "tactical", label: "تكتيكي", icon: Flame },
]

// ─── Room status display (read-only for director) ────────────────────

const STATUS_DISPLAY = {
  waiting: { label: "في الانتظار", icon: Clock, color: "text-muted-foreground" },
  live: { label: "مباشر", icon: Radio, color: "text-red-400" },
  paused: { label: "متوقف", icon: Pause, color: "text-amber-400" },
  ended: { label: "انتهى", icon: CheckCircle2, color: "text-emerald-400" },
} as const

// ─── Director View ───────────────────────────────────────────────────

export function DirectorView() {
  const { room } = useRoomState()
  const {
    cards,
    activeCardId,
    getCardState,
    getCardNotes,
    markCard,
    pinCard,
    addNote,
  } = useRoomCards()

  // ── Sorted cards ───────────────────────────────────────────────

  const sortedCards = useMemo(
    () => cards.slice().sort((a, b) => a.sort_order - b.sort_order),
    [cards],
  )

  const activeCard = useMemo(
    () => (activeCardId ? sortedCards.find((c) => c.id === activeCardId) : null),
    [sortedCards, activeCardId],
  )

  const activeNotes = activeCardId ? getCardNotes(activeCardId) : []

  // ── Note form state ────────────────────────────────────────────

  const [noteText, setNoteText] = useState("")
  const [noteType, setNoteType] = useState<CardNoteType>("normal")
  const [noteSending, setNoteSending] = useState(false)
  const noteInputRef = useRef<HTMLInputElement>(null)

  const handleSendNote = useCallback(async () => {
    if (!noteText.trim() || !activeCardId) return
    setNoteSending(true)
    await addNote(activeCardId, noteText.trim(), noteType)
    setNoteText("")
    setNoteType("normal")
    setNoteSending(false)
    noteInputRef.current?.focus()
  }, [noteText, noteType, activeCardId, addNote])

  // ── Card actions (all director-level, server-enforced) ─────────

  const handleActivateCard = useCallback(
    async (cardId: string) => {
      // Mark current active as used first
      if (activeCardId) {
        await markCard(activeCardId, "used")
      }
      // Mark new card as active — activeCardId is derived from card states
      await markCard(cardId, "active")
    },
    [activeCardId, markCard],
  )

  const handleSkipCard = useCallback(
    async (cardId: string) => {
      await markCard(cardId, "skipped")
    },
    [markCard],
  )

  const handleMarkUsed = useCallback(
    async (cardId: string) => {
      await markCard(cardId, "used")
    },
    [markCard],
  )

  const handleTogglePin = useCallback(
    async (cardId: string) => {
      const state = getCardState(cardId)
      await pinCard(cardId, !(state?.is_pinned ?? false))
    },
    [getCardState, pinCard],
  )

  // ── Render ─────────────────────────────────────────────────────

  const statusCfg = room ? STATUS_DISPLAY[room.status] : null
  const StatusIcon = statusCfg?.icon ?? Clock

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left: card queue */}
      <div className="flex w-full shrink-0 flex-col border-b border-border/30 lg:w-80 lg:border-b-0 lg:border-l lg:border-border/30">
        {/* Room status (read-only) */}
        <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
          <StatusIcon className={cn("h-4 w-4", statusCfg?.color, room?.status === "live" && "animate-pulse")} />
          <span className={cn("text-xs font-semibold", statusCfg?.color)}>
            {statusCfg?.label ?? "—"}
          </span>
          {room?.phase && (
            <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {room.phase}
            </span>
          )}
        </div>

        {/* Card queue */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2">
            قائمة البطاقات ({sortedCards.length})
          </div>
          {sortedCards.map((card) => {
            const state = getCardState(card.id)
            const cardStatus: RoomCardStatus = state?.status ?? "pending"
            const isActive = card.id === activeCardId

            return (
              <div key={card.id} className="group relative">
                <CompactCard
                  card={card}
                  status={cardStatus}
                  isPinned={state?.is_pinned}
                  isActive={isActive}
                />

                {/* Action buttons on hover — pending cards */}
                {cardStatus === "pending" && (
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => handleActivateCard(card.id)}
                      className="rounded-md bg-primary/20 p-1 text-primary hover:bg-primary/30"
                      title="تفعيل"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleSkipCard(card.id)}
                      className="rounded-md bg-muted/50 p-1 text-muted-foreground hover:bg-muted"
                      title="تخطي"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleTogglePin(card.id)}
                      className="rounded-md bg-muted/50 p-1 text-muted-foreground hover:bg-amber-500/20 hover:text-amber-400"
                      title="تثبيت"
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Active card actions */}
                {isActive && (
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      onClick={() => handleMarkUsed(card.id)}
                      className="rounded-md bg-emerald-500/20 p-1 text-emerald-400 hover:bg-emerald-500/30"
                      title="تمّت"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleSkipCard(card.id)}
                      className="rounded-md bg-muted/50 p-1 text-muted-foreground hover:bg-muted"
                      title="تخطي"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Right: active card detail + notes */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeCard ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 lg:p-6">
              <ActiveCard
                card={activeCard}
                notes={activeNotes}
                showGuidance={false}
                showMaterials
              />
            </div>

            {/* Note composer */}
            <div className="border-t border-border/30 p-3">
              <div className="flex items-center gap-2">
                {/* Note type toggles */}
                <div className="flex gap-0.5">
                  {NOTE_TYPES.map((t) => {
                    const Icon = t.icon
                    return (
                      <button
                        key={t.value}
                        onClick={() => setNoteType(t.value)}
                        className={cn(
                          "rounded-md p-1.5 text-xs transition-colors",
                          noteType === t.value
                            ? t.value === "urgent"
                              ? "bg-red-500/20 text-red-400"
                              : t.value === "tactical"
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-primary/20 text-primary"
                            : "text-muted-foreground/50 hover:text-muted-foreground",
                        )}
                        title={t.label}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    )
                  })}
                </div>

                <input
                  ref={noteInputRef}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSendNote()
                    }
                  }}
                  placeholder="اكتب ملاحظة للمقدّم..."
                  className="min-w-0 flex-1 rounded-lg border border-border/30 bg-muted/10 px-3 py-1.5 text-sm placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none"
                  disabled={noteSending}
                />

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={handleSendNote}
                  disabled={!noteText.trim() || noteSending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-10 w-10 opacity-30" />
              <p className="text-sm">لا توجد بطاقة نشطة</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                اختر بطاقة من القائمة لتفعيلها
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
