"use client"

import { useState, useTransition } from "react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  Mic,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react"

import { formatArabicDate } from "@/lib/shared/formatters"
import type {
  UpcomingEpisodeListItem,
  UpcomingEpisodeStatus,
} from "@/lib/queries/upcoming-episodes"
import { runAction } from "@/app/admin/components/run-action"
import { saveUpcomingEpisodeAction, setUpcomingStatusAction } from "./actions"

/**
 * The list + editor for `/admin/upcoming`.
 *
 * ONE editor open at a time, inline under the list. These pages are written
 * rarely (one per planned episode) and read often, so the list is the screen
 * and the form is a mode — not a second route to keep in sync.
 */

const STATUS_CHIP: Record<UpcomingEpisodeStatus, { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  published: { label: "منشور", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  withdrawn: { label: "مسحوب", cls: "border-rose-200 bg-rose-50 text-rose-700" },
}

const FIELD =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
const LABEL = "mb-1 block text-[12px] font-semibold text-foreground"

interface EirOption {
  id: string
  label: string
  phase: string
}

interface GuestOption {
  id: string
  name: string
}

/** The editable shape — mirrors `UpcomingFormInput`, all strings for the DOM. */
interface FormState {
  id?: string
  eir_id: string
  slug: string
  title: string
  guest_id: string
  summary: string
  axes: string[]
  guest_message: string
  guest_message_audio_url: string
  guest_message_audio_duration: number | null
  expected_date: string
  status: UpcomingEpisodeStatus
}

function blankForm(): FormState {
  return {
    eir_id: "",
    slug: "",
    title: "",
    guest_id: "",
    summary: "",
    axes: [],
    guest_message: "",
    guest_message_audio_url: "",
    guest_message_audio_duration: null,
    expected_date: "",
    status: "draft",
  }
}

function formFromRow(row: UpcomingEpisodeListItem): FormState {
  return {
    id: row.id,
    eir_id: row.eir_id,
    slug: row.slug,
    title: row.title,
    guest_id: row.guest_id ?? "",
    summary: row.summary ?? "",
    axes: row.axes,
    guest_message: row.guest_message ?? "",
    guest_message_audio_url: row.guest_message_audio_url ?? "",
    guest_message_audio_duration: row.guest_message_audio_duration,
    expected_date: row.expected_date ?? "",
    status: row.status,
  }
}

export function UpcomingManager({
  rows,
  canEdit,
  eirOptions,
  guestOptions,
}: {
  rows: UpcomingEpisodeListItem[]
  canEdit: boolean
  eirOptions: EirOption[]
  guestOptions: GuestOption[]
}) {
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState("")

  return (
    <div className="space-y-5">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {canEdit && !form ? (
        <button
          type="button"
          onClick={() => {
            setError("")
            setForm(blankForm())
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          صفحة حلقة قادمة جديدة
        </button>
      ) : null}

      {form ? (
        <UpcomingEditor
          key={form.id ?? "new"}
          form={form}
          setForm={setForm}
          eirOptions={eirOptions}
          guestOptions={guestOptions}
          onError={setError}
          onClose={() => setForm(null)}
        />
      ) : null}

      {rows.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center"
          data-empty-state
        >
          <p className="text-[13.5px] font-semibold text-foreground">
            ما فيه صفحات حلقات قادمة
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-[12px] text-muted-foreground">
            الصفحة تنشر على <span dir="ltr">/episodes/&lt;slug&gt;</span> قبل نزول الحلقة،
            وتاخذ الحلقة نفس الرابط بعد النشر.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <UpcomingRow
              key={row.id}
              row={row}
              canEdit={canEdit}
              onEdit={() => {
                setError("")
                setForm(formFromRow(row))
              }}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// One list row
// ---------------------------------------------------------------------------

function UpcomingRow({
  row,
  canEdit,
  onEdit,
  onError,
}: {
  row: UpcomingEpisodeListItem
  canEdit: boolean
  onEdit: () => void
  onError: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const chip = STATUS_CHIP[row.status] ?? STATUS_CHIP.draft

  const setStatus = (next: UpcomingEpisodeStatus) => {
    onError("")
    startTransition(async () => {
      const outcome = await runAction(() => setUpcomingStatusAction(row.id, next))
      if (!outcome.ok) return onError(outcome.message)
      if (!outcome.data.success) onError(outcome.data.error || "تعذّر الحفظ")
    })
  }

  return (
    <li
      data-upcoming-row={row.id}
      className="rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 dir="auto" className="text-[14px] font-bold leading-tight text-foreground">
              {row.title}
            </h2>
            <span
              data-status={row.status}
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}
            >
              {chip.label}
            </span>
          </div>

          <p className="mt-1.5 text-[12px] text-muted-foreground" dir="ltr">
            /episodes/{row.slug}
          </p>

          <p className="mt-1 text-[12px] text-muted-foreground">
            {row.guest_name ? `${row.guest_name} · ` : ""}
            {row.expected_date ? formatArabicDate(row.expected_date) : "قريباً"}
            {row.eir_working_title ? ` · ${row.eir_working_title}` : ""}
          </p>

          {row.published_episode_id ? (
            <p className="mt-1 text-[11.5px] font-semibold text-emerald-700">
              الحلقة نزلت — الرابط صار يخدم صفحة الحلقة
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Only a published page has something to look at; a draft link
              would land on the not-found page and look like a broken feature. */}
          {row.status === "published" ? (
            <a
              href={`/episodes/${encodeURIComponent(row.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              افتح
            </a>
          ) : null}

          {canEdit ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                تحرير
              </button>

              {row.status !== "published" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus("published")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  نشر
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus("withdrawn")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 text-[12.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  سحب
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

function UpcomingEditor({
  form,
  setForm,
  eirOptions,
  guestOptions,
  onError,
  onClose,
}: {
  form: FormState
  setForm: (f: FormState | null) => void
  eirOptions: EirOption[]
  guestOptions: GuestOption[]
  onError: (msg: string) => void
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [newAxis, setNewAxis] = useState("")

  const patch = (p: Partial<FormState>) => setForm({ ...form, ...p })

  const moveAxis = (index: number, delta: -1 | 1) => {
    const next = [...form.axes]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    patch({ axes: next })
  }

  const addAxis = () => {
    const value = newAxis.trim()
    if (!value) return
    patch({ axes: [...form.axes, value] })
    setNewAxis("")
  }

  /**
   * Reuses the EXISTING testimonial-audio endpoint — same transcode, same
   * validation, same `ai_runs`-free path. It returns a stored URL and a probed
   * duration and touches no row, so the operator can attach a voice note,
   * change their mind, and leave without saving anything.
   */
  const uploadAudio = async (file: File) => {
    onError("")
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/admin/episodes/testimonial-audio", {
        method: "POST",
        body,
      })
      const data: { url?: string; durationSeconds?: number; error?: string } = await res
        .json()
        .catch(() => ({}))
      if (!res.ok || !data.url) {
        onError(data.error || "تعذّر رفع الملف الصوتي")
        return
      }
      patch({
        guest_message_audio_url: data.url,
        guest_message_audio_duration: data.durationSeconds ?? null,
      })
    } catch {
      onError("تعذّر الاتصال بالخادم أثناء الرفع")
    } finally {
      setUploading(false)
    }
  }

  const save = () => {
    onError("")
    startTransition(async () => {
      const outcome = await runAction(() =>
        saveUpcomingEpisodeAction({
          id: form.id,
          eir_id: form.eir_id,
          slug: form.slug,
          title: form.title,
          guest_id: form.guest_id || null,
          summary: form.summary || null,
          axes: form.axes,
          guest_message: form.guest_message || null,
          guest_message_audio_url: form.guest_message_audio_url || null,
          guest_message_audio_duration: form.guest_message_audio_duration,
          expected_date: form.expected_date || null,
          status: form.status,
        }),
      )
      if (!outcome.ok) return onError(outcome.message)
      if (!outcome.data.success) return onError(outcome.data.error || "تعذّر الحفظ")
      onClose()
    })
  }

  const busy = pending || uploading

  return (
    <section className="space-y-4 rounded-2xl border border-primary/30 bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-bold text-foreground">
          {form.id ? "تحرير صفحة حلقة قادمة" : "صفحة حلقة قادمة جديدة"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
          aria-label="إغلاق المحرّر"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* EIR */}
        <div>
          <label htmlFor="up-eir" className={LABEL}>
            الحلقة (EIR) <span className="text-red-700">*</span>
          </label>
          <select
            id="up-eir"
            value={form.eir_id}
            onChange={(e) => patch({ eir_id: e.target.value })}
            disabled={busy}
            className={FIELD}
          >
            <option value="">— اختر —</option>
            {eirOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label} ({e.phase})
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            صفحة وحدة لكل حلقة مخطّطة.
          </p>
        </div>

        {/* Guest */}
        <div>
          <label htmlFor="up-guest" className={LABEL}>
            الضيف
          </label>
          <select
            id="up-guest"
            value={form.guest_id}
            onChange={(e) => patch({ guest_id: e.target.value })}
            disabled={busy}
            className={FIELD}
          >
            <option value="">— بدون ضيف بعد —</option>
            {guestOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="up-slug" className={LABEL}>
            الرابط (slug) <span className="text-red-700">*</span>
          </label>
          <input
            id="up-slug"
            type="text"
            dir="auto"
            value={form.slug}
            onChange={(e) => patch({ slug: e.target.value })}
            disabled={busy}
            className={FIELD}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            دائم — الحلقة تاخذ نفس الرابط بعد النزول. ما يقبل رابط مستخدم من حلقة
            منشورة أو من صفحة قادمة ثانية.
          </p>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="up-title" className={LABEL}>
            العنوان <span className="text-red-700">*</span>
          </label>
          <input
            id="up-title"
            type="text"
            dir="auto"
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
            disabled={busy}
            className={FIELD}
          />
        </div>

        {/* Date */}
        <div>
          <label htmlFor="up-date" className={LABEL}>
            تاريخ النزول المتوقّع
          </label>
          <input
            id="up-date"
            type="date"
            value={form.expected_date}
            onChange={(e) => patch({ expected_date: e.target.value })}
            disabled={busy}
            className={FIELD}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            اتركه فاضي وبتقول الصفحة «قريباً».
          </p>
        </div>

        {/* Status */}
        <div>
          <label htmlFor="up-status" className={LABEL}>
            الحالة
          </label>
          <select
            id="up-status"
            value={form.status}
            onChange={(e) => patch({ status: e.target.value as UpcomingEpisodeStatus })}
            disabled={busy}
            className={FIELD}
          >
            <option value="draft">مسودة — ما تظهر عام</option>
            <option value="published">منشور — الرابط شغّال</option>
            {/* «يختفي» — NOT «404». The label promised a 404 and this app does
                not send one: `notFound()` returns HTTP 200 with the not-found
                body here, as it does on /guests, /categories and /topics. That
                is a pre-existing, site-wide behaviour and out of scope, but the
                label must describe what actually happens, not what we wish it
                did. The row itself is kept — «مسحوب» is a record, not a delete. */}
            <option value="withdrawn">مسحوب — الصفحة تختفي من الموقع والخريطة (الصف يبقى محفوظ)</option>
          </select>
        </div>

        {/* Summary */}
        <div className="md:col-span-2">
          <label htmlFor="up-summary" className={LABEL}>
            موضوع الحلقة
          </label>
          <textarea
            id="up-summary"
            dir="auto"
            rows={5}
            value={form.summary}
            onChange={(e) => patch({ summary: e.target.value })}
            disabled={busy}
            className={FIELD}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            سطر فاضي بين الفقرات يفصلها في الصفحة.
          </p>
        </div>

        {/* Axes */}
        <div className="md:col-span-2">
          <span className={LABEL}>المحاور</span>
          {form.axes.length > 0 ? (
            <ul className="mb-2 space-y-2">
              {form.axes.map((axis, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center font-mono text-[12px] tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    dir="auto"
                    value={axis}
                    aria-label={`المحور ${i + 1}`}
                    onChange={(e) => {
                      const next = [...form.axes]
                      next[i] = e.target.value
                      patch({ axes: next })
                    }}
                    disabled={busy}
                    className={FIELD}
                  />
                  <button
                    type="button"
                    onClick={() => moveAxis(i, -1)}
                    disabled={busy || i === 0}
                    aria-label={`ارفع المحور ${i + 1}`}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveAxis(i, 1)}
                    disabled={busy || i === form.axes.length - 1}
                    aria-label={`نزّل المحور ${i + 1}`}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ axes: form.axes.filter((_, j) => j !== i) })}
                    disabled={busy}
                    aria-label={`احذف المحور ${i + 1}`}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-center gap-2">
            <input
              type="text"
              dir="auto"
              value={newAxis}
              aria-label="محور جديد"
              placeholder="أضف محوراً…"
              onChange={(e) => setNewAxis(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addAxis()
                }
              }}
              disabled={busy}
              className={FIELD}
            />
            <button
              type="button"
              onClick={addAxis}
              disabled={busy || !newAxis.trim()}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة
            </button>
          </div>
        </div>

        {/* Guest message */}
        <div className="md:col-span-2">
          <label htmlFor="up-message" className={LABEL}>
            كلمة من الضيف قبل النزول
          </label>
          <textarea
            id="up-message"
            dir="auto"
            rows={3}
            value={form.guest_message}
            onChange={(e) => patch({ guest_message: e.target.value })}
            disabled={busy}
            className={FIELD}
          />
          {/* Not a testimonial. The published page's card says «بعد تسجيل
              الحلقة»; this one signs «قبل نزول الحلقة» — an invitation from
              someone who hasn't seen the result either. */}
          <p className="mt-1 text-[11px] text-muted-foreground">
            دعوة، مو شهادة — التوقيع في الصفحة «— {"{"}الاسم{"}"}، قبل نزول الحلقة».
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الرفع…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  ارفع تسجيلاً صوتياً
                </>
              )}
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadAudio(f)
                }}
              />
            </label>

            {form.guest_message_audio_url ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
                <Mic className="h-3.5 w-3.5" />
                تسجيل مرفق
                {form.guest_message_audio_duration
                  ? ` (${Math.round(form.guest_message_audio_duration)}ث)`
                  : ""}
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      guest_message_audio_url: "",
                      guest_message_audio_duration: null,
                    })
                  }
                  disabled={busy}
                  aria-label="احذف التسجيل"
                  className="text-rose-700 disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          حفظ
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          إلغاء
        </button>
      </div>
    </section>
  )
}
