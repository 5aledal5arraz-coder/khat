"use client"

/**
 * RoomNotesPanel — real-time team notes for the V2 recording room.
 *
 * Ported from the V1 collab room onto the prep_v2 model: notes attach to a
 * prep_v2 section (section_key) instead of an interview card. Any participant
 * can post; the host sees incoming notes live and marks them seen.
 *
 *   - inline (participant view): composer + list for the active section
 *   - floating (host cockpit overlay): live incoming notes + mark-seen
 *
 * All writes go through useRoomCards().postNote / markNoteSeen, which broadcast
 * over SSE so every participant updates without a reload.
 */

import { useMemo, useState } from "react"
import { useRoomCards, useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/shared/formatters"
import type { CardNoteType, RoomCardNote } from "@/types/collaboration"
import { MessageSquare, Send, Check, CheckCheck, Loader2 } from "lucide-react"

const NOTE_TYPES: { type: CardNoteType; label: string; tone: string }[] = [
  { type: "normal", label: "عادية", tone: "border-border/60 text-muted-foreground" },
  { type: "tactical", label: "تكتيكية", tone: "border-violet-500/40 text-violet-700" },
  { type: "urgent", label: "عاجلة", tone: "border-rose-500/40 text-rose-700" },
]

const NOTE_BADGE: Record<CardNoteType, { label: string; cls: string }> = {
  normal: { label: "عادية", cls: "bg-muted/40 text-muted-foreground" },
  tactical: { label: "تكتيكية", cls: "bg-violet-500/10 text-violet-700" },
  urgent: { label: "عاجلة", cls: "bg-rose-500/10 text-rose-700" },
}

export function RoomNotesPanel({
  sectionKey,
  role,
  floating = false,
  showAll = false,
}: {
  sectionKey?: string
  role: string
  floating?: boolean
  /** Inline mode: show the whole room's notes (host drawer), not just the
   *  active section + global — so the list matches the unseen-notes count. */
  showAll?: boolean
}) {
  const { notes, postNote, markNoteSeen, unseenNotesCount } = useRoomCards()
  const { participants } = useRoomState()
  const [open, setOpen] = useState(true)

  const authorName = useMemo(() => {
    const map = new Map(participants.map((p) => [p.id, p.display_name]))
    return (id: string) => map.get(id) ?? "مشارك"
  }, [participants])

  const canMarkSeen = role === "host"

  // Floating (host): the whole room's notes, newest first.
  // Inline (participant): notes on the active section + room-global notes.
  const visible = useMemo(() => {
    const list =
      floating || showAll
        ? notes
        : notes.filter(
            (n) =>
              (sectionKey && n.section_key === sectionKey) ||
              (!n.card_id && !n.section_key),
          )
    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }, [notes, floating, showAll, sectionKey])

  const renderNote = (n: RoomCardNote) => {
    const badge = NOTE_BADGE[n.note_type] ?? NOTE_BADGE.normal
    const unseen = !n.is_seen_by_host && !n.resolved_at
    return (
      <li
        key={n.id}
        className={cn(
          "rounded-lg border px-2.5 py-2 text-[12px]",
          unseen
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border/40 bg-card/40",
        )}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("rounded px-1.5 py-0.5 text-[9.5px] font-bold", badge.cls)}>
              {badge.label}
            </span>
            <span className="text-[10.5px] font-medium text-foreground/80">
              {authorName(n.author_id)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <time className="text-[10px] text-muted-foreground">
              {formatRelativeTime(n.created_at)}
            </time>
            {n.is_seen_by_host ? (
              <CheckCheck className="h-3 w-3 text-emerald-600" />
            ) : (
              <Check className="h-3 w-3 text-muted-foreground/50" />
            )}
          </span>
        </div>
        <p className="leading-relaxed text-foreground/90">{n.content}</p>
        {canMarkSeen && unseen && (
          <button
            type="button"
            onClick={() => void markNoteSeen(n.id)}
            className="mt-1.5 rounded-md border border-border/50 px-2 py-0.5 text-[10.5px] text-muted-foreground transition hover:bg-muted/40"
          >
            وضع كمقروء
          </button>
        )}
      </li>
    )
  }

  // ── Floating host overlay ───────────────────────────────────────
  if (floating) {
    if (visible.length === 0) return null
    return (
      <div className="fixed bottom-3 end-3 z-40 w-64 max-w-[80vw]" dir="rtl">
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold"
          >
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3 text-violet-600" /> ملاحظات الفريق
            </span>
            {unseenNotesCount > 0 && (
              <span className="rounded-full bg-amber-500/15 px-1.5 text-[10.5px] font-bold text-amber-700">
                {unseenNotesCount} جديدة
              </span>
            )}
          </button>
          {open && (
            <ul className="max-h-72 space-y-1.5 overflow-auto px-3 pb-3">
              {visible.slice(0, 12).map(renderNote)}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // ── Inline participant panel (composer + list) ──────────────────
  return (
    <div className="rounded-2xl border border-border/40 bg-card/30 p-3">
      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <MessageSquare className="h-3 w-3" /> ملاحظات الفريق
      </div>
      <NoteComposer sectionKey={sectionKey} onPost={postNote} />
      {visible.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">لا ملاحظات بعد.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">{visible.map(renderNote)}</ul>
      )}
    </div>
  )
}

function NoteComposer({
  sectionKey,
  onPost,
}: {
  sectionKey?: string
  onPost: (input: {
    section_key?: string
    content: string
    note_type?: CardNoteType
  }) => Promise<void>
}) {
  const [content, setContent] = useState("")
  const [noteType, setNoteType] = useState<CardNoteType>("normal")
  const [sending, setSending] = useState(false)

  const send = async () => {
    const text = content.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await onPost({ section_key: sectionKey, content: text, note_type: noteType })
      setContent("")
      setNoteType("normal")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send()
        }}
        rows={2}
        maxLength={1000}
        placeholder="اكتب ملاحظة للفريق…"
        className="w-full resize-none rounded-xl border border-border/50 bg-card/60 px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-primary/50"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {NOTE_TYPES.map(({ type, label, tone }) => (
            <button
              key={type}
              type="button"
              onClick={() => setNoteType(type)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                noteType === type ? cn(tone, "bg-card") : "border-border/40 text-muted-foreground/70",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!content.trim() || sending}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          إرسال
        </button>
      </div>
    </div>
  )
}
