"use client"

/**
 * UX-5.1 — Lightweight inline editor for the high-traffic prep_v2
 * fields. Each row is a textarea + Save/Cancel pair; saves go through
 * `updatePrepFieldAction`, which performs a partial JSONB merge.
 *
 * This editor intentionally does NOT rebuild the legacy preparation
 * page. The full Prep V2 read-only viewer (`PrepV2View`) renders below
 * for reference; the operator edits the high-traffic fields here and
 * jumps to the full page for advanced edits.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Loader2, Check, X, Save } from "lucide-react"
import { toast } from "@/lib/use-toast"
import { runAction } from "@/app/admin/components/run-action"
import type { PrepV2Payload } from "@/lib/preparation/v2/types"
import {
  updatePrepFieldAction,
  type PrepEditField,
  type PrepEditResult,
} from "./prep-actions"

type FieldKey = PrepEditField["field"]

interface FieldDef {
  field: FieldKey
  label: string
  helper?: string
  rows: number
  /** Read the textarea-friendly representation from the payload. */
  read: (p: PrepV2Payload) => string
}

const FIELDS: FieldDef[] = [
  {
    field: "thesis",
    label: "الفرضية الأساسية",
    helper: "الجملة المركزية التي تقود الحلقة كلها.",
    rows: 3,
    read: (p) => p.thesis ?? "",
  },
  {
    field: "axes_of_tension",
    label: "محاور التوتر",
    helper: "محور لكل سطر — تفضيل ٦ محاور.",
    rows: 6,
    read: (p) => (p.axes_of_tension ?? []).join("\n"),
  },
  {
    field: "opening_options.0.text",
    label: "افتتاحية الحلقة",
    helper: "النص المقترح لافتتاح الحلقة.",
    rows: 4,
    read: (p) => p.opening_options?.[0]?.text ?? "",
  },
  {
    field: "sensitive_zones",
    label: "المناطق الحساسة",
    helper: "موضوع لكل سطر — يحذر منه أو يتعامل معه بحذر.",
    rows: 4,
    read: (p) => (p.sensitive_zones ?? []).join("\n"),
  },
  {
    field: "must_ask_questions",
    label: "أسئلة لا بد منها",
    // The stored enum stays `must_ask`; only the rendering is Arabic — same
    // rule as PRIORITY_LABEL_AR in prep-v2-view.tsx, which reads "أساسي".
    helper: "سؤال لكل سطر — الأسئلة الأساسية فقط، دون «إن سمح الوقت».",
    rows: 6,
    read: (p) =>
      (p.question_bank ?? [])
        .filter((q) => q.priority === "must_ask")
        .map((q) => q.text)
        .join("\n"),
  },
  {
    field: "host_guidance.overall_tone",
    label: "نبرة المُقدِّم",
    rows: 2,
    read: (p) => p.host_guidance?.overall_tone ?? "",
  },
  {
    field: "host_guidance.do_list",
    label: "افعل (للمُقدِّم)",
    helper: "بند لكل سطر.",
    rows: 4,
    read: (p) => (p.host_guidance?.do_list ?? []).join("\n"),
  },
  {
    field: "host_guidance.dont_list",
    label: "لا تفعل (للمُقدِّم)",
    helper: "بند لكل سطر.",
    rows: 4,
    read: (p) => (p.host_guidance?.dont_list ?? []).join("\n"),
  },
  {
    field: "director_guidance.shot_priorities",
    label: "ملاحظات الإخراج — أولويات اللقطات",
    helper: "أولوية لكل سطر.",
    rows: 4,
    read: (p) => (p.director_guidance?.shot_priorities ?? []).join("\n"),
  },
]

export function PrepV2InlineEditor({
  prepId,
  payload,
}: {
  prepId: string
  payload: PrepV2Payload
}) {
  return (
    <div
      className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4"
      data-prep-inline-editor
    >
      <div className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700">
        <Pencil className="h-3 w-3" /> تعديل سريع للحقول الأساسية
      </div>
      <div className="space-y-3">
        {FIELDS.map((def) => (
          <PrepFieldRow
            key={def.field}
            prepId={prepId}
            def={def}
            initial={def.read(payload)}
          />
        ))}
      </div>
    </div>
  )
}

