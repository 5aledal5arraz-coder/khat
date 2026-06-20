"use client"

/**
 * UX-5.2 — Studio quick-edit panel.
 *
 * Lightweight inline editors for the five high-frequency fields:
 *   - custom_title (website title)
 *   - hero_summary
 *   - takeaways         (line-per-item)
 *   - quotes            (line-per-item — text only)
 *   - timestamps        (line-per-item — "mm:ss — title")
 *
 * Mounted inside the Studio tab. Advanced editing (full transcript,
 * chapters, clips, deep analysis) still lives on the full Studio page,
 * linked in the tab header.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Loader2, Check, X, Save } from "lucide-react"
import { toast } from "@/lib/use-toast"
import {
  updateStudioFieldAction,
  type StudioQuickEditField,
  type StudioQuickEditResult,
} from "./studio-actions"
import type { WorkspaceStudioSummary } from "@/lib/khat-brain/workspace-tabs"

interface FieldDef {
  field: StudioQuickEditField
  label: string
  helper?: string
  rows: number
  read: (s: WorkspaceStudioSummary) => string
}

function fmtMmSs(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`
  }
  return `${pad(m)}:${pad(s)}`
}
function pad(n: number) {
  return n.toString().padStart(2, "0")
}

const FIELDS: FieldDef[] = [
  {
    field: "custom_title",
    label: "عنوان الحلقة على الموقع",
    rows: 2,
    read: (s) => s.package?.custom_title ?? "",
  },
  {
    field: "hero_summary",
    label: "الملخّص الرئيسي",
    helper: "يظهر في رأس صفحة الحلقة.",
    rows: 4,
    read: (s) => s.package?.hero_summary ?? "",
  },
  {
    field: "takeaways",
    label: "النقاط الرئيسية",
    helper: "نقطة لكل سطر.",
    rows: 5,
    read: (s) => (s.package?.takeaways ?? []).join("\n"),
  },
  {
    field: "quotes",
    label: "الاقتباسات (النصّ فقط)",
    helper: "اقتباس لكل سطر — السرد والمتحدّث يُحفَظان من الحزمة الأصلية.",
    rows: 5,
    read: (s) => (s.package?.quotes ?? []).map((q) => q.text).join("\n"),
  },
  {
    field: "timestamps",
    label: "الفهرس الزمني",
    helper: "صيغة كل سطر: mm:ss — العنوان (مثال: 04:30 — اللحظة المحوريّة).",
    rows: 6,
    read: (s) =>
      (s.package?.timestamps ?? [])
        .map((t) => `${fmtMmSs(t.time_seconds)} — ${t.title}`)
        .join("\n"),
  },
]

export function StudioQuickEdit({
  eirId,
  studio,
}: {
  eirId: string
  studio: WorkspaceStudioSummary
}) {
  if (!studio.session || !studio.package) return null
  return (
    <div
      className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4"
      data-studio-quick-edit
    >
      <div className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700">
        <Pencil className="h-3 w-3" /> تعديل سريع للحقول الأساسية
      </div>
      <div className="space-y-3">
        {FIELDS.map((def) => (
          <StudioFieldRow
            key={def.field}
            eirId={eirId}
            def={def}
            initial={def.read(studio)}
          />
        ))}
      </div>
    </div>
  )
}

function StudioFieldRow({
  eirId,
  def,
  initial,
}: {
  eirId: string
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
      const result: StudioQuickEditResult = await updateStudioFieldAction({
        eirId,
        field: def.field,
        value: draft,
      })
      toast({
        title: result.ok ? "تم تحديث الاستديو" : "فشل الحفظ",
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
      data-studio-field={def.field}
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
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700">
            <Check className="h-2.5 w-2.5" />
            تم الحفظ
          </span>
        )}
      </div>
      {def.helper && (
        <div className="mb-1 text-[10.5px] text-muted-foreground">
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
            data-studio-textarea
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {dirty ? "تغييرات غير محفوظة" : "بدون تغيير"}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSave}
                disabled={pending || !dirty}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-500/20 disabled:opacity-50"
                data-studio-save
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
        <pre className="whitespace-pre-wrap break-words rounded-lg bg-background/40 p-2 text-[11.5px] leading-relaxed text-foreground/85">
          {initial.trim() ? initial : <span className="text-muted-foreground">— فارغ —</span>}
        </pre>
      )}
    </div>
  )
}
