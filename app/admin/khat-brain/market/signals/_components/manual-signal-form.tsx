"use client"

/**
 * Phase 4 — Manual Signal form (Arabic operator surface).
 *
 * Lives at the top of /admin/khat-brain/market/signals as a collapsible
 * panel. Submits through the server action which writes:
 *   • one market_topic_signals row (operator_created=true,
 *     review_status='approved', source='manual')
 *   • one market_signal_review_events row (action='create')
 *
 * No internal terms surface. Validation messages come from the copy
 * module — never raw error codes.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Save, Sparkles, X as XIcon, CheckCircle2 } from "lucide-react"
import { createManualSignalAction } from "./manual-signal-actions"
import {
  MANUAL_FORM_COPY,
  MANUAL_KIND_LABEL,
  TAG_LABEL,
} from "./copy"
import {
  MANUAL_SIGNAL_KINDS,
  type ManualSignalKind,
} from "@/lib/db/schema/market-intelligence"
import {
  SIGNAL_EDITORIAL_TAGS,
  type SignalEditorialTag,
} from "@/lib/db/schema/editorial-intelligence"

export interface TrustedSourceChoice {
  id: string
  display_name: string
  source_type: string
}

interface FormDraft {
  title: string
  summary: string
  manual_kind: ManualSignalKind
  source_link: string
  trusted_source_id: string
  language: string
  geography: string
  theme: string
  emotional_trigger: string
  controversy_score: number
  editorial_tags: SignalEditorialTag[]
  operator_notes: string
}

function emptyDraft(): FormDraft {
  return {
    title: "",
    summary: "",
    manual_kind: "observation",
    source_link: "",
    trusted_source_id: "",
    language: "ar",
    geography: "",
    theme: "",
    emotional_trigger: "",
    controversy_score: 0.5,
    editorial_tags: [],
    operator_notes: "",
  }
}

export function ManualSignalForm({
  trustedSources,
}: {
  trustedSources: TrustedSourceChoice[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FormDraft>(emptyDraft())
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const set = <K extends keyof FormDraft>(k: K, v: FormDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const toggleTag = (t: SignalEditorialTag) => {
    setDraft((d) => ({
      ...d,
      editorial_tags: d.editorial_tags.includes(t)
        ? d.editorial_tags.filter((x) => x !== t)
        : [...d.editorial_tags, t],
    }))
  }

  const submit = () => {
    setError(null)
    setSuccess(null)
    start(async () => {
      const r = await createManualSignalAction({
        title: draft.title,
        summary: draft.summary,
        manual_kind: draft.manual_kind,
        source_link: draft.source_link || null,
        trusted_source_id: draft.trusted_source_id || null,
        language: draft.language,
        geography: draft.geography || null,
        theme: draft.theme || null,
        emotional_trigger: draft.emotional_trigger || null,
        controversy_score: draft.controversy_score,
        editorial_tags: draft.editorial_tags,
        operator_notes: draft.operator_notes || null,
      })
      if (!r.ok) {
        setError(r.message)
        return
      }
      setSuccess(MANUAL_FORM_COPY.success)
      setDraft(emptyDraft())
      router.refresh()
    })
  }

  if (!open) {
    return (
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setError(null)
            setSuccess(null)
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[11.5px] font-medium text-violet-700 hover:bg-violet-500/20"
          data-manual-toggle="open"
        >
          <Plus className="h-3 w-3" />
          {MANUAL_FORM_COPY.toggleOpen}
        </button>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4"
      data-manual-form
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10.5px] font-medium text-violet-700">
            <Sparkles className="h-3 w-3" /> {MANUAL_FORM_COPY.panelTitle}
          </div>
          <p className="max-w-2xl text-[11.5px] leading-relaxed text-foreground/85">
            {MANUAL_FORM_COPY.intro}
          </p>
          <p className="mt-1 text-[10.5px] text-emerald-700/80">
            <CheckCircle2 className="me-1 inline h-2.5 w-2.5" />
            {MANUAL_FORM_COPY.hints.autoApproved}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
          aria-label={MANUAL_FORM_COPY.toggleClose}
          data-manual-toggle="close"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={MANUAL_FORM_COPY.fields.title} wide>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            dir="rtl"
            placeholder={MANUAL_FORM_COPY.fields.titlePlaceholder}
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12.5px]"
            data-manual-title
            required
          />
        </Field>
        <Field label={MANUAL_FORM_COPY.fields.summary} wide>
          <textarea
            value={draft.summary}
            onChange={(e) => set("summary", e.target.value)}
            rows={3}
            dir="rtl"
            placeholder={MANUAL_FORM_COPY.fields.summaryPlaceholder}
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12.5px]"
            data-manual-summary
            required
          />
        </Field>
        <Field label={MANUAL_FORM_COPY.fields.kind}>
          <select
            value={draft.manual_kind}
            onChange={(e) =>
              set("manual_kind", e.target.value as ManualSignalKind)
            }
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]"
            data-manual-kind
          >
            {(MANUAL_SIGNAL_KINDS as readonly ManualSignalKind[]).map((k) => (
              <option key={k} value={k}>
                {MANUAL_KIND_LABEL[k] ?? k}
              </option>
            ))}
          </select>
        </Field>
        <Field label={MANUAL_FORM_COPY.fields.trustedSource}>
          <select
            value={draft.trusted_source_id}
            onChange={(e) => set("trusted_source_id", e.target.value)}
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]"
            data-manual-trusted-source
          >
            <option value="">{MANUAL_FORM_COPY.fields.trustedSourcePlaceholder}</option>
            {trustedSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={MANUAL_FORM_COPY.fields.sourceLink} wide>
          <input
            type="text"
            value={draft.source_link}
            onChange={(e) => set("source_link", e.target.value)}
            dir="ltr"
            placeholder={MANUAL_FORM_COPY.fields.sourceLinkPlaceholder}
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]"
            data-manual-source-link
          />
        </Field>
        <Field label={MANUAL_FORM_COPY.fields.language}>
          <input
            type="text"
            value={draft.language}
            onChange={(e) => set("language", e.target.value)}
            dir="ltr"
            placeholder={MANUAL_FORM_COPY.fields.languagePlaceholder}
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]"
            data-manual-language
          />
        </Field>
        <Field label={MANUAL_FORM_COPY.fields.geography}>
          <input
            type="text"
            value={draft.geography}
            onChange={(e) => set("geography", e.target.value)}
            dir="rtl"
            placeholder={MANUAL_FORM_COPY.fields.geographyPlaceholder}
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]"
            data-manual-geography
          />
        </Field>
        <Field label={MANUAL_FORM_COPY.fields.theme}>
          <input
            type="text"
            value={draft.theme}
            onChange={(e) => set("theme", e.target.value)}
            dir="ltr"
            placeholder={MANUAL_FORM_COPY.fields.themePlaceholder}
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]"
            data-manual-theme
          />
        </Field>
        <Field label={MANUAL_FORM_COPY.fields.emotion}>
          <input
            type="text"
            value={draft.emotional_trigger}
            onChange={(e) => set("emotional_trigger", e.target.value)}
            dir="rtl"
            placeholder={MANUAL_FORM_COPY.fields.emotionPlaceholder}
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]"
            data-manual-emotion
          />
        </Field>
        <Field
          label={MANUAL_FORM_COPY.fields.controversy}
          hint={MANUAL_FORM_COPY.fields.rangeHint}
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.controversy_score}
              onChange={(e) =>
                set("controversy_score", Number(e.target.value))
              }
              className="flex-1 accent-violet-500"
              data-manual-controversy
            />
            <span className="w-10 text-end font-mono text-[11.5px] text-foreground/80" dir="ltr">
              {draft.controversy_score.toFixed(2)}
            </span>
          </div>
        </Field>
        <Field label={MANUAL_FORM_COPY.fields.tags} wide>
          <div className="flex flex-wrap gap-1.5" data-manual-tags>
            {(SIGNAL_EDITORIAL_TAGS as readonly SignalEditorialTag[]).map((t) => {
              const selected = draft.editorial_tags.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  data-manual-tag={t}
                  data-selected={selected}
                  className={
                    "rounded-full border px-2 py-0.5 text-[11px] transition-colors " +
                    (selected
                      ? "border-violet-500/40 bg-violet-500/15 text-violet-700"
                      : "border-border/40 bg-background/40 text-muted-foreground hover:border-violet-500/30 hover:text-foreground")
                  }
                >
                  {TAG_LABEL[t]}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label={MANUAL_FORM_COPY.fields.notes} wide>
          <textarea
            value={draft.operator_notes}
            onChange={(e) => set("operator_notes", e.target.value)}
            rows={2}
            dir="rtl"
            placeholder={MANUAL_FORM_COPY.fields.notesPlaceholder}
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]"
            data-manual-notes
          />
        </Field>
      </div>

      {error && (
        <p
          className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-[11.5px] text-rose-700"
          data-manual-error
        >
          {error}
        </p>
      )}
      {success && (
        <p
          className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11.5px] text-emerald-700"
          data-manual-success
        >
          {success}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40"
          data-manual-submit
        >
          <Save className="h-3 w-3" />
          {MANUAL_FORM_COPY.buttons.save}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setDraft(emptyDraft())
            setError(null)
            setSuccess(null)
          }}
          className="rounded-lg border border-border/40 bg-background/40 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted/30"
        >
          {MANUAL_FORM_COPY.buttons.cancel}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string
  hint?: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={"flex flex-col gap-0.5 " + (wide ? "sm:col-span-2" : "")}>
      <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[10.5px] text-muted-foreground">{hint}</span>
      )}
    </label>
  )
}
