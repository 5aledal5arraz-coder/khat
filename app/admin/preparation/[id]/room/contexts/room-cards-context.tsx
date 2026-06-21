"use client"

/**
 * RoomCardsContext — card states, notes, and pin tracking during a live room.
 *
 * Hydrated from the initial snapshot, then updated by SSE events:
 *   - card_state_update → card status (pending → active → used/skipped)
 *   - note_added        → new note from team
 *   - note_seen         → host marked a note as seen
 *   - card_pinned       → card pin toggled in room
 *
 * Provides action helpers for marking cards, adding notes, and pinning.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type {
  InterviewCardWithMaterials,
  RoomCardState,
  RoomCardNote,
  RoomCardStatus,
  CardNoteType,
  NotePriority,
  RoomEvent,
} from "@/types/collaboration"
import { useRoomConnection } from "./room-connection-context"

// ─── Types ──────────────────────────────────────────────────────────

interface RoomCardsContextValue {
  // Data
  cards: InterviewCardWithMaterials[]
  cardStates: RoomCardState[]
  notes: RoomCardNote[]

  // Derived
  activeCardId: string | null
  getCardState: (cardId: string) => RoomCardState | undefined
  getCardNotes: (cardId: string) => RoomCardNote[]
  getSectionNotes: (sectionKey: string) => RoomCardNote[]
  unseenNotesCount: number

  // Card state actions (host/director)
  markCard: (cardId: string, status: RoomCardStatus) => Promise<void>
  pinCard: (cardId: string, pinned: boolean) => Promise<void>

  // Note actions (any participant)
  addNote: (cardId: string, content: string, noteType?: CardNoteType, priority?: NotePriority) => Promise<void>
  /** Generalized note post — attach to a card, a prep_v2 section, or neither (room-global). */
  postNote: (input: {
    card_id?: string
    section_key?: string
    content: string
    note_type?: CardNoteType
    priority?: NotePriority
  }) => Promise<void>
  markNoteSeen: (noteId: string) => Promise<void>
}

// ─── Context ────────────────────────────────────────────────────────

const RoomCardsContext = createContext<RoomCardsContextValue | null>(null)

export function useRoomCards() {
  const ctx = useContext(RoomCardsContext)
  if (!ctx) throw new Error("useRoomCards must be used within RoomCardsProvider")
  return ctx
}

// ─── Provider ───────────────────────────────────────────────────────

export function RoomCardsProvider({
  prepId,
  roomId,
  children,
}: {
  prepId: string
  roomId: string
  children: ReactNode
}) {
  const { snapshot, subscribe } = useRoomConnection()

  const [cards, setCards] = useState<InterviewCardWithMaterials[]>([])
  const [cardStates, setCardStates] = useState<RoomCardState[]>([])
  const [notes, setNotes] = useState<RoomCardNote[]>([])

  // ── Hydrate from snapshot ───────────────────────────────────────

  useEffect(() => {
    if (!snapshot) return
    setCards(snapshot.cards)
    setCardStates(snapshot.card_states)
    setNotes(snapshot.notes)
  }, [snapshot])

  // ── Subscribe to SSE events ─────────────────────────────────────

  useEffect(() => {
    const unsub = subscribe((event: RoomEvent) => {
      switch (event.type) {
        case "card_state_update": {
          const s = event.data as RoomCardState
          setCardStates((prev) => {
            const exists = prev.find((x) => x.id === s.id)
            if (exists) {
              return prev.map((x) => (x.id === s.id ? { ...x, ...s } : x))
            }
            return [...prev, s]
          })
          break
        }

        case "note_added": {
          const n = event.data as RoomCardNote
          setNotes((prev) => [...prev, n])
          break
        }

        case "note_seen": {
          // API broadcasts { id, resolved? } — mark as seen or resolved
          const d = event.data as { id: string; resolved?: boolean }
          setNotes((prev) =>
            prev.map((n) =>
              n.id === d.id
                ? {
                    ...n,
                    is_seen_by_host: true,
                    seen_by_host_at: event.timestamp,
                    ...(d.resolved ? { resolved_at: event.timestamp } : {}),
                  }
                : n,
            ),
          )
          break
        }

        case "card_pinned": {
          // API broadcasts the full RoomCardState after pin toggle
          const s = event.data as RoomCardState
          setCardStates((prev) => {
            const exists = prev.find((x) => x.id === s.id)
            if (exists) return prev.map((x) => (x.id === s.id ? { ...x, ...s } : x))
            return [...prev, s]
          })
          break
        }
      }
    })
    return unsub
  }, [subscribe])

  // ── Derived state ─────────────────────────────────────────────

  const activeCardId = useMemo(
    () => cardStates.find((s) => s.status === "active")?.card_id ?? null,
    [cardStates],
  )

  const getCardState = useCallback(
    (cardId: string) => cardStates.find((s) => s.card_id === cardId),
    [cardStates],
  )

  const getCardNotes = useCallback(
    (cardId: string) => notes.filter((n) => n.card_id === cardId),
    [notes],
  )

  const getSectionNotes = useCallback(
    (sectionKey: string) => notes.filter((n) => n.section_key === sectionKey),
    [notes],
  )

  const unseenNotesCount = useMemo(
    () => notes.filter((n) => !n.is_seen_by_host && !n.resolved_at).length,
    [notes],
  )

  // ── API helpers ───────────────────────────────────────────────

  const apiBase = `/api/admin/preparation/${prepId}/rooms/${roomId}`

  const markCard = useCallback(
    async (cardId: string, status: RoomCardStatus) => {
      await fetch(`${apiBase}/card-state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ card_id: cardId, status }),
      })
    },
    [apiBase],
  )

  const pinCard = useCallback(
    async (cardId: string, pinned: boolean) => {
      await fetch(`${apiBase}/card-state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ card_id: cardId, is_pinned: pinned }),
      })
    },
    [apiBase],
  )

  const postNote = useCallback(
    async (input: {
      card_id?: string
      section_key?: string
      content: string
      note_type?: CardNoteType
      priority?: NotePriority
    }) => {
      await fetch(`${apiBase}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({
          card_id: input.card_id,
          section_key: input.section_key,
          content: input.content,
          note_type: input.note_type ?? "normal",
          priority: input.priority ?? "medium",
        }),
      })
    },
    [apiBase],
  )

  // V1 compatibility — card-scoped note (delegates to postNote).
  const addNote = useCallback(
    (
      cardId: string,
      content: string,
      noteType: CardNoteType = "normal",
      priority: NotePriority = "medium",
    ) => postNote({ card_id: cardId, content, note_type: noteType, priority }),
    [postNote],
  )

  const markNoteSeen = useCallback(
    async (noteId: string) => {
      await fetch(`${apiBase}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ note_id: noteId, action: "seen" }),
      })
    },
    [apiBase],
  )

  return (
    <RoomCardsContext.Provider
      value={{
        cards,
        cardStates,
        notes,
        activeCardId,
        getCardState,
        getCardNotes,
        getSectionNotes,
        unseenNotesCount,
        markCard,
        pinCard,
        addNote,
        postNote,
        markNoteSeen,
      }}
    >
      {children}
    </RoomCardsContext.Provider>
  )
}
