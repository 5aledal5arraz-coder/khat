"use client"

/**
 * «بنك الأسئلة» — the per-question editor.
 *
 * Replaces the «أسئلة لا بد منها» textarea, which flattened the must-ask
 * questions to lines and re-attached their metadata and fact cards BY
 * POSITION on save (so a line inserted at #2 moved every later question's
 * cards onto the wrong text). Here every control addresses one question by its
 * id, through the same pure transforms the server action runs
 * (lib/preparation/v2/question-edit.ts) — the optimistic view and the stored
 * payload cannot diverge.
 *
 * Grouped by the prep's own sections, in order: a course shows its module
 * titles, a story its arc labels. Order inside a section is the conversation
 * order.
 *
 * Each question locks only itself while its save is in flight — never the
 * whole editor. The whole editor locks while «إعادة توليد الإعداد» runs
 * (prep-regen-signal.ts), because that write replaces generated questions.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronDown,
  ChevronUp,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Lightbulb,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/use-toast"
import { runAction } from "@/app/admin/components/run-action"
import { KitCard } from "@/app/admin/components/ui-kit"
import { formatArabicCount } from "@/lib/shared/formatters"
import { sectionLabelAr } from "@/lib/preparation/v2/format"
import {
  addQuestion,
  classifyTextChange,
  deleteQuestion,
  editQuestion,
  moveQuestion,
  newManualQuestionId,
  questionCardCounts,
  questionEditContext,
  questionOrigin,
  reorderQuestion,
  QUESTION_NOTE_MAX,
  QUESTION_TEXT_MAX,
  type QuestionEditPatch,
} from "@/lib/preparation/v2/question-edit"
import type {
  PrepV2Payload,
  PrepV2Question,
  QuestionPriority,
  SectionKind,
} from "@/lib/preparation/v2/types"
import {
  addPrepQuestionAction,
  deletePrepQuestionAction,
  editPrepQuestionAction,
  movePrepQuestionAction,
  reorderPrepQuestionAction,
  type PrepEditResult,
} from "./prep-actions"
import { usePrepRegenerating } from "./prep-regen-signal"

type Bank = PrepV2Question[]

const PRIORITY_LABEL: Record<QuestionPriority, string> = {
  must_ask: "أساسي",
  if_time: "إن سمح الوقت",
}

/** Touch-size on phones, the admin's denser rows from `sm:` up (house pattern). */
const TAP = "min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8"

