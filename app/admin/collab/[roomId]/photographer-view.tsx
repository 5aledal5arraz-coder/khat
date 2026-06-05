"use client"

/**
 * PhotographerView — simplified read-only view for photographer/editor/viewer roles.
 *
 * Shows:
 *   - Current active card (spoken_kuwaiti hero + bucket + section)
 *   - Room status and phase
 *   - "Send note" ability (all participants can send notes)
 *
 * Does NOT show:
 *   - Card queue / card controls
 *   - Host guidance / entries / follow-ups
 *   - Room controls (start/pause/end)
 *   - Host notes
 */

import { useState, useCallback, useRef, useMemo } from "react"
import { useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import { useRoomCards } from "@/app/admin/preparation/[id]/room/contexts"
import { ActiveCard, CardBucketBadge } from "./shared-card"
import type { CardNoteType } from "@/types/collaboration"
import { FileText, Send, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PhotographerView() {
  const { room } = useRoomState()
  const { cards, activeCardId, getCardNotes, addNote } = useRoomCards()

  const activeCard = useMemo(
    () => (activeCardId ? cards.find((c) => c.id === activeCardId) : null),
    [cards, activeCardId],
  )

  // ── Note sending ───────────────────────────────────────────────

  const [noteText, setNoteText] = useState("")
  const [noteSending, setNoteSending] = useState(false)
  const [noteType, setNoteType] = useState<CardNoteType>("normal")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSendNote = useCallback(async () => {
    if (!noteText.trim() || !activeCardId) return
    setNoteSending(true)
    await addNote(activeCardId, noteText.trim(), noteType)
    setNoteText("")
    setNoteType("normal")
    setNoteSending(false)
    inputRef.current?.focus()
  }, [noteText, noteType, activeCardId, addNote])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col p-4 lg:p-6">
      {activeCard ? (
        <>
          {/* Active card — simplified (no guidance, no materials) */}
          <section className="flex-1 rounded-2xl border border-border/40 bg-card/50 p-5 lg:p-8">
            <ActiveCard
              card={activeCard}
              notes={getCardNotes(activeCardId!).filter(
                (n) => n.note_type === "urgent" && !n.resolved_at,
              )}
              showGuidance={false}
              showMaterials={false}
            />
          </section>

          {/* Note composer */}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setNoteType(noteType === "urgent" ? "normal" : "urgent")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                noteType === "urgent"
                  ? "bg-red-500/20 text-red-400"
                  : "text-muted-foreground/40 hover:text-muted-foreground",
              )}
              title="عاجل"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </button>

            <input
              ref={inputRef}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSendNote()
                }
              }}
              placeholder="ملاحظة سريعة..."
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
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileText className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p className="text-sm">في الانتظار...</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              سيظهر المحتوى عند تفعيل بطاقة
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
