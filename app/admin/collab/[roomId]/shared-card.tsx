"use client"

/**
 * Shared card rendering components used by all room views.
 *
 * - ActiveCard: the full hero card display (spoken_kuwaiti prominent)
 * - CompactCard: one-line card item for queue/list views
 * - CardBucketBadge: colored bucket label
 * - CardMaterialsList: materials list for a card
 */

import { cn } from "@/lib/utils"
import type {
  InterviewCardWithMaterials,
  InterviewCardBucket,
  RoomCardStatus,
  CardMaterial,
  RoomCardNote,
} from "@/types/collaboration"
import {
  MessageCircle,
  Sparkles,
  Flame,
  FileText,
  AlertTriangle,
  CheckCircle2,
  SkipForward,
  Pin,
} from "lucide-react"

// ─── Bucket badge ────────────────────────────────────────────────────

const BUCKET_STYLES: Record<InterviewCardBucket, string> = {
  opening: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  deep: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  escalation: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  surprise: "bg-pink-500/10 text-pink-300 border-pink-500/20",
  backup: "bg-slate-500/10 text-slate-300 border-slate-500/20",
  recovery: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
}

const BUCKET_LABELS: Record<InterviewCardBucket, string> = {
  opening: "افتتاح",
  deep: "عميق",
  escalation: "تصعيد",
  surprise: "مفاجأة",
  backup: "احتياطي",
  recovery: "استعادة",
}

export function CardBucketBadge({ bucket }: { bucket: InterviewCardBucket }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        BUCKET_STYLES[bucket],
      )}
    >
      {BUCKET_LABELS[bucket]}
    </span>
  )
}

// ─── Card status indicator ───────────────────────────────────────────

const STATUS_ICONS: Record<RoomCardStatus, typeof CheckCircle2> = {
  pending: FileText,
  active: Flame,
  used: CheckCircle2,
  skipped: SkipForward,
}

const STATUS_COLORS: Record<RoomCardStatus, string> = {
  pending: "text-muted-foreground/50",
  active: "text-amber-400",
  used: "text-emerald-400",
  skipped: "text-muted-foreground/40",
}

export function CardStatusIcon({ status }: { status: RoomCardStatus }) {
  const Icon = STATUS_ICONS[status]
  return <Icon className={cn("h-4 w-4", STATUS_COLORS[status])} />
}

// ─── Active card (hero display) ──────────────────────────────────────

