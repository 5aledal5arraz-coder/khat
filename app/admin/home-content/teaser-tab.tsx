"use client"

import { useState, useTransition, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  createTeaserAction,
  updateTeaserAction,
  deleteTeaserAction,
  activateTeaserAction,
  deactivateTeaserAction,
} from "./teaser-actions"
import type { TeaserConfig } from "@/types/teaser"
import type { UpcomingEpisodeOption } from "@/lib/teaser"
import { PHASE_LABEL } from "@/lib/khat-brain/phase-labels"
import {
  Clapperboard,
  Loader2,
  Trash2,
  Upload,
  X,
  ExternalLink,
  AlertTriangle,
  Power,
  PowerOff,
  CheckCircle2,
  Pencil,
} from "lucide-react"

interface Props {
  teasers: TeaserConfig[]
  upcomingEpisodes: UpcomingEpisodeOption[]
}

const MAX_VIDEO_BYTES = 200 * 1024 * 1024

export function TeaserTab({ teasers, upcomingEpisodes }: Props) {
  // ─── Create-form state ───────────────────────────────────────
  const [eirId, setEirId] = useState("")
  const [title, setTitle] = useState("")
  const [videoFilename, setVideoFilename] = useState("")
  const [posterImage, setPosterImage] = useState<string | null>(null)
  const [publishAt, setPublishAt] = useState("")
  const [expireAt, setExpireAt] = useState("")

  const [videoUploading, setVideoUploading] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [posterUploading, setPosterUploading] = useState(false)
  const [error, setError] = useState("")
  const [saving, startSave] = useTransition()

  const activeTeaser = teasers.find((t) => t.isActive) ?? null

  const resetForm = useCallback(() => {
    setEirId("")
    setTitle("")
    setVideoFilename("")
    setPosterImage(null)
    setPublishAt("")
    setExpireAt("")
    setVideoProgress(0)
  }, [])

  // Selecting an episode auto-fills the title from the EIR (Sara note 7) —
  // still editable afterwards.
  const handleEirSelect = useCallback(
    (id: string) => {
      setEirId(id)
      const opt = upcomingEpisodes.find((e) => e.eirId === id)
      if (opt) setTitle(opt.title)
    },
    [upcomingEpisodes],
  )

  // ─── Video upload (XHR for a real progress bar) ──────────────
  const handleVideoUpload = useCallback((file: File) => {
    setError("")
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!ext || !["mp4", "webm"].includes(ext)) {
      setError("صيغة الفيديو غير مدعومة — MP4 أو WebM فقط")
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("حجم الفيديو يتجاوز 200 ميجابايت")
      return
    }
    setVideoUploading(true)
    setVideoProgress(0)
    const form = new FormData()
    form.append("file", file)
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/admin/teaser/upload")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setVideoProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      setVideoUploading(false)
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300 && data.filename) {
          setVideoFilename(data.filename)
        } else {
          setError(data.error || "فشل رفع الفيديو")
        }
      } catch {
        setError("تعذّر قراءة استجابة رفع الفيديو")
      }
    }
    xhr.onerror = () => {
      setVideoUploading(false)
      setError("تعذّر الاتصال أثناء رفع الفيديو")
    }
    xhr.send(form)
  }, [])

  // ─── Poster upload (small — plain fetch) ─────────────────────
  const handlePosterUpload = useCallback(async (file: File) => {
    setError("")
    setPosterUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/admin/content/upload-image", {
        method: "POST",
        body: form,
      })
      const data = await res.json()
      if (res.ok && data.url) setPosterImage(data.url)
      else setError(data.error || "فشل رفع البوستر")
    } catch {
      setError("تعذّر الاتصال أثناء رفع البوستر")
    } finally {
      setPosterUploading(false)
    }
  }, [])

  // ─── Save (create) ───────────────────────────────────────────
  const handleSave = useCallback(() => {
    setError("")
    if (!eirId) return setError("اختر حلقة مرتبطة قبل الحفظ")
    if (!title.trim()) return setError("عنوان التيزر مطلوب")
    if (!videoFilename) return setError("ارفع فيديو التيزر قبل الحفظ")

    const form = new FormData()
    form.append("eirId", eirId)
    form.append("title", title.trim())
    form.append("videoFilename", videoFilename)
    if (posterImage) form.append("posterImage", posterImage)
    if (publishAt) form.append("publishAt", publishAt)
    if (expireAt) form.append("expireAt", expireAt)

    startSave(async () => {
      const res = await createTeaserAction(form)
      if (res.success) resetForm()
      else setError(res.error || "فشل حفظ التيزر")
    })
  }, [eirId, title, videoFilename, posterImage, publishAt, expireAt, resetForm])

  // ─── Row actions ─────────────────────────────────────────────
  const handleActivate = useCallback(
    (t: TeaserConfig) => {
      const victim = teasers.find((x) => x.isActive && x.id !== t.id)
      const msg = victim
        ? `تفعيل هذا التيزر سيوقف التيزر النشط الحالي: «${victim.title}». متابعة؟`
        : "تفعيل هذا التيزر ونشره في الصفحة الرئيسية؟"
      if (!window.confirm(msg)) return
      setError("")
      startSave(async () => {
        const res = await activateTeaserAction(t.id)
        if (!res.success) setError(res.error || "فشل التفعيل")
      })
    },
    [teasers],
  )

  const handleDeactivate = useCallback((t: TeaserConfig) => {
    if (!window.confirm("إيقاف هذا التيزر وإخفاؤه من الصفحة الرئيسية؟")) return
    setError("")
    startSave(async () => {
      const res = await deactivateTeaserAction(t.id)
      if (!res.success) setError(res.error || "فشل الإيقاف")
    })
  }, [])

  const handleDelete = useCallback((t: TeaserConfig) => {
    if (!window.confirm(`حذف التيزر «${t.title}»؟ سيُحذف الفيديو نهائيًا ولا يمكن التراجع.`)) return
    setError("")
    startSave(async () => {
      const res = await deleteTeaserAction(t.id)
      if (!res.success) setError(res.error || "فشل الحذف")
    })
  }, [])

  const busy = saving || videoUploading || posterUploading

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── Create form ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-foreground">
          <Clapperboard className="h-4 w-4 text-primary" />
          تيزر جديد
        </h3>

        {upcomingEpisodes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <p className="text-[13px] font-semibold text-foreground">لا توجد حلقات قادمة</p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
              التيزر يُربط بحلقة قيد الإنتاج قبل نشرها. أنشئ حلقة في خط الإنتاج ثم عُد لهنا.
            </p>
            <Link
              href="/admin/khat-brain/episodes"
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
            >
              الذهاب إلى خط الإنتاج <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Linked episode */}
            <div className="md:col-span-2">
              <label htmlFor="teaser-eir" className="mb-1 block text-[12px] font-semibold text-foreground">
                الحلقة المرتبطة <span className="text-red-700">*</span>
              </label>
              <select
                id="teaser-eir"
                value={eirId}
                onChange={(e) => handleEirSelect(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">— اختر حلقة قادمة —</option>
                {upcomingEpisodes.map((ep) => (
                  <option key={ep.eirId} value={ep.eirId}>
                    {ep.title} — {PHASE_LABEL[ep.phase]}
                    {ep.guestName ? ` — ${ep.guestName}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div className="md:col-span-2">
              <label htmlFor="teaser-title" className="mb-1 block text-[12px] font-semibold text-foreground">
                عنوان التيزر <span className="text-red-700">*</span>
              </label>
              <input
                id="teaser-title"
                type="text"
                dir="auto"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
                placeholder="يُملأ من الحلقة تلقائيًا — قابل للتعديل"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Video */}
            <div>
              <span className="mb-1 block text-[12px] font-semibold text-foreground">
                فيديو التيزر <span className="text-red-700">*</span>
              </span>
              {videoFilename ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> تم رفع الفيديو
                  </span>
                  <button
                    type="button"
                    onClick={() => setVideoFilename("")}
                    disabled={busy}
                    aria-label="إزالة الفيديو المرفوع"
                    className="text-red-700 hover:opacity-80"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2 text-[12px] text-muted-foreground hover:border-primary/50">
                  {videoUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جارٍ الرفع… {videoProgress}%
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      اختر ملف MP4 / WebM (حتى 200MB)
                    </>
                  )}
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleVideoUpload(f)
                    }}
                  />
                </label>
              )}
              {videoUploading && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ inlineSize: `${videoProgress}%` }}
                  />
                </div>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">الأبعاد الموصى بها: 1920×1080 (16:9).</p>
            </div>

            {/* Poster */}
            <div>
              <span className="mb-1 block text-[12px] font-semibold text-foreground">
                البوستر <span className="text-muted-foreground">(اختياري)</span>
              </span>
              {posterImage ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> تم رفع البوستر
                  </span>
                  <button
                    type="button"
                    onClick={() => setPosterImage(null)}
                    disabled={busy}
                    aria-label="إزالة البوستر المرفوع"
                    className="text-red-700 hover:opacity-80"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2 text-[12px] text-muted-foreground hover:border-primary/50">
                  {posterUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> جارٍ الرفع…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" /> اختر صورة
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handlePosterUpload(f)
                    }}
                  />
                </label>
              )}
            </div>

            {/* Window */}
            <div>
              <label htmlFor="teaser-publish" className="mb-1 block text-[12px] font-semibold text-foreground">
                نشر ابتداءً من <span className="text-muted-foreground">(اختياري)</span>
              </label>
              <input
                id="teaser-publish"
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label htmlFor="teaser-expire" className="mb-1 block text-[12px] font-semibold text-foreground">
                ينتهي في <span className="text-muted-foreground">(اختياري)</span>
              </label>
              <input
                id="teaser-expire"
                type="datetime-local"
                value={expireAt}
                onChange={(e) => setExpireAt(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="md:col-span-2">
              <Button onClick={handleSave} disabled={busy} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                حفظ التيزر
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ─── Existing teasers ────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-[15px] font-bold text-foreground">التيزرات ({teasers.length})</h3>
        {teasers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-[13px] text-muted-foreground">
            لا توجد تيزرات بعد. أنشئ واحدًا من الأعلى.
          </p>
        ) : (
          teasers.map((t) => (
            <TeaserRow
              key={t.id}
              teaser={t}
              busy={busy}
              onActivate={handleActivate}
              onDeactivate={handleDeactivate}
              onDelete={handleDelete}
            />
          ))
        )}
        {activeTeaser && (
          <p className="text-[11px] text-muted-foreground">
            التيزر النشط حاليًا: «{activeTeaser.title}». تيزر واحد فقط يظهر في الرئيسية.
          </p>
        )}
      </section>
    </div>
  )
}

// ─── Row ───────────────────────────────────────────────────────

function TeaserRow({
  teaser,
  busy,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  teaser: TeaserConfig
  busy: boolean
  onActivate: (t: TeaserConfig) => void
  onDeactivate: (t: TeaserConfig) => void
  onDelete: (t: TeaserConfig) => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-foreground" dir="auto">
              {teaser.title}
            </span>
            {teaser.isActive ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <Power className="h-3 w-3" /> نشط
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                غير نشط
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {teaser.guestName ? `الضيف: ${teaser.guestName}` : "بلا ضيف معيّن بعد"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {teaser.isActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDeactivate(teaser)}
              disabled={busy}
              className="gap-1.5"
              aria-label="إيقاف التيزر"
            >
              <PowerOff className="h-3.5 w-3.5" /> إيقاف
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onActivate(teaser)}
              disabled={busy}
              className="gap-1.5"
              aria-label="تفعيل التيزر"
            >
              <Power className="h-3.5 w-3.5" /> تفعيل
            </Button>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            disabled={busy}
            aria-label="تعديل التيزر"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(teaser)}
            disabled={busy}
            aria-label="حذف التيزر"
            className="rounded-lg p-2 text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {editing && <TeaserEditForm teaser={teaser} onDone={() => setEditing(false)} />}
    </div>
  )
}

// ─── Inline edit (title / poster / window) ─────────────────────

function TeaserEditForm({ teaser, onDone }: { teaser: TeaserConfig; onDone: () => void }) {
  const [title, setTitle] = useState(teaser.title)
  const [publishAt, setPublishAt] = useState(teaser.publishAt ?? "")
  const [expireAt, setExpireAt] = useState(teaser.expireAt ?? "")
  const [error, setError] = useState("")
  const [saving, startSave] = useTransition()

  const save = () => {
    setError("")
    if (!title.trim()) return setError("عنوان التيزر مطلوب")
    const form = new FormData()
    form.append("title", title.trim())
    if (teaser.posterImage) form.append("posterImage", teaser.posterImage)
    if (publishAt) form.append("publishAt", publishAt)
    if (expireAt) form.append("expireAt", expireAt)
    startSave(async () => {
      const res = await updateTeaserAction(teaser.id, form)
      if (res.success) onDone()
      else setError(res.error || "فشل الحفظ")
    })
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
      <div>
        <label htmlFor={`edit-title-${teaser.id}`} className="mb-1 block text-[12px] font-semibold text-foreground">
          العنوان
        </label>
        <input
          id={`edit-title-${teaser.id}`}
          type="text"
          dir="auto"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`edit-publish-${teaser.id}`} className="mb-1 block text-[12px] font-semibold text-foreground">
            نشر ابتداءً من
          </label>
          <input
            id={`edit-publish-${teaser.id}`}
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            disabled={saving}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label htmlFor={`edit-expire-${teaser.id}`} className="mb-1 block text-[12px] font-semibold text-foreground">
            ينتهي في
          </label>
          <input
            id={`edit-expire-${teaser.id}`}
            type="datetime-local"
            value={expireAt}
            onChange={(e) => setExpireAt(e.target.value)}
            disabled={saving}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          حفظ التعديل
        </Button>
        <Button size="sm" variant="outline" onClick={onDone} disabled={saving}>
          إلغاء
        </Button>
      </div>
    </div>
  )
}