export function PrepQuestionBankEditor({
  prepId,
  eirId,
  payload,
}: {
  prepId: string
  eirId: string
  payload: PrepV2Payload
}) {
  const router = useRouter()
  const regenerating = usePrepRegenerating(eirId)
  const [bank, setBank] = useState<Bank>(payload.question_bank ?? [])
  const serverBank = useRef<Bank>(payload.question_bank ?? [])
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [filter, setFilter] = useState<"all" | "must">("all")
  const [adding, setAdding] = useState<SectionKind | null>(null)

  // Resync when the server re-renders with the committed payload (state
  // adjusted during render — React's documented alternative to an effect).
  const [seenPayload, setSeenPayload] = useState(payload)
  if (seenPayload !== payload) {
    setSeenPayload(payload)
    setBank(payload.question_bank ?? [])
  }
  useEffect(() => {
    serverBank.current = payload.question_bank ?? []
  }, [payload])

  const ctx = useMemo(() => questionEditContext(payload), [payload])
  const sections = useMemo(() => payload.episode_sections ?? [], [payload])
  const labelOf = useCallback((k: SectionKind) => sectionLabelAr(k, sections), [sections])

  /**
   * Apply the pure transform locally, then persist. `key` locks just the
   * question(s) involved. A refusal reverts to the last server state and
   * re-reads it (another editor may have changed the prep).
   */
  const run = useCallback(
    (
      key: string,
      local: (b: Bank) => Bank | null,
      action: () => Promise<PrepEditResult>,
      after?: (r: PrepEditResult) => void,
    ) => {
      setBank((b) => local(b) ?? b)
      setPending((p) => new Set(p).add(key))
      void (async () => {
        const outcome = await runAction(action)
        const r: PrepEditResult = outcome.ok ? outcome.data : { ok: false, message: outcome.message }
        setPending((p) => {
          const n = new Set(p)
          n.delete(key)
          return n
        })
        if (!r.ok) {
          setBank(serverBank.current)
          toast({
            title: "ما انحفظ التعديل",
            description: r.current ? `${r.message}\nالنص الحالي: «${r.current}»` : r.message,
            variant: "error",
          })
        }
        after?.(r)
        router.refresh()
      })()
    },
    [router],
  )

  const locked = regenerating
  const known = new Set(sections.map((s) => s.kind))
  const orphans = bank.filter((q) => !known.has(q.section))
  const mustCount = bank.filter((q) => q.priority === "must_ask").length

  const filterControl = (
    <div role="radiogroup" aria-label="عرض الأسئلة" className="inline-flex shrink-0 rounded-lg border border-border bg-background p-0.5">
      {(
        [
          ["all", `الكل (${bank.length})`],
          ["must", `الأساسية فقط (${mustCount})`],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={filter === k}
          onClick={() => setFilter(k)}
          className={cn(
            "min-h-[44px] rounded-md px-2.5 text-[12px] sm:min-h-8",
            filter === k ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const renderGroup = (kind: SectionKind | null, title: string, questions: Bank) => {
    const shown = filter === "must" ? questions.filter((q) => q.priority === "must_ask") : questions
    return (
      <section
        key={kind ?? "orphans"}
        className="rounded-xl border border-border/60 bg-background/40 p-3"
        data-question-section={kind ?? "orphans"}
      >
        <h3 className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[13px] font-semibold text-foreground">
          <span>{title}</span>
          <span className="text-[12px] font-normal text-muted-foreground">
            {formatArabicCount(questions.length, "سؤال")}
          </span>
        </h3>
        {shown.length === 0 ? (
          <p className="py-1 text-[12px] text-muted-foreground">
            {questions.length === 0 ? "ما فيه أسئلة في هذا القسم." : "ما فيه أسئلة أساسية في هذا القسم."}
          </p>
        ) : (
          <ol className="space-y-2">
            {shown.map((q) => {
              const pos = questions.indexOf(q)
              return (
                <QuestionRow
                  key={q.id}
                  q={q}
                  isFirst={pos === 0}
                  isLast={pos === questions.length - 1}
                  reorderable={filter === "all"}
                  sections={sections.map((s) => ({ kind: s.kind, label: labelOf(s.kind) }))}
                  disabled={locked || pending.has(q.id)}
                  saving={pending.has(q.id)}
                  onEdit={(patch, onDone) =>
                    run(
                      q.id,
                      (b) => {
                        const r = editQuestion(b, q.id, patch)
                        return r.changed ? r.bank : null
                      },
                      () => editPrepQuestionAction(prepId, q.id, patch, q.text),
                      onDone,
                    )
                  }
                  onMove={(to) =>
                    run(
                      q.id,
                      (b) => {
                        const r = moveQuestion(b, q.id, to, null, ctx)
                        return r.changed ? r.bank : null
                      },
                      () => movePrepQuestionAction(prepId, q.id, to, null),
                    )
                  }
                  onReorder={(dir) =>
                    run(
                      q.id,
                      (b) => {
                        const r = reorderQuestion(b, q.id, dir)
                        return r.changed ? r.bank : null
                      },
                      () => reorderPrepQuestionAction(prepId, q.id, dir),
                    )
                  }
                  onDelete={() =>
                    run(
                      q.id,
                      (b) => {
                        const r = deleteQuestion(b, q.id)
                        return r.changed ? r.bank : null
                      },
                      () => deletePrepQuestionAction(prepId, q.id, q.text),
                    )
                  }
                />
              )
            })}
          </ol>
        )}
        {kind &&
          (adding === kind ? (
            <AddQuestionForm
              disabled={locked}
              onCancel={() => setAdding(null)}
              onAdd={(text, priority) => {
                const id = newManualQuestionId()
                setAdding(null)
                run(
                  id,
                  (b) => {
                    const r = addQuestion(b, kind, null, { id, text, priority }, ctx)
                    return r.changed ? r.bank : null
                  },
                  () => addPrepQuestionAction(prepId, kind, null, { id, text, priority }),
                )
              }}
            />
          ) : (
            <button
              type="button"
              disabled={locked}
              onClick={() => setAdding(kind)}
              className="mt-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-[12.5px] text-primary hover:bg-primary/5 disabled:opacity-50 sm:min-h-8"
              data-add-question={kind}
            >
              <Plus className="h-3.5 w-3.5" /> سؤال في هذا القسم
            </button>
          ))}
      </section>
    )
  }

  return (
    <KitCard
      title="بنك الأسئلة"
      subtitle="كل سؤال يتعدّل في مكانه، وبطاقاته تبقى معه. الترتيب داخل القسم هو ترتيب الحوار."
      icon={ListChecks}
      action={filterControl}
      className="[&>header]:flex-wrap"
    >
      <div data-prep-question-editor className="space-y-3">
        {regenerating && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12.5px] text-amber-800"
          >
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            جارٍ إعادة توليد الإعداد — التعديل موقوف حتى ينتهي. الأسئلة اللي أضفتوها تنتقل للإعداد الجديد.
          </div>
        )}
        {sections.map((s) =>
          renderGroup(
            s.kind,
            labelOf(s.kind),
            bank.filter((q) => q.section === s.kind),
          ),
        )}
        {orphans.length > 0 && renderGroup(null, "خارج أقسام الإعداد — انقلها لقسم", orphans)}
      </div>
    </KitCard>
  )
}

// ─── One question ─────────────────────────────────────────────────────

function QuestionRow({
  q,
  isFirst,
  isLast,
  reorderable,
  sections,
  disabled,
  saving,
  onEdit,
  onMove,
  onReorder,
  onDelete,
}: {
  q: PrepV2Question
  isFirst: boolean
  isLast: boolean
  reorderable: boolean
  sections: { kind: SectionKind; label: string }[]
  disabled: boolean
  saving: boolean
  onEdit: (patch: QuestionEditPatch, onDone?: (r: PrepEditResult) => void) => void
  onMove: (to: SectionKind) => void
  onReorder: (dir: "up" | "down") => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(q.text)
  const [warn, setWarn] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [purpose, setPurpose] = useState(q.purpose)
  const [followUp, setFollowUp] = useState(q.follow_up_prompt)
  const cards = questionCardCounts(q)
  const origin = questionOrigin(q)
  const selectId = useId()
  const notesId = useId()

  // Follow the stored values when they change underneath (a save landed, or
  // someone else edited) — adjusted during render, not in an effect.
  const [seen, setSeen] = useState({ text: q.text, purpose: q.purpose, follow: q.follow_up_prompt })
  if (seen.text !== q.text || seen.purpose !== q.purpose || seen.follow !== q.follow_up_prompt) {
    setSeen({ text: q.text, purpose: q.purpose, follow: q.follow_up_prompt })
    if (!editing) setDraft(q.text)
    setPurpose(q.purpose)
    setFollowUp(q.follow_up_prompt)
  }

  const stopEditing = () => {
    setEditing(false)
    setWarn(false)
    setDraft(q.text)
  }

  const save = () => {
    setWarn(false)
    setEditing(false)
    onEdit({ text: draft })
  }

  /** Enter / blur: save — unless the edit would un-approve cards, then ask first. */
  const commit = () => {
    if (warn) return
    const kind = classifyTextChange(q.text, draft)
    if (!draft.trim()) return stopEditing()
    if (kind === "none") return stopEditing()
    if (kind === "words" && cards.approvedGenerated > 0) {
      setWarn(true)
      return
    }
    save()
  }

  const notesDirty = purpose !== q.purpose || followUp !== q.follow_up_prompt

  return (
    <li
      className={cn(
        "rounded-lg border border-border/60 bg-card p-2.5",
        saving && "opacity-70",
      )}
      data-question-id={q.id}
    >
      {/* Text */}
      {editing ? (
        <div>
          <label htmlFor={`${selectId}-text`} className="sr-only">
            نص السؤال
          </label>
          <textarea
            id={`${selectId}-text`}
            autoFocus
            rows={Math.min(6, Math.max(2, Math.ceil(draft.length / 60)))}
            maxLength={QUESTION_TEXT_MAX}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setWarn(false)
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                stopEditing()
              } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                commit()
              }
            }}
            onBlur={commit}
            className="w-full resize-y rounded-lg border border-primary/50 bg-background p-2 text-[13.5px] leading-relaxed text-foreground focus:outline-none"
          />
          <p className="mt-1 text-[11.5px] text-muted-foreground">Enter للحفظ · Esc للتراجع · Shift+Enter لسطر جديد</p>
          {warn && (
            <div role="alert" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[12.5px] text-amber-800">
              تغيير نص السؤال يرجّع {formatArabicCount(cards.approvedGenerated, "بطاقة معتمدة")} للمراجعة (البطاقات اليدوية تبقى معتمدة).
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={save}
                  className={cn(TAP, "rounded-lg bg-amber-600 px-3 text-[12.5px] font-medium text-white")}
                >
                  احفظ وأرجعها للمراجعة
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={stopEditing}
                  className={cn(TAP, "rounded-lg border border-border px-3 text-[12.5px] text-foreground")}
                >
                  تراجع
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDraft(q.text)
            setEditing(true)
          }}
          className="group flex min-h-[44px] w-full items-start gap-2 rounded-md py-2.5 text-start text-[13.5px] leading-relaxed text-foreground hover:bg-muted/40 disabled:cursor-not-allowed"
          aria-label={`تعديل السؤال: ${q.text}`}
        >
          <span className="flex-1 whitespace-pre-wrap break-words">{q.text}</span>
          <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" aria-hidden />
        </button>
      )}

      {/* Controls */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={q.priority === "must_ask"}
          title="بدّل بين «أساسي» و«إن سمح الوقت»"
          onClick={() => onEdit({ priority: q.priority === "must_ask" ? "if_time" : "must_ask" })}
          className={cn(
            TAP,
            "rounded-full border px-3 text-[12px] font-medium disabled:opacity-50",
            q.priority === "must_ask"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground",
          )}
        >
          {PRIORITY_LABEL[q.priority]}
        </button>

        <label htmlFor={selectId} className="sr-only">
          القسم
        </label>
        <select
          id={selectId}
          value={q.section}
          disabled={disabled}
          onChange={(e) => onMove(e.target.value as SectionKind)}
          className="min-h-[44px] max-w-[11rem] rounded-lg border border-border bg-background px-2 text-[12px] text-foreground disabled:opacity-50 sm:min-h-8"
        >
          {!sections.some((s) => s.kind === q.section) && <option value={q.section}>— اختر قسماً —</option>}
          {sections.map((s) => (
            <option key={s.kind} value={s.kind}>
              {s.label}
            </option>
          ))}
        </select>

        {reorderable && (
          <>
            <button
              type="button"
              disabled={disabled || isFirst}
              onClick={() => onReorder("up")}
              aria-label="قدّم السؤال"
              className={cn(TAP, "inline-flex items-center justify-center rounded-lg border border-border text-foreground disabled:opacity-40")}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || isLast}
              onClick={() => onReorder("down")}
              aria-label="أخّر السؤال"
              className={cn(TAP, "inline-flex items-center justify-center rounded-lg border border-border text-foreground disabled:opacity-40")}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </>
        )}

        {cards.total > 0 && (
          <a
            href={`#insight-q-${q.id}`}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-teal-500/10 px-2.5 text-[12px] text-teal-800 hover:bg-teal-500/20 sm:min-h-8"
            title="افتح بطاقات هذا السؤال في المراجعة"
          >
            <Lightbulb className="h-3.5 w-3.5" />
            {formatArabicCount(cards.total, "بطاقة")}
            {cards.approved > 0 && <span className="text-teal-700">· {cards.approved} معتمدة</span>}
          </a>
        )}
        {origin !== "generated" && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">
            {origin === "guest" ? "من الضيف" : "أضافه الفريق"}
          </span>
        )}
        {saving && <span className="text-[11.5px] text-muted-foreground">يحفظ…</span>}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setConfirmDelete(true)}
          aria-label="حذف السؤال"
          className={cn(TAP, "ms-auto inline-flex items-center justify-center rounded-lg text-rose-700 hover:bg-rose-500/10 disabled:opacity-40")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {confirmDelete && (
        <div role="alert" className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-2 text-[12.5px] text-rose-800">
          {cards.total > 0
            ? `حذف السؤال يحذف معه ${formatArabicCount(cards.total, "بطاقة إسناد")}${cards.approved ? ` (منها ${cards.approved} معتمدة)` : ""}.`
            : "حذف هذا السؤال؟"}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setConfirmDelete(false)
                onDelete()
              }}
              className={cn(TAP, "rounded-lg bg-rose-700 px-3 text-[12.5px] font-medium text-white disabled:opacity-50")}
            >
              احذف
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className={cn(TAP, "rounded-lg border border-border px-3 text-[12.5px] text-foreground")}
            >
              تراجع
            </button>
          </div>
        </div>
      )}

      {/* Purpose / follow-up */}
      <button
        type="button"
        aria-expanded={notesOpen}
        aria-controls={notesId}
        onClick={() => setNotesOpen((v) => !v)}
        className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground sm:min-h-7"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", notesOpen && "rotate-180")} />
        الهدف والمتابعة
      </button>
      {notesOpen && (
        <div id={notesId} className="mt-1 space-y-2">
          <label className="block text-[12px] text-muted-foreground">
            الهدف من السؤال
            <textarea
              rows={2}
              maxLength={QUESTION_NOTE_MAX}
              value={purpose}
              disabled={disabled}
              onChange={(e) => setPurpose(e.target.value)}
              className="mt-1 w-full resize-y rounded-lg border border-border bg-background p-2 text-[12.5px] text-foreground"
            />
          </label>
          <label className="block text-[12px] text-muted-foreground">
            سؤال المتابعة
            <textarea
              rows={2}
              maxLength={QUESTION_NOTE_MAX}
              value={followUp}
              disabled={disabled}
              onChange={(e) => setFollowUp(e.target.value)}
              className="mt-1 w-full resize-y rounded-lg border border-border bg-background p-2 text-[12.5px] text-foreground"
            />
          </label>
          <button
            type="button"
            disabled={disabled || !notesDirty}
            onClick={() => onEdit({ purpose, follow_up_prompt: followUp })}
            className={cn(TAP, "rounded-lg border border-primary/40 bg-primary/10 px-3 text-[12.5px] font-medium text-primary disabled:opacity-50")}
          >
            حفظ الهدف والمتابعة
          </button>
        </div>
      )}
    </li>
  )
}

