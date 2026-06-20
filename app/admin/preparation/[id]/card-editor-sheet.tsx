"use client"

import { useCallback, useRef, useState } from "react"
import {
  X,
  Loader2,
  Save,
  Trash2,
  Plus,
  Film,
  Quote,
  Heart,
  Pin,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  Wand2,
} from "lucide-react"
import type {
  InterviewCardWithMaterials,
  CardMaterial,
  InterviewCardBucket,
  CardMaterialType,
  CardMaterialCredibility,
  CardFollowUp,
  UpdateInterviewCardInput,
  CreateCardMaterialInput,
} from "@/types/collaboration"

// ─── Constants ──────────────────────────────────────────────────────

const BUCKET_META: Record<InterviewCardBucket, { label: string; color: string }> = {
  opening: { label: "افتتاح", color: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
  deep: { label: "عميق", color: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20" },
  escalation: { label: "تصعيد", color: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
  surprise: { label: "مفاجأة", color: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/20" },
  backup: { label: "احتياطي", color: "bg-neutral-500/10 text-neutral-700 border-neutral-500/20" },
  recovery: { label: "إنقاذ", color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
}

const MATERIAL_TYPE_LABELS: Record<CardMaterialType, string> = {
  fact: "حقيقة",
  background: "خلفية",
  quote: "اقتباس",
  statistic: "إحصائية",
  article: "مقال",
  image: "صورة",
  video: "فيديو",
  old_interview: "مقابلة سابقة",
  social_post: "منشور اجتماعي",
  guest_statement: "تصريح الضيف",
  contradiction: "تناقض",
}

const CREDIBILITY_LABELS: Record<CardMaterialCredibility, { label: string; color: string }> = {
  verified: { label: "موثّق", color: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20" },
  strong: { label: "قوي", color: "text-sky-700 bg-sky-500/10 border-sky-500/20" },
  weak: { label: "ضعيف", color: "text-amber-700 bg-amber-500/10 border-amber-500/20" },
  unverified: { label: "غير موثّق", color: "text-neutral-700 bg-neutral-500/10 border-neutral-500/20" },
}

// ─── Props ──────────────────────────────────────────────────────────

interface CardEditorSheetProps {
  card: InterviewCardWithMaterials
  prepId: string
  onClose: () => void
  onCardUpdated: (card: InterviewCardWithMaterials) => void
  onCardDeleted: (id: string) => void
  onCardEnriched?: (card: InterviewCardWithMaterials) => void
}

// ─── Main Component ─────────────────────────────────────────────────

export function CardEditorSheet({
  card,
  prepId,
  onClose,
  onCardUpdated,
  onCardDeleted,
  onCardEnriched,
}: CardEditorSheetProps) {
  const [saving, setSaving] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichError, setEnrichError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["versions", "entries"]),
  )
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)

  // Track active edits — any EditableField, FollowUp, or Material in edit mode
  const dirtyCountRef = useRef(0)
  const markDirty = useCallback(() => { dirtyCountRef.current++ }, [])
  const markClean = useCallback(() => { dirtyCountRef.current = Math.max(0, dirtyCountRef.current - 1) }, [])

  const guardedClose = useCallback(() => {
    if (dirtyCountRef.current > 0) {
      setShowUnsavedWarning(true)
    } else {
      onClose()
    }
  }, [onClose])

  // ─── Section toggle ─────────────────────────────────────────────

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ─── Save field ─────────────────────────────────────────────────

  const saveField = useCallback(
    async (updates: UpdateInterviewCardInput) => {
      setSaving(true)
      try {
        const res = await fetch(`/api/admin/preparation/${prepId}/cards/${card.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
          body: JSON.stringify(updates),
        })
        if (res.ok) {
          const updated = await res.json()
          onCardUpdated({ ...updated, materials: card.materials })
        }
      } catch {
        // silent
      } finally {
        setSaving(false)
      }
    },
    [card.id, card.materials, prepId, onCardUpdated],
  )

  // ─── Delete card ────────────────────────────────────────────────

  const deleteCard = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/preparation/${prepId}/cards/${card.id}`, {
        method: "DELETE",
        headers: { "x-requested-with": "khat" },
      })
      if (res.ok) onCardDeleted(card.id)
    } catch {
      // silent
    } finally {
      setDeleting(false)
    }
  }

  // ─── Enrich single card ──────────────────────────────────────────

  const enrichThisCard = async () => {
    setEnriching(true)
    setEnrichError(null)
    try {
      const res = await fetch(`/api/admin/preparation/${prepId}/cards/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ action: "enrich_one", card_id: card.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "فشل الإثراء")
      }
      // Re-fetch the card to get updated fields
      const cardRes = await fetch(`/api/admin/preparation/${prepId}/cards/${card.id}`)
      if (cardRes.ok) {
        const updated = await cardRes.json()
        const enriched = { ...updated, materials: card.materials }
        onCardUpdated(enriched)
        onCardEnriched?.(enriched)
      }
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "فشل الإثراء")
    } finally {
      setEnriching(false)
    }
  }

  // ─── Material CRUD ──────────────────────────────────────────────

  const addMaterial = async (input: Omit<CreateCardMaterialInput, "card_id">) => {
    try {
      const res = await fetch(
        `/api/admin/preparation/${prepId}/cards/${card.id}/materials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
          body: JSON.stringify({ ...input, card_id: card.id }),
        },
      )
      if (res.ok) {
        const mat = await res.json()
        onCardUpdated({ ...card, materials: [...card.materials, mat] })
      }
    } catch {
      // silent
    }
  }

  const editMaterial = async (materialId: string, updates: { title: string; content: string }) => {
    try {
      const res = await fetch(
        `/api/admin/preparation/${prepId}/cards/${card.id}/materials`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
          body: JSON.stringify({ id: materialId, ...updates }),
        },
      )
      if (res.ok) {
        const updated = await res.json()
        onCardUpdated({
          ...card,
          materials: card.materials.map((m) => (m.id === materialId ? updated : m)),
        })
      }
    } catch {
      // silent
    }
  }

  const deleteMaterial = async (materialId: string) => {
    try {
      const res = await fetch(
        `/api/admin/preparation/${prepId}/cards/${card.id}/materials?id=${materialId}`,
        { method: "DELETE", headers: { "x-requested-with": "khat" } },
      )
      if (res.ok) {
        onCardUpdated({
          ...card,
          materials: card.materials.filter((m) => m.id !== materialId),
        })
      }
    } catch {
      // silent
    }
  }

  const meta = BUCKET_META[card.bucket]

  return (
    <div className="fixed inset-0 z-50 flex justify-start">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={guardedClose} />

      {/* Sheet — slides from right (RTL = start) */}
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden border-e border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${meta.color}`}>
              {meta.label}
            </span>
            <h2 className="text-sm font-bold">{card.short_title}</h2>
            {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Enrich this card */}
            <button
              type="button"
              onClick={enrichThisCard}
              disabled={enriching || saving}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[10px] hover:bg-violet-500/10 hover:text-violet-700 disabled:opacity-40"
              title="إثراء هذه البطاقة"
            >
              {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              إثراء
            </button>
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-border/60 px-2 py-1 text-[10px] hover:bg-muted/40"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={deleteCard}
                  disabled={deleting}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2 py-1 text-[10px] text-white"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  تأكيد الحذف
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={guardedClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Enrich feedback */}
        {enrichError && (
          <div className="mx-5 mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-700">
            <AlertTriangle className="mb-0.5 inline h-3 w-3" /> {enrichError}
          </div>
        )}

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {/* ─── Versions ──────────────────────────────────── */}
          <EditorSection
            title="نسخ السؤال"
            sectionKey="versions"
            open={openSections.has("versions")}
            onToggle={toggleSection}
          >
            <EditableField
              label="الكويتي (الأساسي)"
              value={card.spoken_kuwaiti}
              onSave={(v) => saveField({ spoken_kuwaiti: v })}
              multiline
              required
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="الفصحى"
              value={card.formal_version}
              onSave={(v) => saveField({ formal_version: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="نسخة مختصرة"
              value={card.shorter_version}
              onSave={(v) => saveField({ shorter_version: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="نسخة أعمق"
              value={card.deeper_version}
              onSave={(v) => saveField({ deeper_version: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="نسخة ناعمة"
              value={card.softer_version}
              onSave={(v) => saveField({ softer_version: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
          </EditorSection>

          {/* ─── Entries ───────────────────────────────────── */}
          <EditorSection
            title="مداخل الطرح"
            sectionKey="entries"
            open={openSections.has("entries")}
            onToggle={toggleSection}
          >
            <EditableField
              label="مدخل ناعم"
              value={card.entry_soft}
              onSave={(v) => saveField({ entry_soft: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="مدخل مباشر"
              value={card.entry_direct}
              onSave={(v) => saveField({ entry_direct: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="مدخل عاطفي"
              value={card.entry_emotional}
              onSave={(v) => saveField({ entry_emotional: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="مدخل استفزازي"
              value={card.entry_provocative}
              onSave={(v) => saveField({ entry_provocative: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="جملة الانتقال"
              value={card.transition_out}
              onSave={(v) => saveField({ transition_out: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
          </EditorSection>

          {/* ─── Follow-ups ────────────────────────────────── */}
          <EditorSection
            title={`متابعات (${card.follow_ups?.length || 0})`}
            sectionKey="followups"
            open={openSections.has("followups")}
            onToggle={toggleSection}
          >
            <FollowUpsEditor
              followUps={card.follow_ups || []}
              onSave={(fus) => saveField({ follow_ups: fus })}
            />
          </EditorSection>

          {/* ─── Guidance ──────────────────────────────────── */}
          <EditorSection
            title="إرشادات المضيف"
            sectionKey="guidance"
            open={openSections.has("guidance")}
            onToggle={toggleSection}
          >
            <EditableField
              label="لماذا هذا مهم"
              value={card.why_this_matters}
              onSave={(v) => saveField({ why_this_matters: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="النبرة العاطفية"
              value={card.emotional_tone}
              onSave={(v) => saveField({ emotional_tone: v || null })}
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="متى يُطرح"
              value={card.when_to_ask}
              onSave={(v) => saveField({ when_to_ask: v || null })}
            />
            <EditableField
              label="كيف يُطرح"
              value={card.how_to_ask}
              onSave={(v) => saveField({ how_to_ask: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="إذا تهرّب الضيف"
              value={card.if_guest_avoids}
              onSave={(v) => saveField({ if_guest_avoids: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="إذا تأثر الضيف"
              value={card.if_guest_emotional}
              onSave={(v) => saveField({ if_guest_emotional: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="إذا كان الجواب ضعيف"
              value={card.if_answer_weak}
              onSave={(v) => saveField({ if_answer_weak: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
            <EditableField
              label="ملاحظة حساسية"
              value={card.sensitivity_note}
              onSave={(v) => saveField({ sensitivity_note: v || null })}
              multiline
              onEditStart={markDirty}
              onEditEnd={markClean}
            />
          </EditorSection>

          {/* ─── Materials ─────────────────────────────────── */}
          <EditorSection
            title={`مواد داعمة (${card.materials.length})`}
            sectionKey="materials"
            open={openSections.has("materials")}
            onToggle={toggleSection}
          >
            <MaterialsEditor
              materials={card.materials}
              onAdd={addMaterial}
              onDelete={deleteMaterial}
              onEdit={editMaterial}
            />
          </EditorSection>

          {/* ─── Flags ─────────────────────────────────────── */}
          <EditorSection
            title="علامات المحتوى"
            sectionKey="flags"
            open={openSections.has("flags")}
            onToggle={toggleSection}
          >
            <div className="space-y-2">
              <FlagToggle
                icon={Film}
                label="إمكانية كليب"
                value={card.clip_potential}
                color="text-fuchsia-700"
                onToggle={(v) => saveField({ clip_potential: v })}
              />
              <FlagToggle
                icon={Quote}
                label="إمكانية اقتباس"
                value={card.quote_potential}
                color="text-indigo-700"
                onToggle={(v) => saveField({ quote_potential: v })}
              />
              <FlagToggle
                icon={Heart}
                label="قمة عاطفية"
                value={card.emotional_peak}
                color="text-rose-700"
                onToggle={(v) => saveField({ emotional_peak: v })}
              />
              <FlagToggle
                icon={Pin}
                label="مثبّتة"
                value={card.is_pinned}
                color="text-amber-700"
                onToggle={(v) => saveField({ is_pinned: v })}
              />
              {/* Bucket selector */}
              <div className="pt-2">
                <div className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
                  نوع البطاقة
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(BUCKET_META) as InterviewCardBucket[]).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => saveField({ bucket: b })}
                      className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                        card.bucket === b
                          ? BUCKET_META[b].color + " font-medium"
                          : "border-border/40 text-muted-foreground hover:border-border"
                      }`}
                    >
                      {BUCKET_META[b].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </EditorSection>

          {/* Meta info */}
          <div className="rounded-lg border border-border/20 bg-background/20 p-3 text-[10px] text-muted-foreground">
            <div>ID: {card.id}</div>
            <div>القسم: {card.section_label}</div>
            <div>المصدر: {card.source_question_id || "يدوي"}</div>
            <div>AI: {card.ai_generated ? "نعم" : "لا"}</div>
          </div>
        </div>
      </div>

      {/* Unsaved changes warning */}
      {showUnsavedWarning && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4 shadow-2xl">
            <p className="mb-3 text-sm font-medium">توجد تعديلات غير محفوظة</p>
            <p className="mb-4 text-[11px] text-muted-foreground">
              إذا أغلقت الآن ستفقد التعديلات الحالية.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUnsavedWarning(false)}
                className="rounded-lg border border-border/60 px-3 py-1.5 text-[11px] hover:bg-muted/40"
              >
                العودة للتحرير
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-rose-500"
              >
                إغلاق بدون حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Collapsible Section ───────────────────────────────────────────

function EditorSection({
  title,
  sectionKey,
  open,
  onToggle,
  children,
}: {
  title: string
  sectionKey: string
  open: boolean
  onToggle: (key: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-background/30">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="flex w-full items-center justify-between p-3 text-start"
      >
        <span className="text-[12px] font-semibold">{title}</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && <div className="space-y-2 border-t border-border/20 p-3">{children}</div>}
    </div>
  )
}

// ─── Editable Field ────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onSave,
  multiline = false,
  required = false,
  onEditStart,
  onEditEnd,
}: {
  label: string
  value: string | null
  onSave: (value: string) => void
  multiline?: boolean
  required?: boolean
  onEditStart?: () => void
  onEditEnd?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || "")

  const startEditing = () => {
    setDraft(value || "")
    setEditing(true)
    onEditStart?.()
  }

  const save = () => {
    if (required && !draft.trim()) return
    onSave(draft.trim())
    setEditing(false)
    onEditEnd?.()
  }

  const cancel = () => {
    setDraft(value || "")
    setEditing(false)
    onEditEnd?.()
  }

  if (editing) {
    return (
      <div>
        <div className="mb-1 text-[10px] font-semibold text-muted-foreground">{label}</div>
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            autoFocus
            className="w-full rounded-lg border border-violet-500/40 bg-background px-3 py-2 text-[12px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        ) : (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-violet-500/40 bg-background px-3 py-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        )}
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={save}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-violet-700 hover:bg-violet-500/10"
          >
            <Save className="h-2.5 w-2.5" /> حفظ
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/40"
          >
            إلغاء
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="block w-full rounded-lg p-2 text-start hover:bg-muted/20"
    >
      <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground">{label}</div>
      {value ? (
        <p className="text-[12px] leading-relaxed">{value}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">اضغط لإضافة...</p>
      )}
    </button>
  )
}

// ─── Follow-ups Editor ─────────────────────────────────────────────

function FollowUpsEditor({
  followUps,
  onSave,
}: {
  followUps: CardFollowUp[]
  onSave: (fus: CardFollowUp[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState("")
  const [newTrigger, setNewTrigger] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editTrigger, setEditTrigger] = useState("")

  const addFollowUp = () => {
    if (!newText.trim()) return
    const updated = [
      ...followUps,
      {
        id: `fu-manual-${Date.now()}`,
        text: newText.trim(),
        trigger_condition: newTrigger.trim() || undefined,
      },
    ]
    onSave(updated)
    setNewText("")
    setNewTrigger("")
    setAdding(false)
  }

  const removeFollowUp = (id: string) => {
    onSave(followUps.filter((f) => f.id !== id))
  }

  const startEdit = (fu: CardFollowUp) => {
    setEditingId(fu.id)
    setEditText(fu.text)
    setEditTrigger(fu.trigger_condition || "")
  }

  const saveEdit = () => {
    if (!editText.trim() || !editingId) return
    onSave(
      followUps.map((f) =>
        f.id === editingId
          ? { ...f, text: editText.trim(), trigger_condition: editTrigger.trim() || undefined }
          : f,
      ),
    )
    setEditingId(null)
  }

  return (
    <div className="space-y-2">
      {followUps.map((fu) => (
        <div key={fu.id} className="rounded-lg border border-border/20 bg-card/30 p-2.5">
          {editingId === fu.id ? (
            <div className="space-y-1.5">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={2}
                autoFocus
                className="w-full rounded border border-violet-500/40 bg-background px-2 py-1.5 text-[11px]"
              />
              <input
                type="text"
                value={editTrigger}
                onChange={(e) => setEditTrigger(e.target.value)}
                placeholder="شرط التفعيل (اختياري)"
                className="w-full rounded border border-border/40 bg-background px-2 py-1 text-[10px]"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={saveEdit}
                  className="rounded px-2 py-0.5 text-[10px] text-violet-700 hover:bg-violet-500/10"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/40"
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => startEdit(fu)}
                className="flex-1 text-start"
              >
                <p className="text-[11px] leading-relaxed">{fu.text}</p>
                {fu.trigger_condition && (
                  <p className="mt-0.5 text-[9px] text-muted-foreground">
                    شرط: {fu.trigger_condition}
                  </p>
                )}
              </button>
              <button
                type="button"
                onClick={() => removeFollowUp(fu.id)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-rose-700"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className="space-y-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={2}
            placeholder="نص المتابعة..."
            autoFocus
            className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-[11px]"
          />
          <input
            type="text"
            value={newTrigger}
            onChange={(e) => setNewTrigger(e.target.value)}
            placeholder="شرط التفعيل (اختياري)"
            className="w-full rounded border border-border/40 bg-background px-2 py-1 text-[10px]"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={addFollowUp}
              disabled={!newText.trim()}
              className="rounded px-2 py-0.5 text-[10px] text-violet-700 hover:bg-violet-500/10 disabled:opacity-40"
            >
              إضافة
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/40"
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border/40 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:border-violet-500/40 hover:text-violet-700"
        >
          <Plus className="h-3 w-3" /> إضافة متابعة
        </button>
      )}
    </div>
  )
}

// ─── Materials Editor ──────────────────────────────────────────────

function MaterialsEditor({
  materials,
  onAdd,
  onDelete,
  onEdit,
}: {
  materials: CardMaterial[]
  onAdd: (input: Omit<CreateCardMaterialInput, "card_id">) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onEdit: (id: string, updates: { title: string; content: string }) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [newType, setNewType] = useState<CardMaterialType>("fact")
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [newSourceUrl, setNewSourceUrl] = useState("")
  const [newSourceName, setNewSourceName] = useState("")
  const [newCredibility, setNewCredibility] = useState<CardMaterialCredibility>("unverified")
  const [savingNew, setSavingNew] = useState(false)

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    setSavingNew(true)
    await onAdd({
      type: newType,
      title: newTitle.trim(),
      content: newContent.trim(),
      source_url: newSourceUrl.trim() || undefined,
      source_name: newSourceName.trim() || undefined,
      credibility: newCredibility,
    })
    setNewTitle("")
    setNewContent("")
    setNewSourceUrl("")
    setNewSourceName("")
    setAdding(false)
    setSavingNew(false)
  }

  // Separate manual and AI materials
  const manualMaterials = materials.filter((m) => !m.ai_generated)
  const aiMaterials = materials.filter((m) => m.ai_generated)

  return (
    <div className="space-y-2">
      {/* Manual materials */}
      {manualMaterials.length > 0 && (
        <div>
          <div className="mb-1.5 text-[9px] font-semibold uppercase text-violet-700/60">
            يدوية
          </div>
          {manualMaterials.map((m) => (
            <MaterialItem key={m.id} material={m} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </div>
      )}

      {/* AI materials */}
      {aiMaterials.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase text-sky-700/60">
            <Sparkles className="h-2.5 w-2.5" /> مُولّدة بالذكاء الاصطناعي
          </div>
          {aiMaterials.map((m) => (
            <MaterialItem key={m.id} material={m} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </div>
      )}

      {materials.length === 0 && !adding && (
        <p className="text-[11px] text-muted-foreground">لا توجد مواد داعمة</p>
      )}

      {/* Add form */}
      {adding ? (
        <div className="space-y-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
          <div className="text-[11px] font-semibold">إضافة مادة يدوية</div>

          {/* Type */}
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">النوع</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as CardMaterialType)}
              className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-[11px]"
            >
              {(Object.keys(MATERIAL_TYPE_LABELS) as CardMaterialType[]).map((t) => (
                <option key={t} value={t}>{MATERIAL_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">العنوان</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-[11px]"
            />
          </div>

          {/* Content */}
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">المحتوى</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={2}
              className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-[11px]"
            />
          </div>

          {/* Source */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">المصدر</label>
              <input
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                placeholder="اسم المصدر"
                className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-[10px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">الرابط</label>
              <input
                type="text"
                value={newSourceUrl}
                onChange={(e) => setNewSourceUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-[10px]"
              />
            </div>
          </div>

          {/* Credibility */}
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">الموثوقية</label>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(CREDIBILITY_LABELS) as CardMaterialCredibility[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewCredibility(c)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                    newCredibility === c
                      ? CREDIBILITY_LABELS[c].color + " font-medium"
                      : "border-border/40 text-muted-foreground"
                  }`}
                >
                  {CREDIBILITY_LABELS[c].label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 pt-1">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newTitle.trim() || !newContent.trim() || savingNew}
              className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-500/10 disabled:opacity-40"
            >
              {savingNew ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
              إضافة
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/40"
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border/40 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:border-violet-500/40 hover:text-violet-700"
        >
          <Plus className="h-3 w-3" /> إضافة مادة يدوية
        </button>
      )}
    </div>
  )
}

// ─── Material Item ─────────────────────────────────────────────────

function MaterialItem({
  material,
  onDelete,
  onEdit,
}: {
  material: CardMaterial
  onDelete: (id: string) => Promise<void>
  onEdit: (id: string, updates: { title: string; content: string }) => Promise<void>
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(material.title)
  const [editContent, setEditContent] = useState(material.content)
  const [savingEdit, setSavingEdit] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete(material.id)
    setDeleting(false)
  }

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || !editContent.trim()) return
    setSavingEdit(true)
    await onEdit(material.id, { title: editTitle.trim(), content: editContent.trim() })
    setEditing(false)
    setSavingEdit(false)
  }

  const startEdit = () => {
    setEditTitle(material.title)
    setEditContent(material.content)
    setEditing(true)
  }

  const typeLabel = MATERIAL_TYPE_LABELS[material.type] || material.type
  const credLabel = CREDIBILITY_LABELS[material.credibility]

  if (editing) {
    return (
      <div className="mb-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground">
            {typeLabel}
          </span>
        </div>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="mb-1.5 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-[11px] font-medium"
          autoFocus
        />
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={2}
          className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-[10px]"
        />
        <div className="mt-1.5 flex items-center gap-1">
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={!editTitle.trim() || !editContent.trim() || savingEdit}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-violet-700 hover:bg-violet-500/10 disabled:opacity-40"
          >
            {savingEdit ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
            حفظ
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/40"
          >
            إلغاء
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-1.5 rounded-lg border border-border/20 bg-card/30 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={startEdit} className="flex-1 text-start">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {typeLabel}
            </span>
            {credLabel && (
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${credLabel.color}`}>
                {credLabel.label}
              </span>
            )}
          </div>
          <div className="text-[11px] font-medium">{material.title}</div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            {material.content}
          </p>
          {material.source_name && (
            <p className="mt-1 text-[9px] text-muted-foreground">
              {material.source_name}
              {material.source_url && " — "}
              {material.source_url && (
                <a
                  href={material.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-700/60 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  رابط
                </a>
              )}
            </p>
          )}
        </button>

        {/* Delete */}
        <div className="shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded px-1.5 py-0.5 text-[9px] text-rose-700 hover:bg-rose-500/10"
              >
                {deleting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "حذف"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted/40"
              >
                لا
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1 text-muted-foreground/30 hover:text-rose-700"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Flag Toggle ───────────────────────────────────────────────────

function FlagToggle({
  icon: Icon,
  label,
  value,
  color,
  onToggle,
}: {
  icon: React.ElementType
  label: string
  value: boolean
  color: string
  onToggle: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!value)}
      className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
        value
          ? "border-violet-500/30 bg-violet-500/5"
          : "border-border/20 bg-transparent hover:border-border/40"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${value ? color : "text-muted-foreground"}`} />
      <span className={`text-[11px] ${value ? "font-medium" : "text-muted-foreground"}`}>
        {label}
      </span>
      <div className="mr-auto" />
      <div
        className={`h-4 w-7 rounded-full transition-colors ${
          value ? "bg-violet-500" : "bg-muted/40"
        }`}
      >
        <div
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? "-translate-x-3" : "translate-x-0"
          }`}
        />
      </div>
    </button>
  )
}
