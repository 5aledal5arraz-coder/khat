"use client"

/**
 * ViewerStudioView — simplified read-only view for photographer/editor/viewer roles.
 *
 * Shows: large timer, active card question (simplified), note composer, markers (read-only).
 * No card navigation, no controls, no guidance.
 */

import { useMemo } from "react"
import { useRoomCards } from "@/app/admin/preparation/[id]/room/contexts"
import { StudioTimer } from "./studio-timer"
import { StudioCardDisplay } from "./studio-card-display"
import { StudioNotesPanel } from "./studio-notes-panel"
import { StudioMarkers } from "./studio-markers"
import { FileText } from "lucide-react"

export function ViewerStudioView() {
  const { cards, activeCardId, getCardNotes } = useRoomCards()

  const activeCard = useMemo(
    () => (activeCardId ? cards.find((c) => c.id === activeCardId) : null),
    [cards, activeCardId],
  )

  const activeNotes = activeCardId
    ? getCardNotes(activeCardId).filter((n) => n.note_type === "urgent" && !n.resolved_at)
    : []

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col p-4 lg:p-8">
      <div className="flex-1 space-y-6">
        {/* Timer (read-only, large) */}
        <section className="flex justify-center">
          <StudioTimer />
        </section>

        {/* Active card — simplified */}
        {activeCard ? (
          <section className="rounded-2xl border border-border/20 bg-card/20 p-6 lg:p-8">
            <StudioCardDisplay
              card={activeCard}
              notes={activeNotes}
              showGuidance={false}
              showMaterials={false}
            />
          </section>
        ) : (
          <section className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border/20 bg-muted/5 p-12">
            <div className="text-center text-muted-foreground">
              <FileText className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p className="text-sm">في الانتظار...</p>
              <p className="mt-1 text-xs text-muted-foreground/30">
                سيظهر المحتوى عند تفعيل بطاقة
              </p>
            </div>
          </section>
        )}

        {/* Note composer */}
        {activeCard && (
          <section>
            <StudioNotesPanel />
          </section>
        )}

        {/* Markers (read-only, collapsed) */}
        <StudioMarkers />
      </div>
    </div>
  )
}
