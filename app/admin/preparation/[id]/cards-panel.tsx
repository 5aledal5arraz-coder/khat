"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Loader2,
  Sparkles,
  Plus,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Film,
  Quote,
  Heart,
  Pin,
  GripVertical,
  BookOpen,
  RotateCcw,
  AlertTriangle,
  Check,
  Wand2,
  Package,
  Layers,
} from "lucide-react"
import type { EpisodePreparation } from "@/types/preparation"
import type {
  InterviewCardWithMaterials,
  InterviewCardBucket,
  CreateInterviewCardInput,
} from "@/types/collaboration"
import { CardEditorSheet } from "./card-editor-sheet"

// ─── Bucket metadata ────────────────────────────────────────────────

const BUCKET_META: Record<InterviewCardBucket, { label: string; color: string }> = {
  opening: { label: "افتتاح", color: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
  deep: { label: "عميق", color: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20" },
  escalation: { label: "تصعيد", color: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
  surprise: { label: "مفاجأة", color: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/20" },
  backup: { label: "احتياطي", color: "bg-neutral-500/10 text-neutral-700 border-neutral-500/20" },
  recovery: { label: "إنقاذ", color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
}

// ─── Types ──────────────────────────────────────────────────────────

interface CardsPanelProps {
  prep: EpisodePreparation
}

type ActionStatus = null | "loading" | "success" | "error"

interface ActionState {
  action: string | null
  status: ActionStatus
  message: string | null
}

// ─── Main Component ─────────────────────────────────────────────────

export function CardsPanel({ prep }: CardsPanelProps) {
  const [cards, setCards] = useState<InterviewCardWithMaterials[]>([])
  const [loading, setLoading] = useState(true)
  const [actionState, setActionState] = useState<ActionState>({
    action: null,
    status: null,
    message: null,
  })
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [editingCard, setEditingCard] = useState<InterviewCardWithMaterials | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [filter, setFilter] = useState<InterviewCardBucket | "all">("all")

  // ─── Data fetching ──────────────────────────────────────────────

  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/preparation/${prep.id}/cards`)
      if (res.ok) {
        const data = await res.json()
        setCards(data)
        // Auto-expand all sections on first load
        const sectionIds = new Set<string>(data.map((c: InterviewCardWithMaterials) => c.section_id))
        setExpandedSections(sectionIds)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [prep.id])

  useEffect(() => {
    fetchCards()
  }, [fetchCards])

  // ─── Actions ────────────────────────────────────────────────────

  const runAction = async (
    action: string,
    body: Record<string, unknown>,
    successMsg: string,
  ) => {
    setActionState({ action, status: "loading", message: null })
    try {
      const res = await fetch(`/api/admin/preparation/${prep.id}/cards/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "فشل العملية")

      // Check if skipped
      if (data.skipped_reason) {
        setActionState({ action, status: "success", message: data.skipped_reason })
      } else {
        setActionState({ action, status: "success", message: successMsg })
      }
      await fetchCards()
    } catch (err) {
      setActionState({
        action,
        status: "error",
        message: err instanceof Error ? err.message : "فشل العملية",
      })
    }
  }

  const generateCards = () => runAction("generate", { action: "generate" }, "تم إنشاء البطاقات")

  const regenerateCards = () => {
    setConfirmRegenerate(false)
    runAction("generate", { action: "generate", force: true }, "تم إعادة توليد البطاقات")
  }

  const enrichAll = () => runAction("enrich", { action: "enrich" }, "تم إثراء جميع البطاقات")

  const populateMaterials = () =>
    runAction("materials", { action: "materials" }, "تم ربط المواد البحثية")

  const runFullPipeline = () =>
    runAction("full", { action: "full" }, "تم التوليد والإثراء وربط المواد")

  // ─── Reorder ────────────────────────────────────────────────────

  const moveCard = async (cardId: string, direction: "up" | "down") => {
    // Find the card and its neighbors
    const sorted = [...cards].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex((c) => c.id === cardId)
    if (idx === -1) return
    if (direction === "up" && idx === 0) return
    if (direction === "down" && idx === sorted.length - 1) return

    const newIdx = direction === "up" ? idx - 1 : idx + 1
    const reordered = [...sorted]
    const [moved] = reordered.splice(idx, 1)
    reordered.splice(newIdx, 0, moved)

    // Optimistic update
    const updatedCards = reordered.map((c, i) => ({ ...c, sort_order: i }))
    setCards(updatedCards)

    // Persist
    try {
      await fetch(`/api/admin/preparation/${prep.id}/cards/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ ordered_ids: reordered.map((c) => c.id) }),
      })
    } catch {
      // Revert on error
      await fetchCards()
    }
  }

  // ─── Create manual card ─────────────────────────────────────────

  const createCard = async (input: {
    section_id: string
    section_label: string
    bucket: InterviewCardBucket
    short_title: string
    spoken_kuwaiti: string
  }) => {
    const body: CreateInterviewCardInput = {
      preparation_id: prep.id,
      ...input,
    }
    try {
      const res = await fetch(`/api/admin/preparation/${prep.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setShowCreateDialog(false)
        await fetchCards()
      }
    } catch {
      // silent
    }
  }

  // ─── Card updated callback ─────────────────────────────────────

  const onCardUpdated = useCallback(
    (updated: InterviewCardWithMaterials) => {
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setEditingCard(updated)
    },
    [],
  )

  const onCardDeleted = useCallback(
    (id: string) => {
      setCards((prev) => prev.filter((c) => c.id !== id))
      setEditingCard(null)
    },
    [],
  )

  // ─── Group cards by section ─────────────────────────────────────

  const grouped = cards
    .filter((c) => filter === "all" || c.bucket === filter)
    .sort((a, b) => a.sort_order - b.sort_order)
    .reduce<Record<string, { label: string; cards: InterviewCardWithMaterials[] }>>(
      (acc, card) => {
        if (!acc[card.section_id]) {
          acc[card.section_id] = { label: card.section_label, cards: [] }
        }
        acc[card.section_id].cards.push(card)
        return acc
      },
      {},
    )

  const totalCards = cards.length
  const enrichedCount = cards.filter((c) => c.formal_version).length
  const materialsCount = cards.reduce((sum, c) => sum + c.materials.length, 0)

  const hasQuestionSystem = !!prep.question_system

  // ─── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-violet-700" />
            <h2 className="text-sm font-bold">بطاقات المقابلة</h2>
            {totalCards > 0 && (
              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-700">
                {totalCards} بطاقة
              </span>
            )}
            {enrichedCount > 0 && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700">
                {enrichedCount} مُثراة
              </span>
            )}
            {materialsCount > 0 && (
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-700">
                {materialsCount} مادة
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] hover:bg-muted/40"
            >
              <Plus className="h-3 w-3" />
              إضافة يدوية
            </button>

            {totalCards === 0 ? (
              <button
                type="button"
                onClick={generateCards}
                disabled={!hasQuestionSystem || actionState.status === "loading"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
              >
                {actionState.action === "generate" && actionState.status === "loading" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                توليد البطاقات
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => (confirmRegenerate ? regenerateCards() : setConfirmRegenerate(true))}
                  disabled={!hasQuestionSystem || actionState.status === "loading"}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] disabled:opacity-40 ${
                    confirmRegenerate
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-700"
                      : "border-border/60 hover:bg-muted/40"
                  }`}
                >
                  {actionState.action === "generate" && actionState.status === "loading" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  {confirmRegenerate ? "تأكيد إعادة التوليد" : "إعادة توليد"}
                </button>
                <button
                  type="button"
                  onClick={enrichAll}
                  disabled={actionState.status === "loading"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] hover:bg-muted/40 disabled:opacity-40"
                >
                  {actionState.action === "enrich" && actionState.status === "loading" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wand2 className="h-3 w-3" />
                  )}
                  إثراء الكل
                </button>
                <button
                  type="button"
                  onClick={populateMaterials}
                  disabled={actionState.status === "loading"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] hover:bg-muted/40 disabled:opacity-40"
                >
                  {actionState.action === "materials" && actionState.status === "loading" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Package className="h-3 w-3" />
                  )}
                  مواد بحثية
                </button>
                <button
                  type="button"
                  onClick={runFullPipeline}
                  disabled={!hasQuestionSystem || actionState.status === "loading"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
                >
                  {actionState.action === "full" && actionState.status === "loading" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  توليد كامل
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status message */}
        {actionState.message && (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${
              actionState.status === "error"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-700"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
            }`}
          >
            {actionState.status === "error" ? (
              <AlertTriangle className="mb-0.5 inline h-3 w-3" />
            ) : (
              <Check className="mb-0.5 inline h-3 w-3" />
            )}{" "}
            {actionState.message}
          </div>
        )}
      </div>

      {/* Empty state */}
      {totalCards === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-border/40 bg-card/30 p-8 text-center">
          <Layers className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">لا توجد بطاقات بعد</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasQuestionSystem
              ? "اضغط \"توليد البطاقات\" لإنشاء بطاقات من نظام الأسئلة"
              : "يجب توليد نظام الأسئلة أولاً من تبويب \"الأسئلة\""}
          </p>
        </div>
      )}

      {/* Bucket filter */}
      {totalCards > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            الكل ({totalCards})
          </FilterChip>
          {(Object.keys(BUCKET_META) as InterviewCardBucket[]).map((b) => {
            const count = cards.filter((c) => c.bucket === b).length
            if (count === 0) return null
            return (
              <FilterChip key={b} active={filter === b} onClick={() => setFilter(b)}>
                {BUCKET_META[b].label} ({count})
              </FilterChip>
            )
          })}
        </div>
      )}

      {/* Grouped card list */}
      {Object.entries(grouped).map(([sectionId, section]) => {
        const open = expandedSections.has(sectionId)
        return (
          <div key={sectionId} className="rounded-xl border border-border/40 bg-background/40">
            <button
              type="button"
              onClick={() => {
                setExpandedSections((prev) => {
                  const next = new Set(prev)
                  if (next.has(sectionId)) next.delete(sectionId)
                  else next.add(sectionId)
                  return next
                })
              }}
              className="flex w-full items-center justify-between gap-3 p-4 text-start"
            >
              <div className="flex items-center gap-2">
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <h4 className="text-sm font-semibold">{section.label}</h4>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {section.cards.length} بطاقة
              </span>
            </button>

            {open && (
              <div className="space-y-1.5 border-t border-border/40 p-3">
                {section.cards.map((card, idx) => (
                  <CardRow
                    key={card.id}
                    card={card}
                    isFirst={idx === 0}
                    isLast={idx === section.cards.length - 1}
                    onEdit={() => setEditingCard(card)}
                    onMoveUp={() => moveCard(card.id, "up")}
                    onMoveDown={() => moveCard(card.id, "down")}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Card editor side sheet */}
      {editingCard && (
        <CardEditorSheet
          card={editingCard}
          prepId={prep.id}
          onClose={() => setEditingCard(null)}
          onCardUpdated={onCardUpdated}
          onCardDeleted={onCardDeleted}
          onCardEnriched={onCardUpdated}
        />
      )}

      {/* Create card dialog */}
      {showCreateDialog && (
        <CreateCardDialog
          prepId={prep.id}
          existingSections={[
            ...new Map(cards.map((c) => [c.section_id, c.section_label])).entries(),
          ].map(([id, label]) => ({ id, label }))}
          onClose={() => setShowCreateDialog(false)}
          onCreate={createCard}
        />
      )}
    </div>
  )
}

// ─── Card Completeness ───────────────────────────────────────��─────

/** Count how many key fields are filled. Returns { filled, total, label, color }. */
function getCardCompleteness(card: InterviewCardWithMaterials) {
  const checks = [
    !!card.spoken_kuwaiti,
    !!card.formal_version,
    !!card.shorter_version,
    !!card.entry_soft || !!card.entry_direct,
    (card.follow_ups?.length || 0) > 0,
    !!card.when_to_ask || !!card.how_to_ask,
    !!card.if_guest_avoids,
    card.materials.length > 0,
  ]
  const filled = checks.filter(Boolean).length
  const total = checks.length
  const ratio = filled / total

  if (ratio >= 1) return { filled, total, label: "مكتملة", color: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20" }
  if (ratio >= 0.5) return { filled, total, label: "جزئية", color: "text-amber-700 bg-amber-500/10 border-amber-500/20" }
  return { filled, total, label: "ناقصة", color: "text-rose-700 bg-rose-500/10 border-rose-500/20" }
}

// ─── Card Row ──────────────────────────────────────────────────────

function CardRow({
  card,
  isFirst,
  isLast,
  onEdit,
  onMoveUp,
  onMoveDown,
}: {
  card: InterviewCardWithMaterials
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const meta = BUCKET_META[card.bucket]
  const completeness = getCardCompleteness(card)
  const followUpCount = card.follow_ups?.length || 0
  const materialsCount = card.materials.length

  return (
    <div className="group flex items-start gap-2 rounded-lg border border-border/30 bg-card/50 p-3 hover:border-violet-500/30">
      {/* Reorder controls */}
      <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveUp() }}
          disabled={isFirst}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:invisible"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <GripVertical className="h-3 w-3 text-muted-foreground/30" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveDown() }}
          disabled={isLast}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:invisible"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Main content — clickable */}
      <button
        type="button"
        onClick={onEdit}
        className="flex-1 text-start"
      >
        {/* Top row: bucket + title + flags */}
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${meta.color}`}>
            {meta.label}
          </span>
          <span className="text-[12px] font-semibold">{card.short_title}</span>
          {card.is_pinned && <Pin className="h-3 w-3 text-amber-700" />}
        </div>

        {/* Spoken preview */}
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {card.spoken_kuwaiti}
        </p>

        {/* Bottom row: flags + counts */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {card.clip_potential && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-fuchsia-700">
              <Film className="h-2.5 w-2.5" /> كليب
            </span>
          )}
          {card.quote_potential && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-indigo-700">
              <Quote className="h-2.5 w-2.5" /> اقتباس
            </span>
          )}
          {card.emotional_peak && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-rose-700">
              <Heart className="h-2.5 w-2.5" /> قمة عاطفية
            </span>
          )}
          {followUpCount > 0 && (
            <span className="text-[9px] text-muted-foreground">
              {followUpCount} متابعة
            </span>
          )}
          {materialsCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-sky-700">
              <BookOpen className="h-2.5 w-2.5" /> {materialsCount} مادة
            </span>
          )}
          <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] ${completeness.color}`}>
            {completeness.filled}/{completeness.total} {completeness.label}
          </span>
        </div>
      </button>
    </div>
  )
}

// ─── Filter Chip ───────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
        active
          ? "border-violet-500 bg-violet-500/15 text-violet-700"
          : "border-border/60 bg-background text-muted-foreground hover:border-violet-500/40"
      }`}
    >
      {children}
    </button>
  )
}

// ─── Create Card Dialog ────────────────────────────────────────────

function CreateCardDialog({
  existingSections,
  onClose,
  onCreate,
}: {
  prepId: string
  existingSections: { id: string; label: string }[]
  onClose: () => void
  onCreate: (input: {
    section_id: string
    section_label: string
    bucket: InterviewCardBucket
    short_title: string
    spoken_kuwaiti: string
  }) => Promise<void>
}) {
  const [sectionId, setSectionId] = useState(existingSections[0]?.id || "custom")
  const [sectionLabel, setSectionLabel] = useState(existingSections[0]?.label || "")
  const [bucket, setBucket] = useState<InterviewCardBucket>("deep")
  const [shortTitle, setShortTitle] = useState("")
  const [spokenKuwaiti, setSpokenKuwaiti] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!shortTitle.trim() || !spokenKuwaiti.trim()) return
    setSaving(true)
    const label = sectionId === "custom" ? sectionLabel.trim() || "بطاقات يدوية" : sectionLabel
    // Deterministic section_id: slugify the label for consistency
    const id = sectionId === "custom"
      ? `manual-${label.replace(/\s+/g, "-").replace(/[^\u0600-\u06FF\w-]/g, "").slice(0, 40)}`
      : sectionId
    await onCreate({
      section_id: id,
      section_label: label,
      bucket,
      short_title: shortTitle.trim(),
      spoken_kuwaiti: spokenKuwaiti.trim(),
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <h3 className="mb-4 text-sm font-bold">إضافة بطاقة يدوية</h3>

        <div className="space-y-3">
          {/* Section selection */}
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">القسم</label>
            <select
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value)
                const match = existingSections.find((s) => s.id === e.target.value)
                if (match) setSectionLabel(match.label)
              }}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            >
              {existingSections.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
              <option value="custom">قسم جديد...</option>
            </select>
          </div>

          {sectionId === "custom" && (
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">اسم القسم</label>
              <input
                type="text"
                value={sectionLabel}
                onChange={(e) => setSectionLabel(e.target.value)}
                placeholder="مثلاً: أسئلة إضافية"
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

          {/* Bucket */}
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">النوع</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(BUCKET_META) as InterviewCardBucket[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBucket(b)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    bucket === b
                      ? BUCKET_META[b].color + " font-medium"
                      : "border-border/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  {BUCKET_META[b].label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">العنوان المختصر</label>
            <input
              type="text"
              value={shortTitle}
              onChange={(e) => setShortTitle(e.target.value)}
              placeholder="مثلاً: بداية الشغف"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Spoken */}
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">السؤال بالكويتي</label>
            <textarea
              value={spokenKuwaiti}
              onChange={(e) => setSpokenKuwaiti(e.target.value)}
              rows={3}
              placeholder="السؤال كما سيقوله المضيف..."
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border/60 px-3 py-1.5 text-[11px] hover:bg-muted/40"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!shortTitle.trim() || !spokenKuwaiti.trim() || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            إضافة
          </button>
        </div>
      </div>
    </div>
  )
}
