"use client"

import { useState, useTransition } from "react"
import { X, Save, Loader2 } from "lucide-react"
import type { KhatMapEpisodeCandidate } from "@/types/khat-map"
import { editEpisodeAction } from "../../actions"

/**
 * Minimal Overview edit modal. Only exposes the fields the admin is
 * realistically going to tweak from the season grid — title, hook,
 * why_matters, why_now, goal, description. Deeper edits (risk level,
 * questions, axes, guest swap) still belong in the wizard flow.
 */
export function EpisodeEditModal({
  open,
  seasonId,
  topic,
  onClose,
  onSaved,
}: {
  open: boolean
  seasonId: string
  topic: KhatMapEpisodeCandidate
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(topic.working_title)
  const [hook, setHook] = useState(topic.hook ?? "")
  const [whyMatters, setWhyMatters] = useState(topic.why_matters ?? "")
  const [whyNow, setWhyNow] = useState(topic.why_now ?? "")
  const [goal, setGoal] = useState(topic.goal ?? "")
  const [description, setDescription] = useState(topic.description ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) return null

  const handleSave = () => {
    setError(null)
    start(async () => {
      const res = await editEpisodeAction({
        seasonId,
        topicCandidateId: topic.id,
        patch: {
          working_title: title,
          hook,
          why_matters: whyMatters,
          why_now: whyNow,
          goal,
          description,
        },
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      onSaved()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-xl rounded-2xl border border-border/40 bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-border/30 pb-3">
          <h3 className="text-base font-bold">تعديل الحلقة</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3">
          <Field label="العنوان">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="الجملة الافتتاحية (Hook)">
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="لماذا مهمّ">
            <textarea
              value={whyMatters}
              onChange={(e) => setWhyMatters(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="لماذا الآن">
            <textarea
              value={whyNow}
              onChange={(e) => setWhyNow(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="الهدف">
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="الوصف">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-[11.5px] text-rose-400">
            {error}
          </div>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-[13px] font-bold text-background hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
