"use client"

import { useState, useTransition } from "react"
import { X, Plus, Loader2 } from "lucide-react"
import {
  KHAT_EPISODE_TYPE_LABEL,
  KHAT_TOPIC_DOMAIN_LABEL,
  type KhatMapEpisodeType,
  type KhatMapTopicDomain,
  type KhatMapEpisodeCandidate,
} from "@/types/khat-map"
import { addManualTopicAction } from "../../actions"

const EPISODE_TYPES = Object.entries(KHAT_EPISODE_TYPE_LABEL) as Array<
  [KhatMapEpisodeType, string]
>
const TOPIC_DOMAINS = Object.entries(KHAT_TOPIC_DOMAIN_LABEL) as Array<
  [KhatMapTopicDomain, { label: string }]
>

/**
 * Manual-mode topic authoring form. Lets the operator add an episode topic
 * by hand (manual seasons have the AI generators turned off). Only the title
 * and type are required; the rest are optional and can be filled later via
 * the edit modal.
 */
export function AddTopicModal({
  open,
  seasonId,
  onClose,
  onAdded,
}: {
  open: boolean
  seasonId: string
  onClose: () => void
  onAdded: (topic: KhatMapEpisodeCandidate) => void
}) {
  const [title, setTitle] = useState("")
  const [episodeType, setEpisodeType] = useState<KhatMapEpisodeType>("intellectual")
  const [domain, setDomain] = useState<KhatMapTopicDomain | "">("")
  const [hook, setHook] = useState("")
  const [whyMatters, setWhyMatters] = useState("")
  const [whyNow, setWhyNow] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) return null

  const reset = () => {
    setTitle("")
    setEpisodeType("intellectual")
    setDomain("")
    setHook("")
    setWhyMatters("")
    setWhyNow("")
    setError(null)
  }

  const handleAdd = () => {
    setError(null)
    if (!title.trim()) {
      setError("عنوان الموضوع مطلوب")
      return
    }
    start(async () => {
      const res = await addManualTopicAction({
        seasonId,
        working_title: title,
        episode_type: episodeType,
        topic_domain: domain || undefined,
        hook,
        why_matters: whyMatters,
        why_now: whyNow,
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      reset()
      onAdded(res.data.topic)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-xl rounded-2xl border border-border/40 bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-border/30 pb-3">
          <h3 className="text-base font-bold">إضافة موضوع يدوي</h3>
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
          <Field label="عنوان الموضوع *">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="مثال: لماذا نخاف من الفشل؟"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نوع الحلقة *">
              <select
                value={episodeType}
                onChange={(e) => setEpisodeType(e.target.value as KhatMapEpisodeType)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
              >
                {EPISODE_TYPES.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="المجال (اختياري)">
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as KhatMapTopicDomain | "")}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">—</option>
                {TOPIC_DOMAINS.map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="الجملة الافتتاحية (Hook) — اختياري">
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="لماذا مهمّ — اختياري">
            <textarea
              value={whyMatters}
              onChange={(e) => setWhyMatters(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="لماذا الآن — اختياري">
            <textarea
              value={whyNow}
              onChange={(e) => setWhyNow(e.target.value)}
              rows={2}
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
            onClick={handleAdd}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-[13px] font-bold text-background hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            إضافة الموضوع
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
