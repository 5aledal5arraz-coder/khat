"use client"

import { useState, useEffect } from "react"
import {
  ArrowUpFromLine, Loader2, AlertCircle, CheckCircle2, Circle,
  ChevronDown, RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSession, useTranscript, useContent, useChapters, useClips, useWebsitePkg, usePublish } from "../contexts"
import { DiffPreviewModal } from "./diff-preview-modal"

// ---------------------------------------------------------------------------
// Field name → Arabic label mapping
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  title: "العنوان",
  quotes: "الاقتباسات",
  hero_summary: "الملخص الرئيسي",
  full_summary: "الملخص الكامل",
  takeaways: "أهم الأفكار",
  timestamps: "الطوابع الزمنية",
  resources: "المصادر",
  description: "الوصف",
}

// ---------------------------------------------------------------------------
// Generation checklist
// ---------------------------------------------------------------------------

function GenerationChecklist() {
  const { transcriptStatus } = useTranscript()
  const { aiStatus } = useContent()
  const { chaptersStatus } = useChapters()
  const { clipsStatus } = useClips()
  const { websitePkgStatus } = useWebsitePkg()

  const steps = [
    { label: "النص التلقائي", ready: transcriptStatus === "ready" },
    { label: "مخرجات AI", ready: aiStatus === "ready" },
    { label: "الفصول الزمنية", ready: chaptersStatus === "ready" },
    { label: "المقاطع القصيرة", ready: clipsStatus === "ready" },
    { label: "حزمة الموقع", ready: websitePkgStatus === "ready" },
  ]

  return (
    <div className="rounded-xl border border-border/30 bg-card/50 p-6 space-y-4">
      <h3 className="text-[13px] font-semibold">قائمة التوليد</h3>
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
// TabExport
// ---------------------------------------------------------------------------

export function TabExport() {
  const { session } = useSession()
  const { websitePkg, websitePkgStatus, selectedTitle, selectedQuoteIndices, selectedTakeawayIndices } = useWebsitePkg()
  const { episodes, loadEpisodes } = usePublish()

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
    const selectedFields = Object.entries(fields).filter(([, v]) => v).map(([k]) => k)

    // Optimistic: immediately show success and close modal
    setShowDiff(false)
    setPushResult({ success: true, fields: selectedFields, guestLink: null })
    setPushing(true)

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
        // Confirm with actual server response (may include guest link info)
        setPushResult({ success: true, fields: json.pushedFields || selectedFields, guestLink: json.guestLink || null })
      } else {
        // Rollback: show error
        setPushResult({ success: false, fields: [] })
      }
    } catch {
      // Rollback: show error
      setPushResult({ success: false, fields: [] })
    } finally {
      setPushing(false)
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
      <div className="rounded-xl border border-border/30 bg-card/50 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <ArrowUpFromLine className="h-5 w-5 text-orange-500" />
          <h2 className="text-[13px] font-semibold">نشر إلى صفحة الحلقة</h2>
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
                    // eslint-disable-next-line @next/next/no-img-element -- Admin-only export tab thumbnail with dynamic external URL
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
                "flex items-start gap-2 rounded-lg border p-3 transition-all",
                pushResult.success
                  ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50"
                  : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50"
              )}>
                {pushResult.success ? (
                  <>
                    {pushing ? (
                      <Loader2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm text-green-700 dark:text-green-400">
                        {pushing ? "جارٍ النشر..." : "تم نشر الحلقة بنجاح"}
                      </p>
                      {pushResult.fields.length > 0 && (
                        <div className="mt-1">
                          <p className="text-xs text-green-600/70 dark:text-green-400/60">
                            تم تحديث البيانات التالية:
                          </p>
                          <ul className="mt-0.5 text-xs text-green-600/70 dark:text-green-400/60 list-disc list-inside">
                            {pushResult.fields.map((f) => (
                              <li key={f}>{FIELD_LABELS[f] || f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
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
                    <div>
                      <p className="text-sm text-red-600 dark:text-red-400">فشل في النشر — يرجى المحاولة مرة أخرى</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setPushResult(null); setShowDiff(true) }}
                        className="mt-1 h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        <RotateCcw className="h-3 w-3 me-1" />
                        إعادة المحاولة
                      </Button>
                    </div>
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
        <div className="rounded-xl border border-red-500/20 bg-card/50 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-red-500" />
            <h2 className="text-[13px] font-semibold">استعادة الحلقة</h2>
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
