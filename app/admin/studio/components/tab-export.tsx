"use client"

import { useState, useCallback, useEffect } from "react"
import {
  ArrowUpFromLine, Loader2, AlertCircle, CheckCircle2, Circle,
  ChevronDown, X, RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudioSession, GENERATE_ALL_STEPS } from "./studio-context"
import type { StudioWebsitePackage, Episode } from "@/types/database"

// ---------------------------------------------------------------------------
// Generation checklist
// ---------------------------------------------------------------------------

function GenerationChecklist() {
  const { transcriptStatus, aiStatus, chaptersStatus, clipsStatus, websitePkgStatus } = useStudioSession()

  const steps = [
    { label: "النص التلقائي", ready: transcriptStatus === "ready" },
    { label: "مخرجات AI", ready: aiStatus === "ready" },
    { label: "الفصول الزمنية", ready: chaptersStatus === "ready" },
    { label: "المقاطع القصيرة", ready: clipsStatus === "ready" },
    { label: "حزمة الموقع", ready: websitePkgStatus === "ready" },
  ]

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <h3 className="font-semibold text-sm">قائمة التوليد</h3>
      <div className="space-y-2">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-center gap-3">
            {step.ready ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            )}
            <span className={cn("text-sm", step.ready ? "text-foreground" : "text-muted-foreground")}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diff Preview Modal
// ---------------------------------------------------------------------------

interface DiffFieldRow {
  key: string
  label: string
  currentValue: string
  newValue: string
  checked: boolean
}

