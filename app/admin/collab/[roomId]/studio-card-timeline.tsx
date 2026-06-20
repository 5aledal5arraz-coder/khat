"use client"

/**
 * StudioCardTimeline — card navigation sidebar / horizontal strip.
 *
 * Shows all cards in order with status indicators. Director can activate/skip cards.
 */

import { useMemo, useCallback } from "react"
import { useRoomCards, useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import type { RoomCardStatus, InterviewCardWithMaterials } from "@/types/collaboration"
import { cn } from "@/lib/utils"
import {
  Play,
  SkipForward,
  CheckCircle2,
  Pin,
  Sparkles,
} from "lucide-react"

// ─── Status styles ───────────────────────────────────────────────────

const STATUS_DOT: Record<RoomCardStatus, string> = {
  pending: "bg-muted-foreground/20",
  active: "bg-amber-400 shadow-amber-400/40 shadow-sm",
  used: "bg-emerald-400",
  skipped: "bg-muted-foreground/15",
}

const BUCKET_DOT: Record<string, string> = {
  opening: "border-sky-400/40",
  deep: "border-violet-400/40",
  escalation: "border-orange-400/40",
  surprise: "border-pink-400/40",
  backup: "border-slate-400/40",
  recovery: "border-emerald-400/40",
}

// ─── Component ───────────────────────────────────────────────────────

export function StudioCardTimeline({ layout = "sidebar" }: { layout?: "sidebar" | "horizontal" }) {
  const { cards, cardStates, activeCardId, getCardState, markCard, pinCard } = useRoomCards()
  const { isDirectorOrAbove } = useRoomState()

  const sortedCards = useMemo(
    () => cards.slice().sort((a, b) => a.sort_order - b.sort_order),
    [cards],
  )

  // ── Card action handlers (director+) ─────────────────────────────

  const handleActivateCard = useCallback(
    async (cardId: string) => {
      if (activeCardId) await markCard(activeCardId, "used")
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

  // ── Progress stats ───────────────────────────────────────────────

  const usedCount = cardStates.filter((s) => s.status === "used").length
  const total = sortedCards.length

  if (layout === "horizontal") {
    return (
      <div className="border-b border-border/20 bg-background/50">
        <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto">
          <span className="shrink-0 text-[10px] text-muted-foreground ml-2">
            {usedCount}/{total}
          </span>
          {sortedCards.map((card) => {
            const state = getCardState(card.id)
            const status: RoomCardStatus = state?.status ?? "pending"
            const isActive = card.id === activeCardId
            return (
              <HorizontalCardPill
                key={card.id}
                card={card}
                status={status}
                isActive={isActive}
                isPinned={state?.is_pinned}
                canControl={isDirectorOrAbove}
                onActivate={() => handleActivateCard(card.id)}
                onSkip={() => handleSkipCard(card.id)}
              />
            )
          })}
        </div>
      </div>
    )
  }

  // ── Sidebar layout ───────────────────────────────────────────────

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-border/20 bg-background/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/20 px-3 py-2.5">
        <span className="text-[11px] font-semibold text-muted-foreground">
          البطاقات
        </span>
        <span className="text-[10px] text-muted-foreground/30 font-mono tabular-nums">
          {usedCount}/{total}
        </span>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {sortedCards.map((card) => {
          const state = getCardState(card.id)
          const status: RoomCardStatus = state?.status ?? "pending"
          const isActive = card.id === activeCardId

          return (
            <SidebarCardRow
              key={card.id}
              card={card}
              status={status}
              isActive={isActive}
              isPinned={state?.is_pinned}
              canControl={isDirectorOrAbove}
              onActivate={() => handleActivateCard(card.id)}
              onSkip={() => handleSkipCard(card.id)}
              onMarkUsed={() => handleMarkUsed(card.id)}
              onTogglePin={() => handleTogglePin(card.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── Sidebar card row ────────────────────────────────────────────────

function SidebarCardRow({
  card,
  status,
  isActive,
  isPinned,
  canControl,
  onActivate,
  onSkip,
  onMarkUsed,
  onTogglePin,
}: {
  card: InterviewCardWithMaterials
  status: RoomCardStatus
  isActive: boolean
  isPinned?: boolean
  canControl: boolean
  onActivate: () => void
  onSkip: () => void
  onMarkUsed: () => void
  onTogglePin: () => void
}) {
  return (
    <div
      className={cn(
        "group relative rounded-lg px-2.5 py-2 transition-colors",
        isActive
          ? "bg-primary/10 border border-primary/20"
          : status === "used"
            ? "opacity-50"
            : status === "skipped"
              ? "opacity-30"
              : "hover:bg-muted/10",
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* Status dot */}
        <div
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full border",
            STATUS_DOT[status],
            BUCKET_DOT[card.bucket] ?? "border-border/30",
          )}
        />

        {/* Card info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/30 font-mono">
              {card.sort_order + 1}
            </span>
            <span className={cn(
              "truncate text-xs font-medium",
              status === "skipped" && "line-through",
            )}>
              {card.short_title}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {card.spoken_kuwaiti}
          </p>
        </div>

        {/* Flags */}
        <div className="flex items-center gap-1 shrink-0">
          {isPinned && <Pin className="h-2.5 w-2.5 text-amber-700" />}
          {card.clip_potential && <Sparkles className="h-2.5 w-2.5 text-amber-700/50" />}
        </div>
      </div>

      {/* Action buttons (director+, on hover) */}
      {canControl && status === "pending" && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <ActionBtn onClick={onActivate} title="تفعيل" className="text-primary hover:bg-primary/20">
            <Play className="h-3 w-3" />
          </ActionBtn>
          <ActionBtn onClick={onSkip} title="تخطي" className="text-muted-foreground hover:bg-muted/30">
            <SkipForward className="h-3 w-3" />
          </ActionBtn>
          <ActionBtn onClick={onTogglePin} title="تثبيت" className="text-muted-foreground hover:bg-amber-500/20 hover:text-amber-700">
            <Pin className="h-3 w-3" />
          </ActionBtn>
        </div>
      )}

      {canControl && isActive && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 flex gap-0.5">
          <ActionBtn onClick={onMarkUsed} title="تمّت" className="text-emerald-700 hover:bg-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
          </ActionBtn>
          <ActionBtn onClick={onSkip} title="تخطي" className="text-muted-foreground hover:bg-muted/30">
            <SkipForward className="h-3 w-3" />
          </ActionBtn>
        </div>
      )}
    </div>
  )
}

// ─── Horizontal card pill ────────────────────────────────────────────

function HorizontalCardPill({
  card,
  status,
  isActive,
  isPinned,
  canControl,
  onActivate,
  onSkip,
}: {
  card: InterviewCardWithMaterials
  status: RoomCardStatus
  isActive: boolean
  isPinned?: boolean
  canControl: boolean
  onActivate: () => void
  onSkip: () => void
}) {
  return (
    <button
      onClick={canControl && status === "pending" ? onActivate : undefined}
      className={cn(
        "shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors",
        isActive
          ? "border-primary/30 bg-primary/10 text-foreground"
          : status === "used"
            ? "border-border/10 bg-muted/5 text-muted-foreground"
            : status === "skipped"
              ? "border-border/10 bg-muted/5 text-muted-foreground/30 line-through"
              : "border-border/20 bg-card/30 text-muted-foreground hover:border-border/40",
        canControl && status === "pending" && "cursor-pointer",
      )}
    >
      <div className="flex items-center gap-1.5">
        <div className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
        <span className="truncate max-w-[100px]">{card.short_title}</span>
        {isPinned && <Pin className="h-2.5 w-2.5 text-amber-700" />}
      </div>
    </button>
  )
}

// ─── Action button helper ────────────────────────────────────────────

function ActionBtn({
  onClick,
  title,
  className,
  children,
}: {
  onClick: () => void
  title: string
  className: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={title}
      className={cn("rounded-md p-1 transition-colors", className)}
    >
      {children}
    </button>
  )
}
