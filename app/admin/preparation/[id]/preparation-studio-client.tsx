"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Sparkles,
  Loader2,
  Search,
  FileText,
  Target,
  Users as UsersIcon,
  GitBranch,
  MessageCircleQuestion,
  Compass,
  Quote,
  Flame,
  Radio,
  Copy,
  Check,
  RotateCcw,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  PencilLine,
  Save,
  Lightbulb,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Trash2,
  Layers,
} from "lucide-react"
import { formatDateTime } from "@/lib/shared/formatters"
import { CardsPanel } from "./cards-panel"
import type {
  EpisodePreparation,
  PreparationContentFocus,
  PreparationFocusMode,
  PreparationSectionKey,
  PreparationStatus,
  PreparationToneType,
  PreparationInputs,
  PreparationQuestionBucket,
  PreparationCandidate,
} from "@/types/preparation"

// ─── Constants ──────────────────────────────────────────────────────────────

const TONE_OPTIONS: { value: PreparationToneType; label: string }[] = [
  { value: "calm", label: "هادئ" },
  { value: "deep", label: "عميق" },
  { value: "emotional", label: "عاطفي" },
  { value: "controversial", label: "جدلي" },
  { value: "intellectual", label: "فكري" },
  { value: "light", label: "خفيف" },
]

const FOCUS_MODE_OPTIONS: { value: PreparationFocusMode; label: string }[] = [
  { value: "guest", label: "مُحوَر حول الضيف" },
  { value: "topic", label: "مُحوَر حول الموضوع" },
  { value: "hybrid", label: "هجين" },
]

const CONTENT_FOCUS_OPTIONS: { value: PreparationContentFocus; label: string }[] = [
  { value: "emotions", label: "مشاعر" },
  { value: "ideas", label: "أفكار" },
  { value: "stories", label: "قصص" },
  { value: "conflict", label: "صراع" },
  { value: "practical", label: "رؤى عملية" },
  { value: "surprises", label: "مفاجآت" },
]

const STATUS_META: Record<
  PreparationStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  draft: {
    label: "مسودة",
    bg: "bg-neutral-500/10",
    text: "text-neutral-700",
    border: "border-neutral-500/20",
  },
  researched: {
    label: "تم البحث",
    bg: "bg-sky-500/10",
    text: "text-sky-700",
    border: "border-sky-500/20",
  },
  prepared: {
    label: "جاهز للمراجعة",
    bg: "bg-violet-500/10",
    text: "text-violet-700",
    border: "border-violet-500/20",
  },
  reviewed: {
    label: "تمت المراجعة",
    bg: "bg-amber-500/10",
    text: "text-amber-700",
    border: "border-amber-500/20",
  },
  approved: {
    label: "معتمدة",
    bg: "bg-emerald-500/10",
    text: "text-emerald-700",
    border: "border-emerald-500/20",
  },
}

/** Only these statuses can be clicked in the footer — the rest are auto. */
const MANUAL_STATUSES: PreparationStatus[] = ["draft", "reviewed", "approved"]

/**
 * Client-side mirror of `isResearchUsable` in lib/preparation/queries.ts.
 * Must stay in sync with the server gate — both are consulted when deciding
 * whether "توليد كل الأقسام" is clickable.
 */
function isResearchUsableClient(prep: EpisodePreparation): boolean {
  const r = prep.research_data
  if (!r) return false
  if (prep.sections_status.research?.status !== "ready") return false
  if (!Array.isArray(r.sources) || r.sources.length === 0) return false
  if (!Array.isArray(r.claims) || r.claims.length === 0) return false
  return true
}

