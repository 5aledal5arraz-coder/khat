"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  Youtube,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { YouTubePackEntry, YouTubePackSection } from "@/types/youtube-pack"
import {
  generateYoutubePack,
  regenerateYoutubePackSection,
  regenerateYoutubePack,
  deleteYoutubePack,
} from "../youtube-pack-actions"

interface DetailYoutubePackProps {
  episodeId: string
  episodeTitle: string
  youtubeUrl: string
  guestName: string
  entry: YouTubePackEntry | null
}

export function DetailYoutubePack({
  episodeId,
  episodeTitle,
  youtubeUrl,
  guestName,
  entry,
}: DetailYoutubePackProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [localEntry, setLocalEntry] = useState<YouTubePackEntry | null>(entry)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set()
  )
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(
    null
  )
  const [copiedSection, setCopiedSection] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggleCollapse = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const handleCopy = async (section: YouTubePackSection) => {
    try {
      await navigator.clipboard.writeText(section.content)
      setCopiedSection(section.id)
      setTimeout(() => setCopiedSection(null), 2000)
    } catch {
      // Fallback
    }
  }

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    setStatusText("جارٍ جلب النص من يوتيوب وتوليد الحزمة...")

    try {
      const result = await generateYoutubePack(
        episodeId,
        youtubeUrl,
        episodeTitle,
        guestName
      )

      if (result.success) {
        setStatusText("")
        router.refresh()
      } else {
        setError(result.error || "حدث خطأ")
        setStatusText("")
        setLoading(false)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "حدث خطأ غير متوقع"
      setError(message)
      setStatusText("")
      setLoading(false)
    }
  }

  const handleRegenerateSection = async (
    sectionType: YouTubePackSection["type"]
  ) => {
    setRegeneratingSection(sectionType)
    setError(null)

    try {
      const result = await regenerateYoutubePackSection(
        episodeId,
        youtubeUrl,
        episodeTitle,
        guestName,
        sectionType
      )

      if (result.success) {
        router.refresh()
      } else {
        setError(result.error || "حدث خطأ")
        setRegeneratingSection(null)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "حدث خطأ غير متوقع"
      setError(message)
      setRegeneratingSection(null)
    }
  }

  const handleRegenerateAll = async () => {
    setLoading(true)
    setError(null)
    setStatusText("جارٍ إعادة توليد الحزمة بالكامل...")

    try {
      const result = await regenerateYoutubePack(
        episodeId,
        youtubeUrl,
        episodeTitle,
        guestName
      )

      if (result.success) {
        router.refresh()
      } else {
        setError(result.error || "حدث خطأ")
        setStatusText("")
        setLoading(false)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "حدث خطأ غير متوقع"
      setError(message)
      setStatusText("")
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    await deleteYoutubePack(episodeId)
    setLocalEntry(null)
    setConfirmDelete(false)
  }

  const sections = localEntry?.sections || []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-card/50 px-5 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10">
            <Youtube className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-base font-bold">حزمة يوتيوب</h2>
            <p className="text-xs text-muted-foreground truncate max-w-[300px]">
              {episodeTitle}
            </p>
          </div>
        </div>
        {localEntry && (
          <span className="text-[10px] text-muted-foreground/50">
            {new Date(localEntry.generatedAt).toLocaleDateString("ar-SA")}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/30 bg-card/50 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          <p className="mt-4 text-sm text-muted-foreground">{statusText}</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/30 bg-card/50 py-16">
          <AlertTriangle className="h-8 w-8 text-yellow-400" />
          <p className="mt-4 max-w-sm text-center text-sm text-yellow-400">
            {error}
          </p>
          <Button
            onClick={handleGenerate}
            className="mt-4 gap-2 rounded-xl"
            size="sm"
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : !localEntry ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/30 bg-card/50 py-16">
          <Youtube className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-base font-medium text-muted-foreground">
            لم يتم إنشاء حزمة يوتيوب بعد
          </p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            أنشئ حزمة نشر كاملة ليوتيوب من نص الحلقة
          </p>
          <Button
            onClick={handleGenerate}
            className="mt-6 gap-2 rounded-xl px-6 bg-red-600 hover:bg-red-700"
          >
            <Youtube className="h-4 w-4" />
            توليد الحزمة
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => {
            const isCollapsed = collapsedSections.has(section.id)
            const isRegenerating = regeneratingSection === section.type
            const isCopied = copiedSection === section.id

            return (
              <div
                key={section.id}
                className="overflow-hidden rounded-2xl border border-border/30 bg-white/[0.02] transition-all"
              >
                {/* Section Header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleCollapse(section.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      toggleCollapse(section.id)
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/[0.03]"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                  />
                  <span className="font-semibold">{section.label}</span>
                  <span className="truncate text-xs text-muted-foreground/60 max-w-[200px]">
                    {section.content.slice(0, 60)}...
                  </span>
                  <div className="ms-auto flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopy(section)
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
                      title="نسخ"
                    >
                      {isCopied ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRegenerateSection(section.type)
                      }}
                      disabled={isRegenerating}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground disabled:opacity-50"
                      title="إعادة توليد"
                    >
                      {isRegenerating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Section Content */}
                {!isCollapsed && (
                  <div className="border-t border-border/20 px-4 py-3">
                    <div
                      className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground"
                      dir="auto"
                    >
                      {section.content}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {sections.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border/30 bg-card/50 py-8">
              <p className="text-sm text-muted-foreground">
                لا توجد أقسام في الحزمة
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer Actions */}
      {localEntry && sections.length > 0 && !loading && (
        <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-card/50 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDelete}
                  className="h-8 rounded-xl text-xs"
                >
                  تأكيد الحذف
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDelete(false)}
                  className="h-8 rounded-xl text-xs"
                >
                  إلغاء
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="h-8 gap-1.5 rounded-xl text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                حذف
              </Button>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRegenerateAll}
            disabled={loading}
            className="h-8 gap-1.5 rounded-xl text-xs"
          >
            <RefreshCw className="h-3 w-3" />
            إعادة توليد الكل
          </Button>
        </div>
      )}
    </div>
  )
}
