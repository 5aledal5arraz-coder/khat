"use client"

/**
 * StudioNotesPanel — team notes display + composer for the active card.
 */

import { useState, useCallback, useRef, useMemo } from "react"
import { useRoomCards, useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import type { CardNoteType, RoomCardNote } from "@/types/collaboration"
import { cn } from "@/lib/utils"
import {
  Send,
  AlertTriangle,
  Flame,
  MessageCircle,
  Eye,
  CheckCircle2,
} from "lucide-react"

const NOTE_TYPES: { value: CardNoteType; label: string; icon: typeof Send; activeClass: string }[] = [
  { value: "normal", label: "عادي", icon: Send, activeClass: "bg-primary/20 text-primary" },
  { value: "urgent", label: "عاجل", icon: AlertTriangle, activeClass: "bg-red-500/20 text-red-700" },
  { value: "tactical", label: "تكتيكي", icon: Flame, activeClass: "bg-amber-500/20 text-amber-700" },
]

export function StudioNotesPanel() {
  const { activeCardId, getCardNotes, addNote, markNoteSeen } = useRoomCards()
  const { isHost } = useRoomState()

  const notes = useMemo(
    () => activeCardId ? getCardNotes(activeCardId).filter((n) => !n.resolved_at) : [],
    [activeCardId, getCardNotes],
  )

  const [noteText, setNoteText] = useState("")
  const [noteType, setNoteType] = useState<CardNoteType>("normal")
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = useCallback(async () => {
    if (!noteText.trim() || !activeCardId) return
    setSending(true)
    await addNote(activeCardId, noteText.trim(), noteType)
    setNoteText("")
    setNoteType("normal")
    setSending(false)
    inputRef.current?.focus()
  }, [noteText, noteType, activeCardId, addNote])

  if (!activeCardId) return null

  return (
    <div className="space-y-2">
      {/* Notes list */}
      {notes.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              isHost={isHost}
              onMarkSeen={() => markNoteSeen(note.id)}
            />
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="flex items-center gap-2">
        {/* Type toggles */}
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
                    ? t.activeClass
                    : "text-muted-foreground hover:text-muted-foreground",
                )}
                title={t.label}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            )
          })}
        </div>

        <input
          ref={inputRef}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="ملاحظة للمقدّم..."
          className="min-w-0 flex-1 rounded-lg border border-border/30 bg-muted/10 px-3 py-1.5 text-sm placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none"
          disabled={sending}
        />

        <button
          onClick={handleSend}
          disabled={!noteText.trim() || sending}
          className="shrink-0 rounded-lg p-2 text-muted-foreground hover:text-primary disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function NoteRow({
  note,
  isHost,
  onMarkSeen,
}: {
  note: RoomCardNote
  isHost: boolean
  onMarkSeen: () => void
}) {
  const isUrgent = note.note_type === "urgent"
  const isTactical = note.note_type === "tactical"

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
        isUrgent
          ? "border border-red-500/30 bg-red-500/5 text-red-700"
          : isTactical
            ? "border border-amber-500/20 bg-amber-500/5 text-amber-700"
            : "bg-muted/10 text-muted-foreground",
      )}
    >
      {isUrgent ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : isTactical ? (
        <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}

      <span className="min-w-0 flex-1">{note.content}</span>

      {/* Host can mark as seen */}
      {isHost && !note.is_seen_by_host && (
        <button
          onClick={onMarkSeen}
          className="shrink-0 rounded p-0.5 text-muted-foreground/30 hover:text-primary"
          title="تم الاطلاع"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      )}

      {note.is_seen_by_host && (
        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-700/40" />
      )}
    </div>
  )
}