const BUCKET_META: Record<PreparationQuestionBucket, { label: string; color: string }> = {
  opening: { label: "افتتاح", color: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
  deep: { label: "عميق", color: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20" },
  escalation: { label: "تصعيد", color: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
  surprise: { label: "مفاجأة", color: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/20" },
  backup: { label: "احتياطي", color: "bg-neutral-500/10 text-neutral-700 border-neutral-500/20" },
  recovery: { label: "إنقاذ", color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
}

type TabKey = "inputs" | "overview" | "research" | "flow" | "questions" | "cards" | "live"

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "inputs", label: "المُدخلات", icon: PencilLine },
  { key: "overview", label: "نظرة عامة", icon: FileText },
  { key: "research", label: "البحث", icon: Search },
  { key: "flow", label: "المسار", icon: GitBranch },
  { key: "questions", label: "الأسئلة", icon: MessageCircleQuestion },
  { key: "cards", label: "البطاقات", icon: Layers },
  { key: "live", label: "الوضع المباشر", icon: Radio },
]

// ─── Main component ─────────────────────────────────────────────────────────

interface Props {
  initial: EpisodePreparation
}

export function PreparationStudioClient({ initial }: Props) {
  const [prep, setPrep] = useState<EpisodePreparation>(initial)
  const [activeTab, setActiveTab] = useState<TabKey>(
    initial.research_data ? "overview" : "inputs",
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [liveToken, setLiveToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** One-shot notice shown after an action invalidated a human signoff. */
  const [notice, setNotice] = useState<string | null>(null)
  /** Re-identify dialog state (for legacy drafts without a confirmed identity). */
  const [showIdentifyDialog, setShowIdentifyDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const handleArchiveToggle = useCallback(async () => {
    setBusy("lifecycle")
    setError(null)
    const action = prep.archived_at ? "restore" : "archive"
    const res = await fetch(`/api/admin/preparation/${prep.id}/${action}`, {
      method: "POST",
      headers: { "x-requested-with": "khat" },
    })
    if (res.ok) {
      const data = await res.json()
      setPrep(data.preparation)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || `فشل ${action === "archive" ? "الأرشفة" : "الاسترجاع"}`)
    }
    setBusy(null)
  }, [prep.id, prep.archived_at])

  const handleDelete = useCallback(async () => {
    setBusy("lifecycle")
    setError(null)
    const res = await fetch(`/api/admin/preparation/${prep.id}`, {
      method: "DELETE",
      headers: { "x-requested-with": "khat" },
    })
    if (res.ok) {
      window.location.href = "/admin/preparation"
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || "فشل الحذف")
      setShowDeleteDialog(false)
      setBusy(null)
    }
  }, [prep.id])

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/preparation/${prep.id}`, { cache: "no-store" })
    if (res.ok) {
      const data = await res.json()
      setPrep(data.preparation)
    }
  }, [prep.id])

  const runResearch = useCallback(async () => {
    setError(null)
    setNotice(null)
    setBusy("research")
    try {
      const res = await fetch(`/api/admin/preparation/${prep.id}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "فشل البحث")
      setPrep(data.preparation)
      setActiveTab("research")
      if (data.review_lost) {
        setNotice(
          "تم إعادة تشغيل البحث — أساس البحث تغيّر، ويجب إعادة توليد الأقسام ثم مراجعة الإعداد مجدداً.",
        )
      }
      if (data.research_usable === false) {
        setError(
          data.warning ||
            "البحث الحالي فارغ أو غير قابل للاستخدام — أعد المحاولة قبل توليد الأقسام.",
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل البحث")
    } finally {
      setBusy(null)
    }
  }, [prep.id])

  const generateAll = useCallback(async () => {
    setError(null)
    setNotice(null)
    setBusy("generate")
    try {
      const res = await fetch(`/api/admin/preparation/${prep.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "فشل التوليد")
      setPrep(data.preparation)
      if (data.review_lost) {
        setNotice(
          "تغيّر الإعداد بعد المراجعة — يجب مراجعة الإعداد مجدداً قبل الاعتماد.",
        )
      }
      if (data.errors && data.errors.length > 0) {
        setError(`تم التوليد مع أخطاء في: ${data.errors.map((e: { section: string }) => e.section).join("، ")}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل التوليد")
    } finally {
      setBusy(null)
    }
  }, [prep.id])

  const regenerateSection = useCallback(
    async (section: PreparationSectionKey) => {
      setError(null)
      setNotice(null)
      setBusy(section)
      try {
        const res = await fetch(`/api/admin/preparation/${prep.id}/regenerate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
          body: JSON.stringify({ section }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "فشل التوليد")
        setPrep(data.preparation)
        if (data.review_lost) {
          setNotice(
            "تم تعديل قسم بعد المراجعة — يجب مراجعة الإعداد مجدداً قبل الاعتماد.",
          )
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل التوليد")
      } finally {
        setBusy(null)
      }
    },
    [prep.id],
  )

  const rotateToken = useCallback(async () => {
    setError(null)
    setNotice(null)
    setBusy("rotate")
    try {
      const res = await fetch(`/api/admin/preparation/${prep.id}/rotate-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "فشل تدوير الرابط")
      setPrep(data.preparation)
      if (data.liveToken) {
        setLiveToken(data.liveToken)
        setNotice(
          "تم تدوير الرابط المباشر — الرابط القديم توقّف الآن، احفظ الرابط الجديد فهو يُعرض مرة واحدة فقط.",
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تدوير الرابط")
    } finally {
      setBusy(null)
    }
  }, [prep.id])

  const changeStatus = useCallback(
    async (next: PreparationStatus) => {
      setError(null)
      setBusy("status")
      try {
        const res = await fetch(`/api/admin/preparation/${prep.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
          body: JSON.stringify({ status: next }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "فشل التحديث")
        setPrep(data.preparation)
        if (data.liveToken) setLiveToken(data.liveToken)
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل التحديث")
      } finally {
        setBusy(null)
      }
    },
    [prep.id],
  )

  const saveInputs = useCallback(
    async (patch: Partial<PreparationInputs>) => {
      const res = await fetch(`/api/admin/preparation/${prep.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        const data = await res.json()
        setPrep(data.preparation)
      }
    },
    [prep.id],
  )

  const statusMeta = STATUS_META[prep.status]
  const sectionsReady = useMemo(
    () => Object.values(prep.sections_status).filter((s) => s?.status === "ready").length,
    [prep.sections_status],
  )
  const researchUsable = useMemo(() => isResearchUsableClient(prep), [prep])
  /**
   * Empty-research warning: show a banner when research has been run but
   * yielded nothing usable (no sources or no claims). The generate button
   * is also disabled in this case.
   */
  const researchEmptyReason = useMemo<string | null>(() => {
    const r = prep.research_data
    if (!r) return null
    if (prep.sections_status.research?.status === "generating") return null
    if (r.sources.length === 0) {
      return "لم يتم العثور على أي مصادر — أعد تشغيل البحث قبل توليد الأقسام."
    }
    if (r.claims.length === 0) {
      return "المُدقق رفض جميع الادعاءات — راجع المصادر أو أعد تشغيل البحث قبل توليد الأقسام."
    }
    return null
  }, [prep.research_data, prep.sections_status])

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      {/* Breadcrumb + header */}
      <Link
        href="/admin/preparation"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="h-3 w-3" />
        العودة إلى الإعدادات
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border/40 bg-card/50 p-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}
            >
              {statusMeta.label}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {sectionsReady}/9 قسم جاهز
            </span>
            <span className="text-[10px] text-muted-foreground">
              آخر تحديث: {formatDateTime(prep.updated_at)}
            </span>
          </div>
          <h1 className="text-xl font-bold">{prep.title}</h1>
          {prep.guest_name && (
            <p className="mt-0.5 text-sm text-muted-foreground">مع {prep.guest_name}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runResearch}
            disabled={busy !== null || !prep.guest_identity}
            title={
              !prep.guest_identity
                ? "يجب تأكيد هوية الضيف قبل تشغيل البحث"
                : undefined
            }
            className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-[13px] font-medium transition-colors hover:bg-muted/40 disabled:opacity-50"
          >
            {busy === "research" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {prep.research_data ? "إعادة البحث" : "تشغيل البحث"}
          </button>
          <button
            type="button"
            onClick={generateAll}
            disabled={busy !== null || !researchUsable}
            title={
              !researchUsable
                ? "يجب تشغيل بحث قابل للاستخدام (مصادر وادعاءات غير فارغة) قبل التوليد"
                : undefined
            }
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy === "generate" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            توليد كل الأقسام
          </button>

          {/* Archive / Restore */}
          <button
            type="button"
            onClick={handleArchiveToggle}
            disabled={busy !== null}
            title={prep.archived_at ? "استرجاع" : "أرشفة"}
            className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-[13px] font-medium transition-colors hover:bg-muted/40 disabled:opacity-50"
          >
            {busy === "lifecycle" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : prep.archived_at ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {prep.archived_at ? "استرجاع" : "أرشفة"}
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            disabled={busy !== null}
            title="حذف"
            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-background px-3 py-2 text-[13px] font-medium text-rose-700 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </button>
        </div>
      </div>

      {prep.archived_at && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-500/40 bg-neutral-500/10 p-3 text-xs text-neutral-700">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            <span>هذا الإعداد مؤرشف ولن يظهر في القائمة الرئيسية.</span>
          </div>
          <button
            type="button"
            onClick={handleArchiveToggle}
            disabled={busy !== null}
            className="shrink-0 rounded-md border border-neutral-400/40 bg-neutral-500/20 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-500/30"
          >
            استرجاع
          </button>
        </div>
      )}

      {!prep.guest_identity && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
          <div>
            <strong className="font-semibold">هوية الضيف غير مؤكدة. </strong>
            هذه جلسة قديمة بدون تأكيد هوية. لا يمكن تشغيل البحث حتى يتم اختيار الشخص الصحيح.
          </div>
          <button
            type="button"
            onClick={() => setShowIdentifyDialog(true)}
            className="shrink-0 rounded-md border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/30"
          >
            تأكيد الهوية
          </button>
        </div>
      )}

      {researchEmptyReason && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
          <strong className="font-semibold">البحث غير قابل للاستخدام: </strong>
          {researchEmptyReason}
        </div>
      )}

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 rounded px-1 text-amber-700/80 hover:text-amber-700"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border/40 bg-card/30 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex flex-1 min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors ${
                active
                  ? "bg-violet-500/15 text-violet-700"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="truncate">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab bodies */}
      <div className="min-h-[400px]">
        {activeTab === "inputs" && <InputsPanel prep={prep} onSave={saveInputs} />}
        {activeTab === "overview" && (
          <OverviewPanel
            prep={prep}
            busy={busy}
            onRegenerate={regenerateSection}
            onStatusChange={changeStatus}
            liveToken={liveToken}
          />
        )}
        {activeTab === "research" && (
          <ResearchPanel prep={prep} busy={busy} onRerun={runResearch} />
        )}
        {activeTab === "flow" && (
          <FlowPanel prep={prep} busy={busy} onRegenerate={regenerateSection} />
        )}
        {activeTab === "questions" && (
          <QuestionsPanel prep={prep} busy={busy} onRegenerate={regenerateSection} />
        )}
        {activeTab === "cards" && <CardsPanel prep={prep} />}
        {activeTab === "live" && (
          <LivePanel
            prep={prep}
            liveToken={liveToken}
            busy={busy}
            onRotate={rotateToken}
          />
        )}
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
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
                onClick={() => setShowDeleteDialog(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy === "lifecycle"}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {busy === "lifecycle" ? (
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

      {showIdentifyDialog && (
        <ReIdentifyDialog
          prep={prep}
          onClose={() => setShowIdentifyDialog(false)}
          onConfirmed={(updated) => {
            setPrep(updated)
            setShowIdentifyDialog(false)
            setNotice("تم تأكيد هوية الضيف — يمكنك الآن تشغيل البحث.")
          }}
        />
      )}
    </div>
  )
}

// ─── Re-identify dialog (legacy drafts) ─────────────────────────────────────

function ReIdentifyDialog({
  prep,
  onClose,
  onConfirmed,
}: {
  prep: EpisodePreparation
  onClose: () => void
  onConfirmed: (updated: EpisodePreparation) => void
}) {
  const [step, setStep] = useState<"inputs" | "candidates">("inputs")
  const [guestName, setGuestName] = useState(prep.guest_name ?? "")
  const [description, setDescription] = useState(prep.guest_description ?? "")
  const [profileLink, setProfileLink] = useState(prep.guest_profile_link ?? "")
  const [candidates, setCandidates] = useState<PreparationCandidate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const findCandidates = async () => {
    setErr(null)
    if (!guestName.trim()) return setErr("اسم الضيف مطلوب")
    if (description.trim().length < 10) return setErr("الوصف مطلوب (10 أحرف على الأقل)")
    setSearching(true)
    try {
      const res = await fetch("/api/admin/preparation/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({
          guest_name: guestName.trim(),
          guest_description: description.trim(),
          guest_profile_link: profileLink.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error || "فشل البحث")
        return
      }
      const list = (data.candidates ?? []) as PreparationCandidate[]
      if (list.length === 0) {
        setErr("لا يوجد مرشحون — عدّل الوصف")
        return
      }
      setCandidates(list)
      setSelectedId(null)
      setStep("candidates")
    } finally {
      setSearching(false)
    }
  }

  const confirmPick = async () => {
    const picked = candidates.find((c) => c.id === selectedId)
    if (!picked) return setErr("اختر مرشحاً")
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/preparation/${prep.id}/identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({
          name: picked.name,
          description: picked.description,
          source_provider: picked.source_provider,
          source_url: picked.source_url,
          source_title: picked.source_title,
          avatar_url: picked.avatar_url ?? null,
          profile_link: profileLink.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error || "فشل الحفظ")
        return
      }
      // Also persist the description + link on the inputs row so re-runs
      // use the same values.
      await fetch(`/api/admin/preparation/${prep.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({
          guest_description: description.trim(),
          guest_profile_link: profileLink.trim() || null,
        }),
      })
      onConfirmed(data.preparation)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">تأكيد هوية الضيف</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/40"
          >
            ✕
          </button>
        </div>

        {step === "inputs" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold">اسم الضيف *</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">وصف الضيف *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-input bg-background p-3 text-sm focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">رابط ملف شخصي (اختياري)</label>
              <input
                type="url"
                value={profileLink}
                onChange={(e) => setProfileLink(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-violet-500 focus:outline-none"
                dir="ltr"
              />
            </div>
            {err && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-700">
                {err}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={findCandidates}
                disabled={searching}
                className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                البحث عن مرشحين
              </button>
            </div>
          </div>
        )}

        {step === "candidates" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">اختر الشخص الصحيح:</p>
            {candidates.map((c) => {
              const selected = c.id === selectedId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-xl border p-3 text-right transition-colors ${
                    selected
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-border/40 bg-card/30 hover:border-violet-500/30"
                  }`}
                >
                  <h3 className="text-sm font-bold">{c.name}</h3>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {c.description}
                  </p>
                  <a
                    href={c.source_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 inline-block text-[10px] text-violet-700 hover:underline"
                    dir="ltr"
                  >
                    {c.source_title}
                  </a>
                </button>
              )
            })}
            {err && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-700">
                {err}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep("inputs")}
                className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                تعديل الوصف
              </button>
              <button
                type="button"
                onClick={confirmPick}
                disabled={!selectedId || saving}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                نعم، تأكيد
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Inputs panel ───────────────────────────────────────────────────────────

function InputsPanel({
  prep,
  onSave,
}: {
  prep: EpisodePreparation
  onSave: (patch: Partial<PreparationInputs>) => Promise<void>
}) {
  const [draft, setDraft] = useState<PreparationInputs>({
    title: prep.title,
    guest_name: prep.guest_name,
    guest_description: prep.guest_description,
    guest_profile_link: prep.guest_profile_link,
    short_description: prep.short_description,
    episode_goal: prep.episode_goal,
    key_questions: prep.key_questions,
    tone_type: prep.tone_type,
    focus_mode: prep.focus_mode,
    expected_duration_min: prep.expected_duration_min,
    depth_level: prep.depth_level,
    boldness_level: prep.boldness_level,
    content_focus: prep.content_focus,
  })
  const [newQuestion, setNewQuestion] = useState("")
  const [saving, startSave] = useTransition()
  const [saved, setSaved] = useState(false)

  const update = <K extends keyof PreparationInputs>(key: K, value: PreparationInputs[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    startSave(async () => {
      await onSave(draft)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const toggleFocus = (v: PreparationContentFocus) => {
    update(
      "content_focus",
      draft.content_focus.includes(v)
        ? draft.content_focus.filter((x) => x !== v)
        : [...draft.content_focus, v],
    )
  }

  const addQuestion = () => {
    if (!newQuestion.trim()) return
    update("key_questions", [...draft.key_questions, newQuestion.trim()])
    setNewQuestion("")
  }

  const removeQuestion = (i: number) => {
    update(
      "key_questions",
      draft.key_questions.filter((_, idx) => idx !== i),
    )
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border/40 bg-card/40 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">مدخلات الحلقة</h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saved ? "تم الحفظ" : "حفظ"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="عنوان الحلقة *">
          <input
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
            className="field"
          />
        </Field>
        <Field label="اسم الضيف">
          <input
            value={draft.guest_name ?? ""}
            onChange={(e) => update("guest_name", e.target.value || null)}
            className="field"
          />
        </Field>
      </div>

      <Field label="وصف مختصر">
        <textarea
          value={draft.short_description ?? ""}
          onChange={(e) => update("short_description", e.target.value || null)}
          rows={3}
          className="field"
        />
      </Field>

      <Field label="هدف الحلقة">
        <textarea
          value={draft.episode_goal ?? ""}
          onChange={(e) => update("episode_goal", e.target.value || null)}
          rows={3}
          className="field"
        />
      </Field>

      <Field label="أسئلة أساسية">
        <div className="space-y-2">
          {draft.key_questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[10px] font-semibold text-violet-700">
                {i + 1}
              </span>
              <div className="flex-1 rounded-lg border border-border/40 bg-background px-3 py-2 text-sm">
                {q}
              </div>
              <button
                type="button"
                onClick={() => removeQuestion(i)}
                className="text-muted-foreground transition-colors hover:text-rose-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addQuestion()
                }
              }}
              placeholder="أضف سؤالاً..."
              className="field flex-1"
            />
            <button
              type="button"
              onClick={addQuestion}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-[12px] font-medium hover:bg-muted/40"
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة
            </button>
          </div>
        </div>
      </Field>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="النبرة">
          <select
            value={draft.tone_type ?? ""}
            onChange={(e) => update("tone_type", (e.target.value || null) as PreparationToneType)}
            className="field"
          >
            <option value="">اختر...</option>
            {TONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="نمط التركيز">
          <select
            value={draft.focus_mode ?? ""}
            onChange={(e) => update("focus_mode", (e.target.value || null) as PreparationFocusMode)}
            className="field"
          >
            <option value="">اختر...</option>
            {FOCUS_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="المدة المتوقعة (دقيقة)">
          <input
            type="number"
            min={10}
            max={240}
            value={draft.expected_duration_min ?? ""}
            onChange={(e) =>
              update("expected_duration_min", e.target.value ? Number(e.target.value) : null)
            }
            className="field"
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Slider
          label={`مستوى العمق: ${draft.depth_level}`}
          value={draft.depth_level}
          onChange={(v) => update("depth_level", v)}
        />
        <Slider
          label={`مستوى الجرأة: ${draft.boldness_level}`}
          value={draft.boldness_level}
          onChange={(v) => update("boldness_level", v)}
        />
      </div>

      <Field label="محاور التركيز">
        <div className="flex flex-wrap gap-2">
          {CONTENT_FOCUS_OPTIONS.map((opt) => {
            const active = draft.content_focus.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleFocus(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                  active
                    ? "border-violet-500 bg-violet-500/15 text-violet-700"
                    : "border-border/60 bg-background text-muted-foreground hover:border-violet-500/40"
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </Field>

      <style jsx>{`
        .field {
          width: 100%;
          border-radius: 0.625rem;
          border: 1px solid hsl(var(--input));
          background: hsl(var(--background));
          padding: 0.5rem 0.75rem;
          font-size: 13px;
          color: hsl(var(--foreground));
          outline: none;
        }
        .field:focus {
          border-color: rgb(139 92 246);
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="mb-2 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-500"
      />
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Overview panel ─────────────────────────────────────────────────────────

function OverviewPanel({
  prep,
  busy,
  onRegenerate,
  onStatusChange,
  liveToken,
}: {
  prep: EpisodePreparation
  busy: string | null
  onRegenerate: (s: PreparationSectionKey) => Promise<void>
  onStatusChange: (s: PreparationStatus) => Promise<void>
  liveToken: string | null
}) {
  return (
    <div className="space-y-5">
      {/* Executive summary */}
      <Section
        title="الملخّص التنفيذي"
        icon={Target}
        section="executive_summary"
        prep={prep}
        busy={busy}
        onRegenerate={onRegenerate}
      >
        {prep.executive_summary ? (
          <div className="space-y-3">
            <p className="text-[15px] font-semibold leading-relaxed">
              {prep.executive_summary.headline}
            </p>
            <Block label="عن ماذا هذه الحلقة فعلاً">
              {prep.executive_summary.what_its_really_about}
            </Block>
            <Block label="ما الذي على المحك">{prep.executive_summary.stakes}</Block>
            <Block label="الوعد للمستمع">{prep.executive_summary.audience_promise}</Block>
          </div>
        ) : (
          <EmptyState message="لم يُولَّد بعد" />
        )}
      </Section>

      {/* Knowledge bank */}
      <Section
        title="بنك المعرفة"
        icon={FileText}
        section="knowledge_bank"
        prep={prep}
        busy={busy}
        onRegenerate={onRegenerate}
      >
        {prep.knowledge_bank ? (
          <div className="grid gap-4 md:grid-cols-2">
            <KbColumn label="حقائق" items={prep.knowledge_bank.key_facts} />
            <KbColumn label="رؤى" items={prep.knowledge_bank.insights} />
            <KbColumn label="زوايا" items={prep.knowledge_bank.angles} />
            <KbColumn label="سياق" items={prep.knowledge_bank.context} />
          </div>
        ) : (
          <EmptyState message="لم يُولَّد بعد" />
        )}
      </Section>

      {/* Guest intelligence */}
      <Section
        title="تحليل الضيف"
        icon={UsersIcon}
        section="guest_intelligence"
        prep={prep}
        busy={busy}
        onRegenerate={onRegenerate}
      >
        {prep.guest_intelligence ? (
          <div className="space-y-3 text-sm leading-relaxed">
            <Block label="التحليل الشخصي">
              {prep.guest_intelligence.personality_analysis}
            </Block>
            <Block label="أسلوب التواصل">
              {prep.guest_intelligence.communication_style}
            </Block>
            <div className="grid gap-3 md:grid-cols-2">
              <BulletList label="نقاط قوة" items={prep.guest_intelligence.strengths} />
              <BulletList label="نقاط ضعف" items={prep.guest_intelligence.weaknesses} />
              <BulletList label="مناطق حساسة" items={prep.guest_intelligence.sensitive_zones} />
              <BulletList label="محفزات" items={prep.guest_intelligence.known_triggers} />
            </div>
            <BulletList label="بناء الثقة" items={prep.guest_intelligence.rapport_tips} />
          </div>
        ) : (
          <EmptyState message="لم يُولَّد بعد" />
        )}
      </Section>

      {/* Conversation axes */}
      <Section
        title="محاور الحوار"
        icon={Compass}
        section="conversation_axes"
        prep={prep}
        busy={busy}
        onRegenerate={onRegenerate}
      >
        {prep.conversation_axes ? (
          <div className="space-y-3">
            {prep.conversation_axes.main_themes.map((m, i) => (
              <div key={i} className="rounded-xl border border-border/40 bg-background/40 p-4">
                <h4 className="mb-1 text-sm font-semibold text-violet-700">{m.title}</h4>
                <p className="text-sm text-muted-foreground">{m.description}</p>
                <div className="mt-3 space-y-1.5">
                  {prep.conversation_axes!.sub_themes
                    .filter((s) => s.parent === m.title)
                    .map((s, j) => (
                      <div
                        key={j}
                        className="flex items-start gap-2 text-xs text-muted-foreground"
                      >
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                        <span>
                          <strong className="text-foreground">{s.title}</strong> — {s.description}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="لم يُولَّد بعد" />
        )}
      </Section>

      {/* Host instructions */}
      <Section
        title="تعليمات المخرج"
        icon={ShieldCheck}
        section="host_instructions"
        prep={prep}
        busy={busy}
        onRegenerate={onRegenerate}
      >
        {prep.host_instructions ? (
          <div className="space-y-3">
            <Block label="التوجيه العام">{prep.host_instructions.overall_directive}</Block>
            <Block label="إدارة الطاقة">{prep.host_instructions.energy_management}</Block>
            <div className="grid gap-3 md:grid-cols-2">
              <BulletList label="ابقَ هادئاً عندما" items={prep.host_instructions.stay_calm_when} />
              <BulletList label="ادفع عندما" items={prep.host_instructions.push_when} />
              <BulletList label="قاطع عندما" items={prep.host_instructions.interrupt_when} />
              <BulletList label="اترك الصمت عندما" items={prep.host_instructions.allow_silence_when} />
            </div>
            <BulletList label="إذا راوغ الضيف" items={prep.host_instructions.if_guest_avoids} />
          </div>
        ) : (
          <EmptyState message="لم يُولَّد بعد" />
        )}
      </Section>

      {/* Quotes */}
      <Section
        title="الاقتباسات والمراجع"
        icon={Quote}
        section="quotes_references"
        prep={prep}
        busy={busy}
        onRegenerate={onRegenerate}
      >
        {prep.quotes_references ? (
          <div className="space-y-3">
            {prep.quotes_references.quotes.map((q, i) => (
              <div key={i} className="rounded-xl border border-border/40 bg-background/40 p-4">
                <p className="text-sm italic leading-relaxed">&ldquo;{q.quote}&rdquo;</p>
                <p className="mt-2 text-xs text-violet-700">— {q.attribution}</p>
                {q.context && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{q.context}</p>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  لماذا تهم: {q.why_it_matters}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="لم يُولَّد بعد" />
        )}
      </Section>

      {/* Viral moments */}
      <Section
        title="لحظات محتملة الانتشار"
        icon={Flame}
        section="viral_moments"
        prep={prep}
        busy={busy}
        onRegenerate={onRegenerate}
      >
        {prep.viral_moments ? (
          <div className="space-y-3">
            {prep.viral_moments.moments.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-border/40 bg-gradient-to-br from-fuchsia-500/5 to-transparent p-4"
              >
                <div className="mb-1 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">{m.label}</h4>
                  <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-700">
                    {m.expected_timing}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>التمهيد:</strong> {m.setup}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <strong>الذروة:</strong> {m.payoff}
                </p>
                <p className="mt-2 text-[11px] text-fuchsia-700/70">
                  لماذا ستنتشر: {m.why_it_spreads}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="لم يُولَّد بعد" />
        )}
      </Section>

      {/* Approval workflow */}
      <ApprovalFooter
        prep={prep}
        busy={busy}
        onStatusChange={onStatusChange}
        liveToken={liveToken}
      />
    </div>
  )
}

// ─── Research panel ─────────────────────────────────────────────────────────

function ResearchPanel({
  prep,
  busy,
  onRerun,
}: {
  prep: EpisodePreparation
  busy: string | null
  onRerun: () => Promise<void>
}) {
  const r = prep.research_data
  if (!r) {
    return (
      <div className="rounded-2xl border border-dashed border-border/40 bg-card/30 p-8 text-center">
        <Search className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">لم يُنفَّذ البحث بعد</p>
        <p className="mt-1 text-xs text-muted-foreground">
          اضغط &quot;تشغيل البحث&quot; أعلاه لبدء البحث العميق عبر Gemini + YouTube
        </p>
      </div>
    )
  }

  const srcById = new Map(r.sources.map((s) => [s.id, s]))

  // Group claims by category for rendering.
  const categoryLabels: Record<string, string> = {
    key_fact: "حقائق موثّقة",
    controversial_angle: "زوايا خلافية",
    hidden_insight: "رؤى خفية",
    personality_trait: "سمات شخصية",
    repeated_opinion: "آراء مكررة",
    contradiction: "تناقضات",
    unique_angle: "زوايا نادرة",
    public_stance_vs_criticism: "الموقف العلني مقابل النقد",
  }
  const grouped: Record<string, typeof r.claims> = {}
  for (const c of r.claims) {
    if (!grouped[c.category]) grouped[c.category] = []
    grouped[c.category].push(c)
  }

  const providerLabels: Record<string, string> = {
    gemini_web: "بحث Gemini",
    youtube: "YouTube",
    x: "X / Twitter",
  }
  const statusMeta: Record<string, { label: string; cls: string }> = {
    ok: { label: "ناجح", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
    skipped: { label: "مُتخطى", cls: "bg-neutral-500/10 text-neutral-700 border-neutral-500/20" },
    failed: { label: "فشل", cls: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
    unavailable: { label: "غير متوفر", cls: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  }

  return (
    <div className="space-y-5">
      {/* Header + verification stats */}
      <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">ملف البحث العميق</h2>
            <p className="text-[11px] text-muted-foreground">
              {r.sources.length} مصدر • {r.claims.length} ادعاء • تم التوليد {formatDateTime(r.generated_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onRerun}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[12px] hover:bg-muted/40 disabled:opacity-50"
          >
            {busy === "research" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            إعادة البحث
          </button>
        </div>

        {/* Verification counts */}
        <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-700">
            موثّق: {r.verified_count}
          </span>
          <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-700">
            ضعيف: {r.weak_count}
          </span>
          <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-rose-700">
            محذوف: {r.unverified_count}
          </span>
        </div>

        {/* Retrieval diagnostics */}
        <div className="mb-3 flex flex-wrap gap-2">
          {r.retrieval.map((d) => {
            const meta = statusMeta[d.status] || statusMeta.skipped
            return (
              <div
                key={d.provider}
                className={`rounded-md border px-2 py-1 text-[11px] ${meta.cls}`}
                title={d.message}
              >
                {providerLabels[d.provider] || d.provider}: {meta.label} ({d.count})
              </div>
            )
          })}
        </div>

        {r.notes && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-[12px] text-amber-700">
            {r.notes}
          </div>
        )}

        {r.queries_used && r.queries_used.length > 0 && (
          <div className="mt-3 text-[11px] text-muted-foreground">
            استعلامات البحث: {r.queries_used.map((q) => `"${q}"`).join(" • ")}
          </div>
        )}
      </div>

      {/* Claims grouped by category */}
      {Object.entries(grouped).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
          لم يجتز أي ادعاء مرحلة التحقق من المصادر. راجع المصادر يدوياً أو أعد البحث.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="rounded-2xl border border-border/40 bg-card/40 p-4">
              <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                {categoryLabels[cat] || cat}
              </h3>
              <ul className="space-y-2.5">
                {items.map((c) => (
                  <li key={c.id} className="text-[13px] leading-relaxed">
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                          c.status === "verified"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "bg-amber-500/10 text-amber-700"
                        }`}
                      >
                        {c.status === "verified" ? "موثّق" : "ضعيف"}
                      </span>
                      {c.cross_source_verified && (
                        <span
                          className="mt-0.5 shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700"
                          title={`مصادر متقاطعة: ${c.provider_types.join(" + ")}`}
                        >
                          تحقّق متقاطع
                        </span>
                      )}
                      <span>{c.claim}</span>
                    </div>
                    <div className="mt-1 ps-[44px] text-[10px] text-muted-foreground">
                      {c.source_ids.map((id) => {
                        const s = srcById.get(id)
                        if (!s) return null
                        return (
                          <a
                            key={id}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="me-1.5 inline-block text-violet-700 hover:underline"
                          >
                            [#{id} {s.publisher || s.provider}]
                          </a>
                        )
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Cited quotes */}
      {r.quotes.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
          <h3 className="mb-3 text-sm font-bold">اقتباسات موثّقة</h3>
          <div className="space-y-3">
            {r.quotes.map((q, i) => (
              <div key={i} className="rounded-lg border-s-2 border-violet-500/50 bg-background/40 p-3">
                <p className="text-sm italic">“{q.text}”</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  — {q.attributed_to}
                  {q.context && <span className="text-muted-foreground"> ({q.context})</span>}
                </p>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {q.source_ids.map((id) => {
                    const s = srcById.get(id)
                    return s ? (
                      <a
                        key={id}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="me-1.5 inline-block text-violet-700 hover:underline"
                      >
                        [#{id}]
                      </a>
                    ) : null
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw sources */}
      <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
        <h3 className="mb-3 text-sm font-bold">المصادر ({r.sources.length})</h3>
        <div className="space-y-2">
          {r.sources.map((s) => (
            <a
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-border/40 bg-background/40 p-3 text-xs transition-colors hover:border-violet-500/40"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">
                  #{s.id}
                </span>
                <span className="shrink-0 rounded-md bg-neutral-500/10 px-1.5 py-0.5 text-[9px] text-neutral-700">
                  {providerLabels[s.provider] || s.provider}
                </span>
                <div className="min-w-0 flex-1 truncate font-medium text-foreground">{s.title}</div>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                {s.publisher && <span className="truncate">{s.publisher}</span>}
                {s.metrics?.view_count !== undefined && (
                  <>
                    <span>•</span>
                    <span>{s.metrics.view_count.toLocaleString("en-US")} مشاهدة</span>
                  </>
                )}
              </div>
              {s.snippet && (
                <div className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{s.snippet}</div>
              )}
            </a>
          ))}
        </div>
      </div>

      {r.past_interviews.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
          <h3 className="mb-3 text-sm font-bold">ظهورات سابقة</h3>
          <div className="space-y-2">
            {r.past_interviews.map((p, i) => (
              <div key={i} className="rounded-lg border border-border/40 bg-background/40 p-3 text-xs">
                <div className="font-medium">{p.title}</div>
                {p.publisher && (
                  <div className="mt-1 text-[11px] text-muted-foreground">{p.publisher}</div>
                )}
                {p.note && <div className="mt-1 text-[11px] text-muted-foreground">{p.note}</div>}
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-[11px] text-violet-700 hover:underline"
                  >
                    فتح المصدر
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Flow panel ─────────────────────────────────────────────────────────────

function FlowPanel({
  prep,
  busy,
  onRegenerate,
}: {
  prep: EpisodePreparation
  busy: string | null
  onRegenerate: (s: PreparationSectionKey) => Promise<void>
}) {
  return (
    <Section
      title="مسار الحلقة"
      icon={GitBranch}
      section="episode_flow"
      prep={prep}
      busy={busy}
      onRegenerate={onRegenerate}
    >
      {prep.episode_flow ? (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">الخط الزمني</h3>
            <div className="space-y-2">
              {prep.episode_flow.timeline.map((b) => (
                <div
                  key={b.id}
                  className="flex items-stretch gap-3 rounded-xl border border-border/40 bg-background/40 p-3"
                >
                  <div className="flex min-w-[70px] flex-col items-center justify-center rounded-lg bg-violet-500/10 px-3 py-2 text-[11px] font-mono text-violet-700">
                    {b.from_min}–{b.to_min}
                    <span className="text-[9px] text-violet-700/60">دقيقة</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{b.label}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{b.purpose}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">المراحل الدرامية</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {prep.episode_flow.phases.map((p) => (
                <div
                  key={p.key}
                  className="rounded-xl border border-border/40 bg-gradient-to-br from-violet-500/5 to-transparent p-4"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <h4 className="text-sm font-semibold">{p.label}</h4>
                    <span className="text-[10px] text-muted-foreground">
                      {p.approximate_minutes[0]}–{p.approximate_minutes[1]} د
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                  {p.goals.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {p.goals.map((g, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px]">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          {prep.episode_flow.pacing_notes && (
            <Block label="ملاحظات الإيقاع">{prep.episode_flow.pacing_notes}</Block>
          )}
        </div>
      ) : (
        <EmptyState message="لم يُولَّد المسار بعد — شغّل البحث ثم التوليد الكامل" />
      )}
    </Section>
  )
}

// ─── Questions panel ────────────────────────────────────────────────────────

function QuestionsPanel({
  prep,
  busy,
  onRegenerate,
}: {
  prep: EpisodePreparation
  busy: string | null
  onRegenerate: (s: PreparationSectionKey) => Promise<void>
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null)
  const [filter, setFilter] = useState<PreparationQuestionBucket | "all">("all")

  return (
    <Section
      title="نظام الأسئلة"
      icon={MessageCircleQuestion}
      section="question_system"
      prep={prep}
      busy={busy}
      onRegenerate={onRegenerate}
    >
      {prep.question_system ? (
        <div className="space-y-4">
          {/* Bucket filter */}
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              الكل
            </FilterChip>
            {(Object.keys(BUCKET_META) as PreparationQuestionBucket[]).map((b) => (
              <FilterChip key={b} active={filter === b} onClick={() => setFilter(b)}>
                {BUCKET_META[b].label}
              </FilterChip>
            ))}
          </div>

          {prep.question_system.sections.map((sec) => {
            const open = expanded === sec.section_id
            const filteredQuestions =
              filter === "all" ? sec.questions : sec.questions.filter((q) => q.bucket === filter)
            return (
              <div key={sec.section_id} className="rounded-xl border border-border/40 bg-background/40">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : sec.section_id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-start"
                >
                  <div className="flex items-center gap-2">
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <h4 className="text-sm font-semibold">{sec.section_label}</h4>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {filteredQuestions.length} سؤال
                  </span>
                </button>

                {open && (
                  <div className="space-y-2 border-t border-border/40 p-4">
                    {filteredQuestions.map((q) => {
                      const meta = BUCKET_META[q.bucket]
                      const supportOpen = expandedQuestionId === q.id
                      const hasSupport = !!q.support
                      return (
                        <div
                          key={q.id}
                          className="rounded-lg border border-border/30 bg-card/50 p-3"
                        >
                          <div className="mb-1.5 flex items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] ${meta.color}`}
                            >
                              {meta.label}
                            </span>
                            {q.weak_support && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                دعم ضعيف
                              </span>
                            )}
                          </div>
                          <p className="text-sm leading-relaxed">{q.text}</p>
                          {q.intent && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              <strong>النية:</strong> {q.intent}
                            </p>
                          )}
                          {q.follow_ups.length > 0 && (
                            <ul className="mt-2 space-y-1 rounded-md bg-background/40 p-2">
                              {q.follow_ups.map((f, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
                                >
                                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                                  <span>{f}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {hasSupport && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedQuestionId(supportOpen ? null : q.id)
                              }
                              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              <Lightbulb className="h-3 w-3 text-amber-700" />
                              {supportOpen ? "إخفاء حزمة الدعم" : "حزمة الدعم"}
                              {supportOpen ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                          )}
                          {supportOpen && q.support && (
                            <div className="mt-2 space-y-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                              {q.support.context && (
                                <div>
                                  <div className="mb-0.5 text-[9px] font-semibold uppercase text-amber-700">
                                    السياق
                                  </div>
                                  <p className="text-[11px] leading-relaxed text-foreground/90">
                                    {q.support.context}
                                  </p>
                                </div>
                              )}
                              {q.support.talking_points &&
                                q.support.talking_points.length > 0 && (
                                  <SupportBullets
                                    label="نقاط الحوار"
                                    items={q.support.talking_points}
                                    dot="bg-violet-400"
                                  />
                                )}
                              {q.support.follow_up_angles &&
                                q.support.follow_up_angles.length > 0 && (
                                  <SupportBullets
                                    label="زوايا المتابعة"
                                    items={q.support.follow_up_angles}
                                    dot="bg-sky-400"
                                  />
                                )}
                              {q.support.pressure_points &&
                                q.support.pressure_points.length > 0 && (
                                  <SupportBullets
                                    label="نقاط ضغط"
                                    items={q.support.pressure_points}
                                    dot="bg-rose-400"
                                  />
                                )}
                              {q.support.memory_triggers &&
                                q.support.memory_triggers.length > 0 && (
                                  <SupportBullets
                                    label="محفزات الذاكرة"
                                    items={q.support.memory_triggers}
                                    dot="bg-fuchsia-400"
                                  />
                                )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState message="لم تُولَّد الأسئلة بعد" />
      )}
    </Section>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
        active
          ? "border-violet-500 bg-violet-500/15 text-violet-700"
          : "border-border/60 bg-background text-muted-foreground hover:border-violet-500/40"
      }`}
    >
      {children}
    </button>
  )
}

function SupportBullets({
  label,
  items,
  dot,
}: {
  label: string
  items: string[]
  dot: string
}) {
  return (
    <div>
      <div className="mb-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground/90"
          >
            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${dot}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Live panel ─────────────────────────────────────────────────────────────

function LivePanel({
  prep,
  liveToken,
  busy,
  onRotate,
}: {
  prep: EpisodePreparation
  liveToken: string | null
  busy: string | null
  onRotate: () => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)

  if (prep.status !== "approved") {
    return (
      <div className="rounded-2xl border border-dashed border-border/40 bg-card/30 p-8 text-center">
        <Radio className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">الوضع المباشر غير مفعّل</p>
        <p className="mt-1 text-xs text-muted-foreground">
          اعتمد الجلسة من تبويب &quot;نظرة عامة&quot; لتوليد رابط التحكم المباشر.
        </p>
      </div>
    )
  }

  if (!liveToken && !prep.live_token_hash) {
    return (
      <div className="rounded-2xl border border-dashed border-border/40 bg-card/30 p-8 text-center">
        <p className="text-sm">لم يُولَّد رابط مباشر بعد. اضغط &quot;اعتماد&quot; مجدداً.</p>
      </div>
    )
  }

  const runRotate = async () => {
    if (!confirmRotate) {
      setConfirmRotate(true)
      return
    }
    setConfirmRotate(false)
    await onRotate()
  }

  const url = liveToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/prepare/live/${liveToken}`
    : null

  const copyUrl = () => {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-5">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-700">
          <ShieldCheck className="h-3 w-3" />
          الجلسة معتمدة
        </div>
        <h2 className="text-sm font-bold">رابط وضع التسجيل المباشر</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          افتح هذا الرابط على هاتفك أثناء التسجيل — وضع داكن، أسئلة، مؤشر طاقة، وملاحظات سريعة.
        </p>

        {url ? (
          <div className="mt-4 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-[11px]">
              {url}
            </code>
            <button
              type="button"
              onClick={copyUrl}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[12px] font-semibold text-background hover:opacity-90"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "نُسخ" : "نسخ"}
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700">
            الرابط متاح مرة واحدة فقط لحظة الاعتماد. إذا فقدته، اضغط &quot;تدوير
            الرابط&quot; لتوليد رابط جديد — سيتوقّف الرابط القديم فوراً.
          </div>
        )}

        {/* Rotate-token control — always available on approved records. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/30 pt-3">
          <div className="flex-1 text-[11px] text-muted-foreground">
            {confirmRotate
              ? "سيتوقّف الرابط القديم فوراً. هل أنت متأكد؟"
              : "فقدت الرابط أو تشك بتسرّبه؟ دوّر الرابط لإصدار واحد جديد وإلغاء القديم."}
          </div>
          {confirmRotate && (
            <button
              type="button"
              onClick={() => setConfirmRotate(false)}
              className="rounded-lg border border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/30"
            >
              إلغاء
            </button>
          )}
          <button
            type="button"
            onClick={runRotate}
            disabled={busy !== null}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
              confirmRotate
                ? "border-rose-500/40 bg-rose-500/15 text-rose-700 hover:bg-rose-500/25"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
            }`}
          >
            {busy === "rotate" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            {confirmRotate ? "تأكيد التدوير" : "تدوير الرابط"}
          </button>
        </div>
      </div>

      {/* Quick preview of what the live mode will show */}
      {prep.question_system && (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
          <h3 className="mb-2 text-sm font-bold">معاينة سريعة</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">
            هذا ما سيظهر على الهاتف أثناء التسجيل:
          </p>
          <div className="space-y-1.5 text-xs">
            {prep.question_system.sections.slice(0, 3).map((sec) => (
              <div key={sec.section_id} className="rounded-lg bg-background/40 p-2">
                <div className="font-medium">{sec.section_label}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {sec.questions.length} سؤال
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reusable pieces ────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  section,
  prep,
  busy,
  onRegenerate,
  children,
}: {
  title: string
  icon: React.ElementType
  section: PreparationSectionKey
  prep: EpisodePreparation
  busy: string | null
  onRegenerate: (s: PreparationSectionKey) => Promise<void>
  children: React.ReactNode
}) {
  const status = prep.sections_status[section]?.status
  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-violet-700" />
          <h2 className="text-sm font-bold">{title}</h2>
          {status === "error" && (
            <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-700">
              خطأ
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRegenerate(section)}
          disabled={busy !== null || !isResearchUsableClient(prep)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-[11px] hover:bg-muted/40 disabled:opacity-40"
        >
          {busy === section ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          إعادة توليد
        </button>
      </div>
      {children}
    </div>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/30 bg-background/30 p-3">
      <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}

function BulletList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function KbColumn({
  label,
  items,
}: {
  label: string
  items: { label: string; detail: string; why_it_matters: string }[]
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <h4 className="mb-2 text-xs font-bold text-violet-700">{label}</h4>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border border-border/30 p-2.5">
            <div className="text-[12px] font-semibold">{it.label}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{it.detail}</div>
            <div className="mt-1 text-[10px] text-violet-700/70">{it.why_it_matters}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
      {message}
    </div>
  )
}

function ApprovalFooter({
  prep,
  busy,
  onStatusChange,
  liveToken,
}: {
  prep: EpisodePreparation
  busy: string | null
  onStatusChange: (s: PreparationStatus) => Promise<void>
  liveToken: string | null
}) {
  const [copied, setCopied] = useState(false)

  const url = liveToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/prepare/live/${liveToken}`
    : null

  const copy = () => {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-violet-500/5 to-transparent p-5">
      <h3 className="mb-2 text-sm font-bold">حالة الجلسة</h3>
      <p className="mb-3 text-[11px] text-muted-foreground">
        التحويلات مسودة → تم البحث → جاهز للمراجعة تلقائية. أما المراجعة والاعتماد
        فيدويّان.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {(["draft", "researched", "prepared", "reviewed", "approved"] as PreparationStatus[]).map(
          (s) => {
            const meta = STATUS_META[s]
            const active = prep.status === s
            const manual = MANUAL_STATUSES.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => manual && onStatusChange(s)}
                disabled={busy !== null || !manual}
                title={manual ? undefined : "هذه الحالة تُضبط تلقائياً"}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-all ${
                  active
                    ? `${meta.bg} ${meta.text} ${meta.border}`
                    : manual
                      ? "border-border/40 text-muted-foreground hover:bg-muted/30"
                      : "cursor-not-allowed border-border/30 text-muted-foreground"
                }`}
              >
                {active && <Check className="h-3 w-3" />}
                {meta.label}
              </button>
            )
          },
        )}
      </div>

      {url && (
        <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
          <p className="mb-2 text-[11px] font-semibold text-emerald-700">
            تم توليد رابط الوضع المباشر:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-emerald-500/20 bg-background/60 px-2 py-1 text-[10px]">
              {url}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-[10px] text-emerald-700"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "نُسخ" : "نسخ"}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-emerald-700/70">
            احفظ الرابط الآن — لن يُعرض مرة أخرى.
          </p>
        </div>
      )}
    </div>
  )
}
