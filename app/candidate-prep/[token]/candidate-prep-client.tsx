"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Loader2, Save, Send, Sparkles } from "lucide-react"
import { formatTime } from "@/lib/shared/formatters"
import type {
  PrepFormLink,
  PrepFormResponse,
  PrepFormTemplate,
  PrepFormFieldDef,
} from "@/types/database"

interface Props {
  token: string
  link: PrepFormLink
  template: PrepFormTemplate
  candidate: { id: string; full_name: string; display_name: string | null }
  existingResponse: PrepFormResponse | null
  readOnly: boolean
}

type FieldValue = string | string[] | boolean | null

export function CandidatePrepClient({
  token,
  link,
  template,
  candidate,
  existingResponse,
  readOnly,
}: Props) {
  const initial = useMemo<Record<string, FieldValue>>(() => {
    const map: Record<string, FieldValue> = {}
    for (const section of template.schema_json.sections) {
      for (const field of section.fields) {
        const existing = (existingResponse?.response_json as Record<string, unknown> | undefined)?.[field.id]
        if (existing !== undefined) {
          map[field.id] = existing as FieldValue
        } else if (field.type === "multi_select") {
          map[field.id] = []
        } else if (field.type === "yes_no") {
          map[field.id] = null
        } else {
          map[field.id] = ""
        }
      }
    }
    return map
  }, [template, existingResponse])

  const [values, setValues] = useState<Record<string, FieldValue>>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [submitted, setSubmitted] = useState(readOnly)
  const [error, setError] = useState<string | null>(null)
  const [autosaveAt, setAutosaveAt] = useState<Date | null>(null)
  const dirtyRef = useRef(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const displayName = candidate.display_name || candidate.full_name

  // Track required field completion
  const totalRequired = useMemo(() => {
    let n = 0
    for (const section of template.schema_json.sections) {
      for (const f of section.fields) if (f.required) n += 1
    }
    return n
  }, [template])

  const completedRequired = useMemo(() => {
    let n = 0
    for (const section of template.schema_json.sections) {
      for (const f of section.fields) {
        if (!f.required) continue
        const v = values[f.id]
        if (v == null) continue
        if (typeof v === "string" && v.trim() === "") continue
        if (Array.isArray(v) && v.length === 0) continue
        n += 1
      }
    }
    return n
  }, [values, template])

  const allRequiredFilled = totalRequired === 0 || completedRequired === totalRequired

  function setField(id: string, value: FieldValue) {
    setValues((prev) => ({ ...prev, [id]: value }))
    dirtyRef.current = true
    scheduleAutosave()
  }

  function scheduleAutosave() {
    if (readOnly) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void saveDraft()
    }, 2500)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  async function saveDraft() {
    if (readOnly || submitting || submitted) return
    if (!dirtyRef.current) return
    setSavingDraft(true)
    try {
      const res = await fetch(`/api/candidate-prep/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: values, is_final: false }),
      })
      if (res.ok) {
        dirtyRef.current = false
        setAutosaveAt(new Date())
      }
    } catch {
      // ignore — autosave is best effort
    } finally {
      setSavingDraft(false)
    }
  }

  async function handleSubmit() {
    setError(null)
    if (!allRequiredFilled) {
      setError("يرجى تعبئة الحقول المطلوبة قبل الإرسال")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/candidate-prep/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: values, is_final: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubmitted(true)
      } else {
        setError(data.error || "حدث خطأ أثناء الإرسال")
      }
    } catch {
      setError("فشل الاتصال بالخادم")
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <h1 className="mb-3 text-2xl font-bold">شكراً لك، {displayName}!</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            وصلتنا إجاباتك بنجاح. سيتواصل معك فريق خط بودكاست في أقرب وقت لتنسيق التفاصيل.
            نقدّر وقتك واهتمامك، ونحن متشوقون لاستضافتك.
          </p>
          <div className="text-xs text-muted-foreground/60">— فريق خط بودكاست</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* Header */}
      <header className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-medium text-violet-700 dark:text-violet-300">
          <Sparkles className="h-3 w-3" />
          نموذج تحضير
        </div>
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">أهلاً بك، {displayName}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          ساعدنا نعرفك أكثر قبل التصوير. كل سؤال اختياري إلا ما هو معلّم بـ <span className="text-rose-500">*</span>.
          إجاباتك تساعدنا نصمم لك تجربة استضافة مميزة وشخصية.
        </p>
        {link.admin_message && (
          <div className="mt-4 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-start text-xs text-foreground/80">
            {link.admin_message}
          </div>
        )}
      </header>

      {/* Progress */}
      {totalRequired > 0 && (
        <div className="mb-6">
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>الحقول المطلوبة</span>
            <span>{completedRequired} / {totalRequired}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-violet-500 transition-all"
              style={{ width: `${(completedRequired / totalRequired) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-6">
        {template.schema_json.sections.map((section) => (
          <section key={section.id} className="rounded-2xl border border-border/40 bg-card/40 p-5 sm:p-6">
            <h2 className="mb-1 text-base font-semibold">{section.title}</h2>
            {section.description && (
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{section.description}</p>
            )}
            <div className="space-y-4">
              {section.fields.map((field) => (
                <FieldRenderer
                  key={field.id}
                  field={field}
                  value={values[field.id]}
                  onChange={(v) => setField(field.id, v)}
                  disabled={readOnly}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Footer actions */}
      <div className="mt-8 space-y-3">
        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-400">
            {error}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] text-muted-foreground">
            {savingDraft ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> حفظ تلقائي...
              </span>
            ) : autosaveAt ? (
              <span className="inline-flex items-center gap-1">
                <Save className="h-3 w-3" /> حُفظت المسودة {formatTime(autosaveAt.toISOString())}
              </span>
            ) : (
              <span>إجاباتك تُحفظ تلقائياً</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !allRequiredFilled}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? "جارٍ الإرسال..." : "إرسال النموذج"}
          </button>
        </div>
      </div>

      <div className="mt-12 text-center text-[10px] text-muted-foreground/50">
        خط بودكاست — نموذج خاص بالضيوف
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field renderer
// ---------------------------------------------------------------------------

function FieldRenderer({
  field,
  value,
  onChange,
  disabled,
}: {
  field: PrepFormFieldDef
  value: FieldValue
  onChange: (v: FieldValue) => void
  disabled: boolean
}) {
  const labelEl = (
    <label className="mb-1.5 block text-xs font-semibold text-foreground/90">
      {field.label}
      {field.required && <span className="ms-1 text-rose-500">*</span>}
    </label>
  )
  const desc = field.description && (
    <p className="mb-2 text-[10px] text-muted-foreground">{field.description}</p>
  )

  switch (field.type) {
    case "instructions":
      return (
        <div className="rounded-lg border border-border/30 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
          {field.label}
          {field.description && <div className="mt-1">{field.description}</div>}
        </div>
      )

    case "short_text":
    case "contact_preference":
    case "location":
      return (
        <div>
          {labelEl}
          {desc}
          <input
            type="text"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-violet-500 focus:outline-none"
          />
        </div>
      )

    case "long_text":
      return (
        <div>
          {labelEl}
          {desc}
          <textarea
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            rows={4}
            className="w-full rounded-lg border border-input bg-background p-3 text-sm leading-relaxed focus:border-violet-500 focus:outline-none"
          />
        </div>
      )

    case "date":
      return (
        <div>
          {labelEl}
          {desc}
          <input
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-violet-500 focus:outline-none"
          />
        </div>
      )

    case "single_select": {
      const opts = field.options || []
      return (
        <div>
          {labelEl}
          {desc}
          <div className="flex flex-wrap gap-2">
            {opts.map((opt) => {
              const selected = value === opt
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange(opt)}
                  disabled={disabled}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    selected
                      ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                      : "border-input bg-transparent text-muted-foreground hover:border-violet-500/50"
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    case "multi_select": {
      const opts = field.options || []
      const arr = (value as string[]) || []
      return (
        <div>
          {labelEl}
          {desc}
          <div className="flex flex-wrap gap-2">
            {opts.map((opt) => {
              const selected = arr.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    onChange(selected ? arr.filter((v) => v !== opt) : [...arr, opt])
                  }
                  disabled={disabled}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    selected
                      ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                      : "border-input bg-transparent text-muted-foreground hover:border-violet-500/50"
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    case "yes_no":
      return (
        <div>
          {labelEl}
          {desc}
          <div className="flex gap-2">
            {[
              { v: true, label: "نعم" },
              { v: false, label: "لا" },
            ].map((opt) => {
              const selected = value === opt.v
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => onChange(opt.v)}
                  disabled={disabled}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selected
                      ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                      : "border-input bg-transparent text-muted-foreground hover:border-violet-500/50"
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      )

    default:
      return null
  }
}