// ─── «+ سؤال في هذا القسم» ────────────────────────────────────────────

function AddQuestionForm({
  disabled,
  onAdd,
  onCancel,
}: {
  disabled: boolean
  onAdd: (text: string, priority: QuestionPriority) => void
  onCancel: () => void
}) {
  const [text, setText] = useState("")
  const [priority, setPriority] = useState<QuestionPriority>("must_ask")
  const id = useId()
  const submit = () => {
    if (!text.trim() || disabled) return
    onAdd(text, priority)
  }
  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
      <label htmlFor={id} className="mb-1 block text-[12px] text-muted-foreground">
        السؤال الجديد
      </label>
      <textarea
        id={id}
        autoFocus
        rows={2}
        maxLength={QUESTION_TEXT_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel()
          else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        className="w-full resize-y rounded-lg border border-border bg-background p-2 text-[13.5px] text-foreground"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="الأولوية" className="inline-flex rounded-lg border border-border bg-background p-0.5">
          {(["must_ask", "if_time"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={priority === p}
              onClick={() => setPriority(p)}
              className={cn(
                "min-h-[44px] rounded-md px-2.5 text-[12px] sm:min-h-8",
                priority === p ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled || !text.trim()}
          onClick={submit}
          className={cn(TAP, "rounded-lg bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50")}
        >
          إضافة
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={cn(TAP, "rounded-lg border border-border px-3 text-[12.5px] text-foreground")}
        >
          إلغاء
        </button>
      </div>
    </div>
  )
}