export function ActiveCard({
  card,
  notes,
  showGuidance = false,
  showMaterials = false,
}: {
  card: InterviewCardWithMaterials
  notes?: RoomCardNote[]
  showGuidance?: boolean
  showMaterials?: boolean
}) {
  const urgentNotes = notes?.filter((n) => n.note_type === "urgent" && !n.resolved_at) ?? []
  const regularNotes = notes?.filter((n) => n.note_type !== "urgent" && !n.resolved_at) ?? []

  return (
    <div className="space-y-4">
      {/* Bucket + title */}
      <div className="flex items-center gap-2">
        <CardBucketBadge bucket={card.bucket} />
        <span className="text-xs text-muted-foreground">{card.section_label}</span>
        {card.clip_potential && <span title="محتوى مقطع"><Sparkles className="h-3.5 w-3.5 text-amber-400" /></span>}
      </div>

      {/* Hero: spoken_kuwaiti */}
      <p className="text-xl font-bold leading-relaxed">{card.spoken_kuwaiti}</p>

      {/* Alt versions (compact) */}
      {card.formal_version && (
        <p className="text-sm text-muted-foreground/80">
          <span className="text-[10px] font-semibold text-muted-foreground/50 ml-1.5">فصحى</span>
          {card.formal_version}
        </p>
      )}

      {/* Urgent notes from team (always shown) */}
      {urgentNotes.length > 0 && (
        <div className="space-y-1.5">
          {urgentNotes.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{n.content}</span>
            </div>
          ))}
        </div>
      )}

      {/* Regular team notes */}
      {regularNotes.length > 0 && (
        <div className="space-y-1">
          {regularNotes.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground"
            >
              <MessageCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{n.content}</span>
            </div>
          ))}
        </div>
      )}

      {/* Host guidance (host view only) */}
      {showGuidance && (
        <div className="space-y-2 border-t border-border/30 pt-3">
          {card.how_to_ask && (
            <GuidanceRow label="كيف تسأل" value={card.how_to_ask} />
          )}
          {card.when_to_ask && (
            <GuidanceRow label="متى تسأل" value={card.when_to_ask} />
          )}
          {card.if_guest_avoids && (
            <GuidanceRow label="إذا تجنب الضيف" value={card.if_guest_avoids} warn />
          )}
          {card.if_guest_emotional && (
            <GuidanceRow label="إذا تأثر الضيف" value={card.if_guest_emotional} />
          )}
          {card.if_answer_weak && (
            <GuidanceRow label="إذا كان الرد ضعيفاً" value={card.if_answer_weak} />
          )}
          {card.emotional_tone && (
            <GuidanceRow label="النبرة" value={card.emotional_tone} />
          )}
          {card.sensitivity_note && (
            <GuidanceRow label="تنبيه حساسية" value={card.sensitivity_note} warn />
          )}
        </div>
      )}

      {/* Entry styles (host view only) */}
      {showGuidance && (card.entry_soft || card.entry_direct) && (
        <div className="space-y-1.5 border-t border-border/30 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            مداخل
          </span>
          {card.entry_soft && <EntryRow label="ناعم" value={card.entry_soft} />}
          {card.entry_direct && <EntryRow label="مباشر" value={card.entry_direct} />}
          {card.entry_emotional && <EntryRow label="عاطفي" value={card.entry_emotional} />}
          {card.entry_provocative && <EntryRow label="استفزازي" value={card.entry_provocative} />}
        </div>
      )}

      {/* Follow-ups (host view) */}
      {showGuidance && card.follow_ups.length > 0 && (
        <div className="space-y-1 border-t border-border/30 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            متابعات
          </span>
          {card.follow_ups.map((f) => (
            <div key={f.id} className="text-sm text-muted-foreground">
              <span>• {f.text}</span>
              {f.trigger_condition && (
                <span className="mr-1 text-[10px] text-muted-foreground/50">
                  ({f.trigger_condition})
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Materials */}
      {showMaterials && card.materials.length > 0 && (
        <div className="border-t border-border/30 pt-3">
          <CardMaterialsList materials={card.materials} />
        </div>
      )}
    </div>
  )
}

// ─── Guidance row ────────────────────────────────────────────────────

function GuidanceRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("text-sm", warn ? "text-amber-300/90" : "text-muted-foreground")}>
      <span className="text-[10px] font-semibold ml-1.5 text-muted-foreground/50">{label}</span>
      {value}
    </div>
  )
}

function EntryRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm text-muted-foreground/80">
      <span className="ml-1 rounded bg-muted/50 px-1 text-[10px] font-medium">{label}</span>
      {value}
    </p>
  )
}

// ─── Materials list ──────────────────────────────────────────────────

export function CardMaterialsList({ materials }: { materials: CardMaterial[] }) {
  if (materials.length === 0) return null

  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        مواد ({materials.length})
      </span>
      {materials.map((m) => (
        <div
          key={m.id}
          className="rounded-md bg-muted/20 px-3 py-2 text-xs"
        >
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-muted/50 px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
              {m.type}
            </span>
            <span className="font-medium">{m.title}</span>
            {m.is_pinned && <Pin className="h-2.5 w-2.5 text-amber-400" />}
          </div>
          <p className="mt-1 text-muted-foreground line-clamp-3">{m.content}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Compact card (queue/list item) ──────────────────────────────────

export function CompactCard({
  card,
  status,
  isPinned,
  isActive,
  onClick,
}: {
  card: InterviewCardWithMaterials
  status: RoomCardStatus
  isPinned?: boolean
  isActive?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors",
        isActive
          ? "border-primary/40 bg-primary/5"
          : status === "used"
            ? "border-border/20 bg-muted/10 opacity-60"
            : status === "skipped"
              ? "border-border/20 bg-muted/10 opacity-40 line-through"
              : "border-border/30 bg-card/30 hover:border-border/50",
        onClick && "cursor-pointer",
      )}
    >
      <CardStatusIcon status={status} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{card.short_title}</span>
          <CardBucketBadge bucket={card.bucket} />
          {isPinned && <Pin className="h-3 w-3 text-amber-400" />}
          {card.clip_potential && <Sparkles className="h-3 w-3 text-amber-400/60" />}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.spoken_kuwaiti}</p>
      </div>
    </button>
  )
}
