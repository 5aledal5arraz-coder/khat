"use client"

/**
 * StudioCardDisplay — rich hero card for the active question.
 *
 * Large typography optimized for filming. Shows the main question prominently
 * with optional guidance, entries, follow-ups, and materials in collapsible sections.
 */

import { useState } from "react"
import type { InterviewCardWithMaterials, RoomCardNote } from "@/types/collaboration"
import { cn } from "@/lib/utils"
import {
  Sparkles,
  Quote,
  Flame,
  AlertTriangle,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Pin,
  FileText,
} from "lucide-react"

// ─── Bucket badge (reused) ──────────────────────────────────────────

const BUCKET_STYLES: Record<string, string> = {
  opening: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  deep: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  escalation: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  surprise: "bg-pink-500/10 text-pink-300 border-pink-500/20",
  backup: "bg-slate-500/10 text-slate-300 border-slate-500/20",
  recovery: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
}

const BUCKET_LABELS: Record<string, string> = {
  opening: "افتتاح",
  deep: "عميق",
  escalation: "تصعيد",
  surprise: "مفاجأة",
  backup: "احتياطي",
  recovery: "استعادة",
}

// ─── Component ───────────────────────────────────────────────────────

export function StudioCardDisplay({
  card,
  notes = [],
  showGuidance = false,
  showMaterials = false,
}: {
  card: InterviewCardWithMaterials
  notes?: RoomCardNote[]
  showGuidance?: boolean
  showMaterials?: boolean
}) {
  const urgentNotes = notes.filter((n) => n.note_type === "urgent" && !n.resolved_at)

  return (
    <div className="space-y-5">
      {/* Top bar: bucket + section + content flags */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
            BUCKET_STYLES[card.bucket] ?? BUCKET_STYLES.backup,
          )}
        >
          {BUCKET_LABELS[card.bucket] ?? card.bucket}
        </span>
        <span className="text-xs text-muted-foreground/50">{card.section_label}</span>
        <span className="text-xs text-muted-foreground/40">#{card.sort_order + 1}</span>

        <div className="flex items-center gap-2 mr-auto">
          {card.clip_potential && (
            <span title="محتوى مقطع" className="flex items-center gap-1 text-amber-400/70">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
          )}
          {card.quote_potential && (
            <span title="اقتباس" className="flex items-center gap-1 text-violet-400/70">
              <Quote className="h-3.5 w-3.5" />
            </span>
          )}
          {card.emotional_peak && (
            <span title="ذروة عاطفية" className="flex items-center gap-1 text-red-400/70">
              <Flame className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <h2 className="text-sm font-medium text-muted-foreground/70">{card.short_title}</h2>

      {/* Hero question — spoken_kuwaiti */}
      <p className="text-3xl font-bold leading-relaxed lg:text-4xl">
        {card.spoken_kuwaiti}
      </p>

      {/* Emotional tone */}
      {card.emotional_tone && (
        <p className="text-sm text-muted-foreground/60 italic">
          {card.emotional_tone}
        </p>
      )}

      {/* Alt question versions */}
      <AltVersions card={card} />

      {/* Urgent notes (always shown, prominent) */}
      {urgentNotes.length > 0 && (
        <div className="space-y-2">
          {urgentNotes.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{n.content}</span>
            </div>
          ))}
        </div>
      )}

      {/* Host guidance sections */}
      {showGuidance && <GuidanceSection card={card} />}

      {/* Materials */}
      {showMaterials && card.materials.length > 0 && (
        <MaterialsSection materials={card.materials} />
      )}
    </div>
  )
}

// ─── Alt versions ────────────────────────────────────────────────────

function AltVersions({ card }: { card: InterviewCardWithMaterials }) {
  const versions = [
    { label: "فصحى", text: card.formal_version },
    { label: "أقصر", text: card.shorter_version },
    { label: "أعمق", text: card.deeper_version },
    { label: "ألطف", text: card.softer_version },
  ].filter((v) => v.text)

  if (versions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border/20 pt-3">
      {versions.map((v) => (
        <p key={v.label} className="text-sm text-muted-foreground/60">
          <span className="ml-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/50">
            {v.label}
          </span>
          {v.text}
        </p>
      ))}
    </div>
  )
}

// ─── Guidance section ────────────────────────────────────────────────

