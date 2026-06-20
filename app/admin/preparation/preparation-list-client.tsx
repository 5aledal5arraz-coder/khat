"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Plus,
  Sparkles,
  Loader2,
  Mic,
  Clock,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  ExternalLink,
  AlertTriangle,
  Search,
  Youtube,
  Globe,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react"
import { formatDateTime } from "@/lib/shared/formatters"
import type {
  EpisodePreparation,
  PreparationStatus,
  PreparationCandidate,
  PreparationGuestIdentity,
} from "@/types/preparation"

const STATUS_LABELS: Record<PreparationStatus, { label: string; bg: string; text: string }> = {
  draft: { label: "مسودة", bg: "bg-neutral-500/10", text: "text-neutral-700" },
  researched: { label: "تم البحث", bg: "bg-sky-500/10", text: "text-sky-700" },
  prepared: { label: "جاهز للمراجعة", bg: "bg-violet-500/10", text: "text-violet-700" },
  reviewed: { label: "تمت المراجعة", bg: "bg-amber-500/10", text: "text-amber-700" },
  approved: { label: "معتمدة", bg: "bg-emerald-500/10", text: "text-emerald-700" },
}

type WizardStep = "inputs" | "candidates" | "confirm"

interface Props {
  initialItems: EpisodePreparation[]
}

type ListFilter = "active" | "archived" | "all"

const FILTER_OPTIONS: { value: ListFilter; label: string }[] = [
  { value: "active", label: "نشطة" },
  { value: "archived", label: "مؤرشفة" },
  { value: "all", label: "الكل" },
]

