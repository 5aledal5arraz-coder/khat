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
    helper: "سؤال لكل سطر — هذه هي أسئلة must_ask فقط.",
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
      <div className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
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
      const result: PrepEditResult = await updatePrepFieldAction(prepId, {
        field: def.field,
        value: draft,
      })
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
        <div className="text-[11px] font-semibold text-foreground/85">
          {def.label}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(initial)
              setEditing(true)
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-2.5 w-2.5" /> تعديل
          </button>
        )}
        {savedAt && !editing && (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
            <Check className="h-2.5 w-2.5" />
            تم الحفظ
          </span>
        )}
      </div>
      {def.helper && (
        <div className="mb-1 text-[10.5px] text-muted-foreground/70">
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
            <span className="text-[10px] text-muted-foreground/70">
              {dirty ? "تغييرات غير محفوظة" : "بدون تغيير"}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSave}
                disabled={pending || !dirty}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
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
        <pre
          className="whitespace-pre-wrap break-words rounded-lg bg-background/40 p-2 text-[11.5px] leading-relaxed text-foreground/85"
          dir={def.field === "host_guidance.overall_tone" || def.field === "thesis" ? "rtl" : undefined}
        >
          {initial.trim() ? initial : <span className="text-muted-foreground/60">— فارغ —</span>}
        </pre>
      )}
    </div>
  )
}