function GuidanceSection({ card }: { card: InterviewCardWithMaterials }) {
  const [expanded, setExpanded] = useState(true)

  const hasGuidance = card.how_to_ask || card.when_to_ask || card.if_guest_avoids || card.if_guest_emotional || card.if_answer_weak || card.sensitivity_note || card.why_this_matters
  const hasEntries = card.entry_soft || card.entry_direct || card.entry_emotional || card.entry_provocative
  const hasFollowUps = card.follow_ups.length > 0
  const hasTransition = card.transition_out

  if (!hasGuidance && !hasEntries && !hasFollowUps && !hasTransition) return null

  return (
    <div className="border-t border-border/20 pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/40"
      >
        <FileText className="h-3 w-3" />
        إرشادات المقدّم
        {expanded ? <ChevronUp className="h-3 w-3 mr-auto" /> : <ChevronDown className="h-3 w-3 mr-auto" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {/* How / When / Why */}
          {hasGuidance && (
            <div className="space-y-2">
              {card.why_this_matters && <GRow label="لماذا هذا مهم" value={card.why_this_matters} />}
              {card.how_to_ask && <GRow label="كيف تسأل" value={card.how_to_ask} />}
              {card.when_to_ask && <GRow label="متى تسأل" value={card.when_to_ask} />}
              {card.if_guest_avoids && <GRow label="إذا تجنب الضيف" value={card.if_guest_avoids} warn />}
              {card.if_guest_emotional && <GRow label="إذا تأثر الضيف" value={card.if_guest_emotional} />}
              {card.if_answer_weak && <GRow label="إذا كان الرد ضعيفاً" value={card.if_answer_weak} />}
              {card.sensitivity_note && <GRow label="تنبيه حساسية" value={card.sensitivity_note} warn />}
            </div>
          )}

          {/* Entry styles */}
          {hasEntries && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                مداخل
              </span>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {card.entry_soft && <EntryPill label="ناعم" value={card.entry_soft} />}
                {card.entry_direct && <EntryPill label="مباشر" value={card.entry_direct} />}
                {card.entry_emotional && <EntryPill label="عاطفي" value={card.entry_emotional} />}
                {card.entry_provocative && <EntryPill label="استفزازي" value={card.entry_provocative} />}
              </div>
            </div>
          )}

          {/* Follow-ups */}
          {hasFollowUps && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                متابعات
              </span>
              {card.follow_ups.map((f) => (
                <div key={f.id} className="rounded-lg bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                  <span>• {f.text}</span>
                  {f.trigger_condition && (
                    <span className="mr-1 text-[10px] text-muted-foreground/40">
                      ({f.trigger_condition})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Transition out */}
          {hasTransition && (
            <div className="rounded-lg border border-border/20 bg-muted/5 px-3 py-2">
              <span className="text-[10px] font-semibold text-muted-foreground/40 ml-2">خروج</span>
              <span className="text-sm text-muted-foreground">{card.transition_out}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("text-sm leading-relaxed", warn ? "text-amber-300/80" : "text-muted-foreground/80")}>
      <span className="text-[10px] font-semibold ml-2 text-muted-foreground/40">{label}</span>
      {value}
    </div>
  )
}

function EntryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/10 px-3 py-2 text-sm text-muted-foreground/70">
      <span className="ml-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium">{label}</span>
      {value}
    </div>
  )
}

// ─── Materials section ───────────────────────────────────────────────

function MaterialsSection({ materials }: { materials: InterviewCardWithMaterials["materials"] }) {
  const [expanded, setExpanded] = useState(false)
  const pinned = materials.filter((m) => m.is_pinned)
  const rest = materials.filter((m) => !m.is_pinned)
  const sorted = [...pinned, ...rest]

  return (
    <div className="border-t border-border/20 pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/40"
      >
        <MessageCircle className="h-3 w-3" />
        مواد داعمة ({materials.length})
        {expanded ? <ChevronUp className="h-3 w-3 mr-auto" /> : <ChevronDown className="h-3 w-3 mr-auto" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
          {sorted.map((m) => (
            <div key={m.id} className="rounded-lg bg-muted/10 px-3 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/60">
                  {m.type}
                </span>
                <span className="font-medium">{m.title}</span>
                {m.is_pinned && <Pin className="h-2.5 w-2.5 text-amber-400" />}
                {m.credibility === "verified" && (
                  <span className="text-[9px] text-emerald-400">✓ موثق</span>
                )}
              </div>
              <p className="mt-1.5 text-muted-foreground/70 leading-relaxed">{m.content}</p>
              {m.source_name && (
                <p className="mt-1 text-[10px] text-muted-foreground/40">
                  المصدر: {m.source_name}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