export function PreparationListClient({ initialItems }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState<ListFilter>("active")
  const [showModal, setShowModal] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const refreshList = async (f: ListFilter = filter) => {
    const res = await fetch(`/api/admin/preparation?filter=${f}`, {
      cache: "no-store",
    })
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
    }
  }

  const handleFilterChange = (f: ListFilter) => {
    setFilter(f)
    refreshList(f)
  }

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setActionBusy(id)
    await fetch(`/api/admin/preparation/${id}/archive`, {
      method: "POST",
      headers: { "x-requested-with": "khat" },
    })
    await refreshList()
    setActionBusy(null)
  }

  const handleRestore = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setActionBusy(id)
    await fetch(`/api/admin/preparation/${id}/restore`, {
      method: "POST",
      headers: { "x-requested-with": "khat" },
    })
    await refreshList()
    setActionBusy(null)
  }

  const handleDelete = async (id: string) => {
    setActionBusy(id)
    await fetch(`/api/admin/preparation/${id}`, {
      method: "DELETE",
      headers: { "x-requested-with": "khat" },
    })
    setDeleteConfirmId(null)
    await refreshList()
    setActionBusy(null)
  }

  // ─── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>("inputs")
  const [title, setTitle] = useState("")
  const [guestName, setGuestName] = useState("")
  const [guestDescription, setGuestDescription] = useState("")
  const [guestProfileLink, setGuestProfileLink] = useState("")
  const [candidates, setCandidates] = useState<PreparationCandidate[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [searchWarning, setSearchWarning] = useState<string | null>(null)

  const [searching, startSearch] = useTransition()
  const [creating, startCreate] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const resetWizard = () => {
    setStep("inputs")
    setTitle("")
    setGuestName("")
    setGuestDescription("")
    setGuestProfileLink("")
    setCandidates([])
    setSelectedCandidateId(null)
    setSearchWarning(null)
    setError(null)
  }

  const closeModal = () => {
    setShowModal(false)
    resetWizard()
  }

  // ─── Step 1 → Step 2: fetch candidates ─────────────────────────────────────
  const handleFindCandidates = () => {
    setError(null)
    if (!title.trim()) {
      setError("عنوان الحلقة مطلوب")
      return
    }
    if (!guestName.trim()) {
      setError("اسم الضيف مطلوب")
      return
    }
    if (guestDescription.trim().length < 10) {
      setError("الوصف مطلوب (10 أحرف على الأقل لتمييز الضيف)")
      return
    }

    startSearch(async () => {
      try {
        const res = await fetch("/api/admin/preparation/identify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-requested-with": "khat",
          },
          body: JSON.stringify({
            guest_name: guestName.trim(),
            guest_description: guestDescription.trim(),
            guest_profile_link: guestProfileLink.trim() || null,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "فشل البحث")
          return
        }
        const list = (data.candidates ?? []) as PreparationCandidate[]
        if (list.length === 0) {
          setError(
            "لم يتم العثور على أي مرشحين. جرّب وصفاً أدق أو أضف رابط ملف شخصي.",
          )
          return
        }
        setCandidates(list)
        setSelectedCandidateId(null)
        setSearchWarning(
          data.gemini_empty
            ? "البحث الأساسي لم يعطِ نتائج — النتائج أدناه من يوتيوب فقط."
            : null,
        )
        setStep("candidates")
      } catch {
        setError("فشل الاتصال — حاول مرة أخرى")
      }
    })
  }

  // ─── Step 2 → Step 3: go to confirmation ───────────────────────────────────
  const handleGoToConfirm = () => {
    if (!selectedCandidateId) {
      setError("اختر مرشحاً واحداً أو ارجع لتعديل الوصف")
      return
    }
    setError(null)
    setStep("confirm")
  }

  // ─── Step 3 → Create: POST the preparation ─────────────────────────────────
  const handleConfirmAndCreate = () => {
    const picked = candidates.find((c) => c.id === selectedCandidateId)
    if (!picked) {
      setError("اختيار غير صالح")
      return
    }

    const identity: Omit<PreparationGuestIdentity, "confirmed_at" | "confirmed_by"> = {
      name: picked.name,
      description: picked.description,
      source_provider: picked.source_provider,
      source_url: picked.source_url,
      source_title: picked.source_title,
      avatar_url: picked.avatar_url ?? null,
      profile_link: guestProfileLink.trim() || null,
    }

    startCreate(async () => {
      const res = await fetch("/api/admin/preparation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "khat",
        },
        body: JSON.stringify({
          title: title.trim(),
          guest_name: picked.name,
          guest_description: guestDescription.trim(),
          guest_profile_link: guestProfileLink.trim() || null,
          guest_identity: identity,
          depth_level: 3,
          boldness_level: 3,
          key_questions: [],
          content_focus: [],
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "فشل الإنشاء")
        return
      }
      closeModal()
      router.push(`/admin/preparation/${data.preparation.id}`)
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/5 px-3 py-1 text-[11px] font-medium text-violet-700">
            <Sparkles className="h-3 w-3" />
            استوديو إعداد الحلقات
          </div>
          <h1 className="text-2xl font-bold">إعداد الحلقة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            نظام متكامل لتحضير الحلقات قبل التسجيل: بحث عميق، بنية حوار، أسئلة ذكية، ووضع مباشر أثناء التسجيل.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          جلسة إعداد جديدة
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-card/30 p-1">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleFilterChange(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === opt.value
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/40 bg-card/30 p-12 text-center">
          <Mic className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">لا توجد جلسات إعداد بعد</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ابدأ بإنشاء جلسة جديدة لتحضير حلقة قادمة
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const status = STATUS_LABELS[item.status]
            const sectionsReady = Object.values(item.sections_status).filter(
              (s) => s?.status === "ready",
            ).length
            const missingIdentity = !item.guest_identity
            return (
              <Link
                key={item.id}
                href={`/admin/preparation/${item.id}`}
                className="group rounded-2xl border border-border/40 bg-card/50 p-5 transition-all hover:border-violet-500/30 hover:bg-card"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-[15px] font-semibold">{item.title}</h3>
                    {item.guest_name && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        مع {item.guest_name}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.bg} ${status.text}`}
                  >
                    {status.label}
                  </span>
                </div>

                {item.archived_at && (
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-neutral-500/30 bg-neutral-500/5 px-2 py-1 text-[10px] text-neutral-700">
                    <Archive className="h-3 w-3" />
                    مؤرشف
                  </div>
                )}

                {missingIdentity && (
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    هوية الضيف غير مؤكدة
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDateTime(item.updated_at)}
                  </span>
                  <span>{sectionsReady} قسم جاهز</span>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="inline-flex items-center gap-1 text-[11px] text-violet-700 opacity-0 transition-opacity group-hover:opacity-100">
                    فتح الجلسة
                    <ArrowLeft className="h-3 w-3" />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {item.archived_at ? (
                      <button
                        type="button"
                        onClick={(e) => handleRestore(item.id, e)}
                        disabled={actionBusy === item.id}
                        title="استرجاع"
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-700"
                      >
                        {actionBusy === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleArchive(item.id, e)}
                        disabled={actionBusy === item.id}
                        title="أرشفة"
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-700"
                      >
                        {actionBusy === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Archive className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDeleteConfirmId(item.id)
                      }}
                      disabled={actionBusy === item.id}
                      title="حذف"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10">
                <Trash2 className="h-5 w-5 text-rose-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold">حذف الإعداد</h3>
                <p className="text-[11px] text-muted-foreground">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>
            <p className="mb-5 text-xs text-muted-foreground">
              هل أنت متأكد من حذف هذا الإعداد؟ لن يظهر بعد ذلك في أي قائمة.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={actionBusy === deleteConfirmId}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {actionBusy === deleteConfirmId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wizard modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl">
            {/* Wizard header */}
            <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold">جلسة إعداد جديدة</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {step === "inputs" && "الخطوة 1 من 3 — معلومات الضيف"}
                  {step === "candidates" && "الخطوة 2 من 3 — اختيار الهوية الصحيحة"}
                  {step === "confirm" && "الخطوة 3 من 3 — تأكيد"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Progress indicator */}
            <div className="flex items-center gap-2 px-6 pt-4">
              {(["inputs", "candidates", "confirm"] as WizardStep[]).map((s, i) => {
                const active =
                  step === s ||
                  (s === "inputs" && step !== "inputs") ||
                  (s === "candidates" && step === "confirm")
                return (
                  <div
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      active ? "bg-violet-500" : "bg-border/40"
                    }`}
                  />
                )
              })}
            </div>

            <div className="space-y-5 p-6">
              {/* ─── Step 1: Inputs ─────────────────────────────────── */}
              {step === "inputs" && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      عنوان الحلقة <span className="text-rose-700">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="مثال: محادثة حول الفقد والكتابة"
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-violet-500 focus:outline-none"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      اسم الضيف <span className="text-rose-700">*</span>
                    </label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="مثال: أحمد الشقيري"
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-violet-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      وصف الضيف <span className="text-rose-700">*</span>
                    </label>
                    <textarea
                      value={guestDescription}
                      onChange={(e) => setGuestDescription(e.target.value)}
                      placeholder="مثال: كاتب ومقدم برامج سعودي، عُرف ببرنامج خواطر"
                      rows={3}
                      className="w-full resize-none rounded-lg border border-input bg-background p-3 text-sm focus:border-violet-500 focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      سيتم استخدام هذا الوصف لتمييز الشخص الصحيح إذا كان هناك أكثر من شخص بنفس الاسم.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      رابط ملف شخصي (اختياري)
                    </label>
                    <input
                      type="url"
                      value={guestProfileLink}
                      onChange={(e) => setGuestProfileLink(e.target.value)}
                      placeholder="https://... (موقع، يوتيوب، أو حساب رسمي)"
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-violet-500 focus:outline-none"
                      dir="ltr"
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-700">
                      {error}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={searching}
                      className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleFindCandidates}
                      disabled={searching}
                      className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
                    >
                      {searching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      {searching ? "جارٍ البحث..." : "البحث عن مرشحين"}
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}

              {/* ─── Step 2: Candidates ──────────────────────────────── */}
              {step === "candidates" && (
                <>
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-violet-700">
                    تم العثور على {candidates.length} مرشح{candidates.length === 1 ? "" : "ين"}.
                    اختر الشخص الصحيح من القائمة أدناه. إذا لم يكن أي منهم صحيحاً، ارجع لتعديل الوصف.
                  </div>

                  {searchWarning && (
                    <div className="inline-flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{searchWarning}</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {candidates.map((c) => {
                      const selected = selectedCandidateId === c.id
                      const ProviderIcon =
                        c.source_provider === "youtube" ? Youtube : Globe
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => setSelectedCandidateId(c.id)}
                          className={`w-full rounded-xl border p-4 text-right transition-all ${
                            selected
                              ? "border-violet-500 bg-violet-500/10"
                              : "border-border/40 bg-card/30 hover:border-violet-500/30 hover:bg-card/60"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {c.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={c.avatar_url}
                                alt=""
                                className="h-12 w-12 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted/40 text-sm font-bold text-muted-foreground">
                                {c.name.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="truncate text-sm font-bold">{c.name}</h3>
                                {selected && (
                                  <Check className="h-4 w-4 shrink-0 text-violet-700" />
                                )}
                              </div>
                              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                                {c.description}
                              </p>
                              <div
                                className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"
                                dir="ltr"
                              >
                                <ProviderIcon className="h-3 w-3" />
                                <span className="truncate">{c.source_title}</span>
                                <a
                                  href={c.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-0.5 text-violet-700 hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {error && (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-700">
                      {error}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("inputs")
                        setError(null)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <ArrowRight className="h-4 w-4" />
                      لا أحد منهم — تعديل الوصف
                    </button>
                    <button
                      type="button"
                      onClick={handleGoToConfirm}
                      disabled={!selectedCandidateId}
                      className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
                    >
                      متابعة للتأكيد
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}

              {/* ─── Step 3: Confirm ─────────────────────────────────── */}
              {step === "confirm" && (
                <>
                  {(() => {
                    const picked = candidates.find((c) => c.id === selectedCandidateId)
                    if (!picked) return null
                    const ProviderIcon =
                      picked.source_provider === "youtube" ? Youtube : Globe
                    return (
                      <>
                        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
                          <div className="mb-3 text-center text-sm font-semibold text-violet-700">
                            هل هذا هو الشخص الصحيح؟
                          </div>
                          <div className="flex items-start gap-4">
                            {picked.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={picked.avatar_url}
                                alt=""
                                className="h-16 w-16 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted/40 text-xl font-bold text-muted-foreground">
                                {picked.name.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <h3 className="text-lg font-bold">{picked.name}</h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {picked.description}
                              </p>
                              <a
                                href={picked.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[11px] text-violet-700 hover:bg-muted/20"
                                dir="ltr"
                              >
                                <ProviderIcon className="h-3 w-3" />
                                <span className="truncate">{picked.source_title}</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-[11px] text-muted-foreground">
                          <strong className="text-foreground">تنبيه:</strong> سيتم استخدام هذه الهوية
                          (وليس الاسم الخام) في جميع مراحل البحث والتوليد. إذا اخترت الشخص الخطأ هنا،
                          فإن الإعداد بأكمله سيكون عن شخص غير صحيح.
                        </div>

                        {error && (
                          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-700">
                            {error}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setStep("candidates")
                              setError(null)
                            }}
                            disabled={creating}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                          >
                            <ArrowRight className="h-4 w-4" />
                            لا، رجوع
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmAndCreate}
                            disabled={creating}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                          >
                            {creating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            نعم، إنشاء الجلسة
                          </button>
                        </div>
                      </>
                    )
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