function DiffPreviewModal({
  pkg,
  episode,
  customTitle,
  selectedQuoteIndices,
  selectedTakeawayIndices,
  pushing,
  onClose,
  onPush,
}: {
  pkg: StudioWebsitePackage
  episode: Episode | null
  customTitle: string
  selectedQuoteIndices: Set<number>
  selectedTakeawayIndices: Set<number>
  pushing: boolean
  onClose: () => void
  onPush: (fields: Record<string, boolean>) => void
}) {
  const selectedTakeaways = pkg.takeaways.filter((_, i) => selectedTakeawayIndices.has(i))
  const selectedQuotes = pkg.quotes.filter((_, i) => selectedQuoteIndices.has(i))

  const buildRows = (): DiffFieldRow[] => {
    const rows: DiffFieldRow[] = []

    // Title override — show only if custom title differs from episode title
    if (customTitle && episode && customTitle !== episode.title) {
      rows.push({
        key: "title", label: "عنوان الحلقة",
        currentValue: episode.title,
        newValue: customTitle, checked: true,
      })
    }

    if (pkg.hero_summary) {
      rows.push({ key: "hero_summary", label: "ملخص قصير", currentValue: "", newValue: pkg.hero_summary, checked: true })
    }
    if (pkg.full_summary) {
      rows.push({
        key: "full_summary", label: "ملخص شامل",
        currentValue: episode?.summary || episode?.description || "",
        newValue: pkg.full_summary, checked: true,
      })
    }
    if (selectedTakeaways.length > 0) {
      rows.push({
        key: "takeaways", label: `أبرز الأفكار (${selectedTakeaways.length}/${pkg.takeaways.length})`,
        currentValue: episode?.key_takeaways?.join("\n") || "",
        newValue: selectedTakeaways.join("\n"), checked: true,
      })
    }
    if (selectedQuotes.length > 0) {
      rows.push({
        key: "quotes", label: `اقتباسات (${selectedQuotes.length}/${pkg.quotes.length})`,
        currentValue: "", newValue: selectedQuotes.map((q) => q.text).join("\n"), checked: true,
      })
    }
    if (pkg.topics.length > 0) {
      rows.push({
        key: "topics", label: "المواضيع",
        currentValue: episode?.topics?.map((t) => t.name).join("، ") || "",
        newValue: pkg.topics.join("، "), checked: true,
      })
    }
    if (pkg.resources.length > 0) {
      rows.push({
        key: "resources", label: `المصادر (${pkg.resources.length})`,
        currentValue: "", newValue: pkg.resources.map((r) => r.title).join("\n"), checked: true,
      })
    }
    if (pkg.timestamps.length > 0) {
      const formatTs = (s: number) => {
        const m = Math.floor(s / 60)
        const sec = Math.floor(s % 60)
        return `${m}:${sec.toString().padStart(2, "0")}`
      }
      rows.push({
        key: "timestamps", label: `الطوابع الزمنية (${pkg.timestamps.length})`,
        currentValue: "", newValue: pkg.timestamps.map((t) => `${formatTs(t.time_seconds)} ${t.title}`).join("\n"), checked: true,
      })
    }

    return rows
  }

  const [rows, setRows] = useState<DiffFieldRow[]>(buildRows)

  const toggleRow = (key: string) => {
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, checked: !r.checked } : r))
  }

  const handleConfirm = () => {
    const fields: Record<string, boolean> = {}
    for (const row of rows) {
      fields[row.key] = row.checked
    }
    onPush(fields)
  }

  const selectedCount = rows.filter((r) => r.checked).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="font-semibold">معاينة التغييرات</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {episode && (
            <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 text-sm">
              <span className="text-muted-foreground">الحلقة:</span>
              <span className="font-medium truncate">{episode.title}</span>
            </div>
          )}

          {rows.map((row) => (
            <div key={row.key} className="rounded-lg border p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={() => toggleRow(row.key)}
                  className="h-4 w-4 rounded border-gray-300 accent-primary"
                />
                <span className="text-sm font-medium">{row.label}</span>
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">الحالي</span>
                  <div className="rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed whitespace-pre-wrap min-h-[3rem] max-h-32 overflow-y-auto" dir="rtl">
                    {row.currentValue || <span className="text-muted-foreground italic">فارغ</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">الجديد</span>
                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-2.5 text-xs leading-relaxed whitespace-pre-wrap min-h-[3rem] max-h-32 overflow-y-auto" dir="rtl">
                    {row.newValue}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={pushing}>
            إلغاء
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={pushing || selectedCount === 0}
            className="gap-2"
          >
            {pushing ? (
              <><Loader2 className="h-4 w-4 animate-spin" />جارٍ النشر...</>
            ) : (
              <><ArrowUpFromLine className="h-4 w-4" />نشر الحقول المحددة ({selectedCount})</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TabExport
// ---------------------------------------------------------------------------

export function TabExport() {
  const {
    session, websitePkg, websitePkgStatus,
    selectedTitle, selectedQuoteIndices, selectedTakeawayIndices,
    episodes, loadEpisodes,
  } = useStudioSession()

  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("")
  const [showDiff, setShowDiff] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ success: boolean; fields: string[]; guestLink?: { linked: boolean; guestName?: string; created?: boolean } | null } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<{ success: boolean } | null>(null)

  // Load episodes on mount
  useEffect(() => {
    if (!loaded) {
      setLoaded(true)
      loadEpisodes()
      if (websitePkg?.linked_episode_id) {
        setSelectedEpisodeId(websitePkg.linked_episode_id)
      } else if (session.video_id) {
        setSelectedEpisodeId(session.video_id)
      }
    }
  }, [loaded, loadEpisodes, websitePkg, session.video_id])

  const selectedEpisode = episodes.find((e) => e.id === selectedEpisodeId)

  const handlePush = async (fields: Record<string, boolean>) => {
    setPushing(true)
    setPushResult(null)

    // Sync selections, title, and linked episode before pushing
    const patchBody: Record<string, unknown> = {}
    if (websitePkg && selectedEpisodeId !== websitePkg.linked_episode_id) {
      patchBody.linked_episode_id = selectedEpisodeId
    }
    if (selectedTitle && selectedTitle !== websitePkg?.custom_title) {
      patchBody.custom_title = selectedTitle
    }
    patchBody.selected_quote_indices = [...selectedQuoteIndices]
    patchBody.selected_takeaway_indices = [...selectedTakeawayIndices]
    if (Object.keys(patchBody).length > 0) {
      await fetch(`/api/admin/studio/${session.id}/website-package`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      })
    }

    try {
      const res = await fetch(`/api/admin/studio/${session.id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      })
      const json = await res.json()
      if (res.ok) {
        setPushResult({ success: true, fields: json.pushedFields || [], guestLink: json.guestLink || null })
      } else {
        setPushResult({ success: false, fields: [] })
      }
    } catch {
      setPushResult({ success: false, fields: [] })
    } finally {
      setPushing(false)
      setShowDiff(false)
    }
  }

  const handleRestore = async () => {
    setRestoring(true)
    setRestoreResult(null)
    try {
      const res = await fetch(`/api/admin/episodes/${selectedEpisodeId}/enrichments`, {
        method: "DELETE",
      })
      if (res.ok) {
        setRestoreResult({ success: true })
        setPushResult(null)
      } else {
        setRestoreResult({ success: false })
      }
    } catch {
      setRestoreResult({ success: false })
    } finally {
      setRestoring(false)
      setShowRestoreConfirm(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Generation Checklist */}
      <GenerationChecklist />

      {/* Push to Episode */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <ArrowUpFromLine className="h-5 w-5 text-orange-500" />
          <h2 className="font-semibold">نشر إلى صفحة الحلقة</h2>
        </div>

        {websitePkgStatus !== "ready" && (
          <p className="text-sm text-muted-foreground">
            يجب توليد حزمة الموقع أولاً قبل النشر
          </p>
        )}

        {websitePkgStatus === "ready" && websitePkg && (
          <>
            {/* Episode selector */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">اختر الحلقة</label>
                <div className="relative">
                  <select
                    value={selectedEpisodeId}
                    onChange={(e) => setSelectedEpisodeId(e.target.value)}
                    className="w-full appearance-none rounded-lg border bg-background px-4 py-2.5 pl-10 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    dir="rtl"
                  >
                    <option value="">— اختر حلقة —</option>
                    {episodes.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        {ep.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              {selectedEpisode && (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                  {selectedEpisode.thumbnail_url && (
                    <img src={selectedEpisode.thumbnail_url} alt="" className="h-12 w-20 rounded object-cover shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{selectedEpisode.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedEpisode.duration_minutes} دقيقة
                      {selectedEpisode.id === session.video_id && " · مطابق لمعرّف الفيديو"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Push button */}
            <Button
              onClick={() => setShowDiff(true)}
              disabled={!selectedEpisodeId}
              className="gap-2"
            >
              <ArrowUpFromLine className="h-4 w-4" />
              معاينة ونشر
            </Button>

            {/* Push result */}
            {pushResult && (
              <div className={cn(
                "flex items-start gap-2 rounded-lg border p-3",
                pushResult.success
                  ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50"
                  : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50"
              )}>
                {pushResult.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-green-700 dark:text-green-400">تم النشر بنجاح</p>
                      <p className="text-xs text-green-600/70 dark:text-green-400/60">
                        الحقول: {pushResult.fields.join("، ")}
                      </p>
                      {pushResult.guestLink?.linked && (
                        <p className="text-xs text-green-600/70 dark:text-green-400/60 mt-1">
                          تم ربط الضيف: {pushResult.guestLink.guestName}
                          {pushResult.guestLink.created ? " (تم إنشاء ملف جديد)" : " (ملف موجود)"}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <p className="text-sm text-red-600 dark:text-red-400">فشل في النشر</p>
                  </>
                )}
              </div>
            )}

            {/* Diff Modal */}
            {showDiff && (
              <DiffPreviewModal
                pkg={websitePkg}
                episode={selectedEpisode || null}
                customTitle={selectedTitle}
                selectedQuoteIndices={selectedQuoteIndices}
                selectedTakeawayIndices={selectedTakeawayIndices}
                pushing={pushing}
                onClose={() => setShowDiff(false)}
                onPush={handlePush}
              />
            )}
          </>
        )}
      </div>

      {/* Restore Episode */}
      {selectedEpisodeId && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-red-500" />
            <h2 className="font-semibold">استعادة الحلقة</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            إزالة جميع البيانات المضافة من الاستوديو (الملخص، الطوابع الزمنية، الاقتباسات، المواضيع، المصادر) وإعادة الحلقة لحالتها الأصلية من يوتيوب.
          </p>

          {!showRestoreConfirm ? (
            <Button
              variant="outline"
              onClick={() => setShowRestoreConfirm(true)}
              disabled={restoring}
              className="gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              <RotateCcw className="h-4 w-4" />
              استعادة الحلقة
            </Button>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4">
              <p className="text-sm text-red-700 dark:text-red-400 flex-1">
                هل أنت متأكد؟ سيتم حذف جميع التعديلات المضافة من الاستوديو لهذه الحلقة.
              </p>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRestoreConfirm(false)}
                  disabled={restoring}
                >
                  إلغاء
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRestore}
                  disabled={restoring}
                  className="gap-2"
                >
                  {restoring ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />جارٍ الاستعادة...</>
                  ) : (
                    "تأكيد الحذف"
                  )}
                </Button>
              </div>
            </div>
          )}

          {restoreResult && (
            <div className={cn(
              "flex items-start gap-2 rounded-lg border p-3",
              restoreResult.success
                ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50"
                : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50"
            )}>
              {restoreResult.success ? (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                  <p className="text-sm text-green-700 dark:text-green-400">تمت استعادة الحلقة بنجاح — عادت لحالتها الأصلية</p>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  <p className="text-sm text-red-600 dark:text-red-400">فشل في استعادة الحلقة</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
