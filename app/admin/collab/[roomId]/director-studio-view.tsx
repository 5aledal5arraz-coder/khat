"use client"

/**
 * DirectorStudioView — the director's control panel during recording.
 *
 * Layout:
 *   ┌──────────┬──────────────────────────────────────┐
 *   │ Timeline │  Timer (read-only)                    │
 *   │ (sidebar │  Active card (no guidance, materials  │
 *   │  with    │    inline)                            │
 *   │  card    │  Notes panel (composer + all notes)   │
 *   │  ctrls)  │  Markers (always visible, can add)    │
 *   └──────────┴─────────────────────��────────────────┘
 */

import { useMemo } from "react"
import { useRoomCards } from "@/app/admin/preparation/[id]/room/contexts"
import { StudioTimer } from "./studio-timer"
import { StudioCardDisplay } from "./studio-card-display"
import { StudioCardTimeline } from "./studio-card-timeline"
import { StudioNotesPanel } from "./studio-notes-panel"
import { StudioMarkers } from "./studio-markers"
import { FileText } from "lucide-react"

export function DirectorStudioView() {
  const { cards, activeCardId, getCardNotes } = useRoomCards()

  const sortedCards = useMemo(
    () => cards.slice().sort((a, b) => a.sort_order - b.sort_order),
    [cards],
  )

  const activeCard = useMemo(
    () => (activeCardId ? sortedCards.find((c) => c.id === activeCardId) : null),
    [sortedCards, activeCardId],
  )

  const activeNotes = activeCardId ? getCardNotes(activeCardId) : []

  return (
    <div className="flex h-full">
      {/* Sidebar: card timeline with controls (desktop) */}
      <div className="hidden lg:block">
        <StudioCardTimeline layout="sidebar" />
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Mobile card strip */}
        <div className="lg:hidden">
          <StudioCardTimeline layout="horizontal" />
        </div>

        <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 lg:p-8">
          {/* Timer (read-only for director) */}
          <section className="flex justify-center">
            <StudioTimer compact />
          </section>

          {/* Active card */}
          {activeCard ? (
            <section className="rounded-2xl border border-border/20 bg-card/20 p-6 lg:p-8">
              <StudioCardDisplay
                card={activeCard}
                notes={activeNotes}
                showGuidance={false}
                showMaterials
              />
            </section>
          ) : (
            <section className="flex items-center justify-center rounded-2xl border border-dashed border-border/20 bg-muted/5 p-12">
              <div className="text-center text-muted-foreground/40">
                <FileText className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-sm">لا توجد بطاقة نشطة</p>
                <p className="mt-1 text-xs text-muted-foreground/30">
                  اختر بطاقة من القائمة لتفعيلها
                </p>
              </div>
            </section>
          )}

          {/* Notes panel */}
          {activeCard && (
            <section>
              <StudioNotesPanel />
            </section>
          )}

          {/* Markers (always visible for director) */}
          <StudioMarkers defaultExpanded />
        </div>
      </div>
    </div>
  )
}