function PrepFieldRow({
  prepId,
  def,
  initial,
}: {
  prepId: string
  def: FieldDef
  initial: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const dirty = draft !== initial

  const onSave = () => {
    startTransition(async () => {
      // Worst blast radius of the seven: the whole row is `disabled={pending}`,
      // so a rejected promise here left the operator unable to press even
      // "إلغاء" — their edit trapped in a textarea they could not close.
      const outcome = await runAction(() =>
        updatePrepFieldAction(prepId, { field: def.field, value: draft }),
      )
      const result: PrepEditResult = outcome.ok
        ? outcome.data
        : { ok: false, message: outcome.message }
      toast({
        title: result.ok ? "تم حفظ التعديل" : "فشل الحفظ",
        description: result.message,
        variant: result.ok ? "success" : "error",
      })
      if (result.ok) {
        setSavedAt(Date.now())
        setEditing(false)
        router.refresh()
      }
    })
  }

  const onCancel = () => {
    setDraft(initial)
    setEditing(false)
  }

  return (
    <div
      className="rounded-xl border border-border/40 bg-background/30 p-3"
      data-prep-field={def.field}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-foreground/85">
          {def.label}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(initial)
              setEditing(true)
            }}
            // 21.8px tall measured at 375px — under even the lenient WCAG
            // 24×24. `min-h-[44px]` matches the preflight screens; it is
            // relaxed on `sm:` and up so the desktop row keeps its density,
            // where a pointer does not need the larger target.
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border/40 bg-background/40 px-3 py-1 text-[13px] text-muted-foreground hover:text-foreground sm:min-h-0 sm:py-0.5"
          >
            <Pencil className="h-3.5 w-3.5" /> تعديل
          </button>
        )}
        {savedAt && !editing && (
          <span className="inline-flex items-center gap-1 text-[13px] text-emerald-800">
            <Check className="h-3.5 w-3.5" />
            تم الحفظ
          </span>
        )}
      </div>
      {def.helper && (
        <div className="mb-1 text-[13px] text-muted-foreground">
          {def.helper}
        </div>
      )}
      {editing ? (
        <>
          <textarea
            className="w-full resize-y rounded-lg border border-border/40 bg-background/60 p-2 text-[12px] leading-relaxed text-foreground/90 focus:border-violet-500/60 focus:outline-none"
            rows={def.rows}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            data-prep-textarea
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            {/* 13px — the /admin/ops body step. This warns the operator that
                edits are still unsaved, so it must not be the smallest text on
                the row; 11px merely put it on the ladder's bottom rung. */}
            <span
              className={
                dirty
                  ? "text-[13px] font-medium text-amber-800"
                  : "text-[13px] text-muted-foreground"
              }
            >
              {dirty ? "تغييرات غير محفوظة" : "بدون تغيير"}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSave}
                disabled={pending || !dirty}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-500/20 disabled:opacity-50"
                data-prep-save
              >
                {pending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> حفظ
                  </>
                ) : (
                  <>
                    <Save className="h-3 w-3" /> حفظ
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3 w-3" /> إلغاء
              </button>
            </div>
          </div>
        </>
      ) : (
        // A <pre> here was only ever for line preservation, but Tailwind's
        // preflight gives <pre> the MONO font stack — and not one family in
        // it (ui-monospace/Menlo/Monaco/Consolas) ships Arabic glyphs. The
        // browser therefore fell back per-character and the fixed advance
        // width broke Arabic letter joining: the 28 questions, the most
        // important text on the screen, rendered in its worst possible form.
        // A div with `whitespace-pre-wrap` preserves the newlines and
        // inherits the page's Arabic face.
        <div
          className="whitespace-pre-wrap break-words rounded-lg bg-background/40 p-2 text-[11.5px] leading-relaxed text-foreground/85"
          dir={def.field === "host_guidance.overall_tone" || def.field === "thesis" ? "rtl" : undefined}
        >
          {initial.trim() ? initial : <span className="text-muted-foreground">— فارغ —</span>}
        </div>
      )}
    </div>
  )
}
