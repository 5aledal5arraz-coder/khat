"use client"

/**
 * Workspace-native "Push to Episode" button.
 *
 * Two-step interaction:
 *   1. First click  → expands an inline confirmation panel listing
 *                     exactly which fields will be written and how many
 *                     of those would replace existing non-empty values.
 *   2. Confirm      → fires `pushPackageToEpisodeAction` with all
 *                     pushable fields. Cancel collapses the panel back.
 *
 * The preview is computed server-side at page render via
 * `getPushPreview(eirId)` so the operator sees real data, not a guess.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react"
import { toast } from "@/lib/use-toast"
import {
  pushPackageToEpisodeAction,
  type PushActionResult,
} from "./actions"
// Phase B audit fix — client must import labels from the type-only
// file, not from `push-preview.ts` (which transitively imports
// `revalidatePath` via `lib/studio`).
import {
  PUSH_FIELD_LABEL_AR,
  type PushPreview,
  type PushPreviewField,
} from "@/lib/khat-brain/push-preview-types"

export function PushButton({
  eirId,
  preview,
  disabled,
  disabledReason,
}: {
  eirId: string
  preview: PushPreview
  disabled?: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<PushActionResult | null>(null)

  const isDisabled = disabled || !preview.ok || preview.pushableFields.length === 0
  const blockedReason =
    disabledReason ??
    (!preview.ok
      ? preview.message ?? "الدفع غير متاح."
      : preview.pushableFields.length === 0
        ? "الحزمة فارغة — لا توجد حقول للدفع."
        : undefined)

  const onFirstClick = () => {
    setResult(null)
    setConfirming(true)
  }

  const onConfirm = () => {
    startTransition(async () => {
      const fields = pushableToFieldsMap(preview.pushableFields)
      const r = await pushPackageToEpisodeAction({ eirId, fields })
      setResult(r)
      // UX-5.5b — destructive transition feedback toast.
      if (r.ok) {
        toast({
          title: "تم تحديث بيانات الحلقة",
          description: `تم دفع ${r.pushedFields.length} حقل.`,
          variant: "success",
        })
        setConfirming(false)
        // Phase B.5 — single navigation; the server action already
        // called revalidatePath, so router.refresh() here would
        // double-fetch and flicker.
        router.push(
          `/admin/khat-brain/episodes/${eirId}?tab=publish&success=pushed&fields=${encodeURIComponent(r.pushedFields.join(","))}`,
        )
      } else {
        toast({
          title: "فشل دفع الحزمة",
          description: r.message,
          variant: "error",
        })
      }
    })
  }

  const onCancel = () => {
    setConfirming(false)
    setResult(null)
  }

  // Idle (not yet asked to confirm) — render the trigger button.
  if (!confirming) {
    return (
      <div className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={onFirstClick}
          disabled={isDisabled}
          title={blockedReason}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
        >
          <Send className="h-3 w-3" />
          دفع الحزمة إلى الحلقة
        </button>
        {result && !result.ok && (
          <div className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[10.5px] text-rose-300">
            <XCircle className="h-2.5 w-2.5" />
            {result.message}
          </div>
        )}
        {result && result.ok && (
          <div className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10.5px] text-emerald-300">
            <CheckCircle2 className="h-2.5 w-2.5" />
            {result.message}
          </div>
        )}
      </div>
    )
  }

  // Confirmation panel.
  return (
    <div
      className="w-full rounded-2xl border border-violet-500/30 bg-violet-500/5 p-3 text-[12px]"
      data-push-confirm-panel
    >
      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
        <ShieldCheck className="h-3 w-3" /> تأكيد دفع الحزمة
      </div>

      <p className="mb-2 leading-relaxed text-foreground/85">
        سيتم استبدال القيم الحالية في الحلقة بهذه البيانات.
      </p>

      {(() => {
        const overwriteSet = new Set(preview.overwritingFields)
        const newFields = preview.pushableFields.filter(
          (f) => !overwriteSet.has(f),
        )
        const overFields = preview.pushableFields.filter((f) =>
          overwriteSet.has(f),
        )
        return (
          <div className="space-y-2">
            {newFields.length > 0 && (
              <FieldGroup
                tone="emerald"
                heading={`حقول جديدة (${newFields.length})`}
                fields={newFields}
              />
            )}
            {overFields.length > 0 && (
              <FieldGroup
                tone="amber"
                heading={`حقول سيتم استبدالها (${overFields.length})`}
                fields={overFields}
              />
            )}
            {newFields.length === 0 && overFields.length === 0 && (
              <FieldGroup tone="muted" heading="حقول للدفع" fields={[]} />
            )}
          </div>
        )
      })()}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-[12px] font-medium text-violet-100 hover:bg-violet-500/25 disabled:opacity-50"
          data-push-confirm-button
        >
          {pending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              جارٍ الدفع…
            </>
          ) : (
            <>
              <Send className="h-3 w-3" />
              تأكيد الدفع
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/40 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          إلغاء
        </button>
      </div>

      {result && !result.ok && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[10.5px] text-rose-300">
          <XCircle className="h-2.5 w-2.5" />
          {result.message}
        </div>
      )}
    </div>
  )
}

function FieldGroup({
  tone,
  heading,
  fields,
}: {
  tone: "emerald" | "amber" | "muted"
  heading: string
  fields: PushPreviewField[]
}) {
  const frame =
    tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "amber"
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-dashed border-border/40 bg-background/30"
  const headingTone =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-muted-foreground"
  return (
    <div className={"rounded-lg border p-2 " + frame}>
      <div className={"mb-1 inline-flex items-center gap-1 text-[10.5px] font-semibold " + headingTone}>
        {tone === "amber" && <AlertTriangle className="h-3 w-3" />}
        {heading}
      </div>
      {fields.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          لا توجد حقول قابلة للدفع.
        </div>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {fields.map((f) => (
            <li
              key={f}
              className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/40 px-2 py-0.5 text-[10.5px] text-foreground/85"
            >
              {PUSH_FIELD_LABEL_AR[f]}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function pushableToFieldsMap(fields: PushPreviewField[]) {
  const f = {
    title: false,
    description: false,
    hero_summary: false,
    full_summary: false,
    takeaways: false,
    quotes: false,
    resources: false,
    timestamps: false,
  }
  for (const k of fields) f[k] = true
  return f
}
