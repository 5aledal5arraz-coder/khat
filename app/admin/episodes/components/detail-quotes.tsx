"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Pencil,
  Check,
  Trash2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  MessageSquareQuote,
  EyeOff,
  Eye,
  CheckSquare,
  Square,
  MinusSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatArabicCount } from "@/lib/utils"
import type { EpisodeQuotesEntry } from "@/types/episodes"
import {
  generateEpisodeQuotes,
  regenerateEpisodeQuotes,
  updateQuoteText,
  deleteQuote,
  publishEpisodeQuotes,
  unpublishEpisodeQuotes,
  deleteAllEpisodeQuotes,
  bulkDeleteQuotes,
  bulkToggleQuotesVisibility,
} from "../quotes-actions"

interface DetailQuotesProps {
  episodeId: string
  episodeTitle: string
  youtubeUrl: string
  guestName: string
  entry: EpisodeQuotesEntry | null
}

export function DetailQuotes({
  episodeId,
  episodeTitle,
  youtubeUrl,
  guestName,
  entry,
}: DetailQuotesProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [localEntry, setLocalEntry] = useState<EpisodeQuotesEntry | null>(entry)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const quotes = localEntry?.quotes || []
  const allSelected = quotes.length > 0 && selectedIds.size === quotes.length
  const someSelected = selectedIds.size > 0 && !allSelected

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(quotes.map((q) => q.id)))
    }
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    setStatusText("جارٍ جلب النص من يوتيوب وتوليد الاقتباسات...")

    try {
      const result = await generateEpisodeQuotes(
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

  const handleRegenerate = async () => {
    setLoading(true)
    setError(null)
    setStatusText("جارٍ إعادة جلب النص وتوليد الاقتباسات...")

    try {
      const result = await regenerateEpisodeQuotes(
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

  const handleSaveEdit = async (quoteId: string) => {
    if (!editText.trim()) return
    await updateQuoteText(episodeId, quoteId, editText)
    setLocalEntry((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        quotes: prev.quotes.map((q) =>
          q.id === quoteId ? { ...q, text: editText.trim() } : q
        ),
      }
    })
    setEditingId(null)
  }

  const handleDeleteQuote = async (quoteId: string) => {
    await deleteQuote(episodeId, quoteId)
    setLocalEntry((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        quotes: prev.quotes.filter((q) => q.id !== quoteId),
      }
    })
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(quoteId)
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    await bulkDeleteQuotes(episodeId, ids)
    setLocalEntry((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        quotes: prev.quotes.filter((q) => !selectedIds.has(q.id)),
      }
    })
    setSelectedIds(new Set())
  }

  const handleBulkHide = async () => {
    const ids = Array.from(selectedIds)
    await bulkToggleQuotesVisibility(episodeId, ids, true)
    setLocalEntry((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        quotes: prev.quotes.map((q) =>
          selectedIds.has(q.id) ? { ...q, hidden: true } : q
        ),
      }
    })
    setSelectedIds(new Set())
  }

  const handleBulkShow = async () => {
    const ids = Array.from(selectedIds)
    await bulkToggleQuotesVisibility(episodeId, ids, false)
    setLocalEntry((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        quotes: prev.quotes.map((q) =>
          selectedIds.has(q.id) ? { ...q, hidden: false } : q
        ),
      }
    })
    setSelectedIds(new Set())
  }

  const handlePublish = async () => {
    await publishEpisodeQuotes(episodeId)
    setLocalEntry((prev) =>
      prev
        ? {
            ...prev,
            status: "published",
            publishedAt: new Date().toISOString(),
          }
        : prev
    )
  }

  const handleUnpublish = async () => {
    await unpublishEpisodeQuotes(episodeId)
    setLocalEntry((prev) =>
      prev ? { ...prev, status: "draft", publishedAt: null } : prev
    )
  }

  const handleDeleteAll = async () => {
    await deleteAllEpisodeQuotes(episodeId)
    setLocalEntry(null)
    setConfirmDeleteAll(false)
    setSelectedIds(new Set())
  }

  const selectedHasHidden = quotes.some(
    (q) => selectedIds.has(q.id) && q.hidden
  )
  const selectedHasVisible = quotes.some(
    (q) => selectedIds.has(q.id) && !q.hidden
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-card/50 px-5 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
            <MessageSquareQuote className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">اقتباسات الحلقة</h2>
            <p className="text-xs text-muted-foreground truncate max-w-[300px]">
              {episodeTitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {localEntry && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                localEntry.status === "published"
                  ? "bg-green-500/10 text-green-700 ring-1 ring-green-500/20"
                  : "bg-yellow-500/10 text-yellow-700 ring-1 ring-yellow-500/20"
              }`}
            >
              {localEntry.status === "published" ? "منشور" : "مسودة"}
            </span>
          )}
        </div>
      </div>

      {/* Bulk Selection Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 px-5 py-2.5">
          <span className="text-xs font-medium text-primary">
            {selectedIds.size} محدد
          </span>
          <div className="flex items-center gap-2">
            {selectedHasVisible && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleBulkHide}
                className="h-7 gap-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground"
              >
                <EyeOff className="h-3 w-3" />
                إخفاء
              </Button>
            )}
            {selectedHasHidden && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleBulkShow}
                className="h-7 gap-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Eye className="h-3 w-3" />
                إظهار
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleBulkDelete}
              className="h-7 gap-1.5 rounded-lg text-[11px] text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              حذف
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              className="h-7 rounded-lg text-[11px]"
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/30 bg-card/50 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">{statusText}</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/30 bg-card/50 py-16">
          <AlertTriangle className="h-8 w-8 text-yellow-700" />
          <p className="mt-4 max-w-sm text-center text-sm text-yellow-700">
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
          <MessageSquareQuote className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-base font-medium text-muted-foreground">
            لم يتم إنشاء اقتباسات بعد
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            استخرج اقتباسات من نص الحلقة تلقائياً
          </p>
          <Button onClick={handleGenerate} className="mt-6 gap-2 rounded-xl px-6">
            <MessageSquareQuote className="h-4 w-4" />
            استخراج اقتباسات
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Select All row */}
          {quotes.length > 0 && (
            <div className="flex items-center gap-3 px-1 pb-1">
              <button
                onClick={toggleSelectAll}
                className="shrink-0 text-muted-foreground transition-all hover:text-foreground"
              >
                {allSelected ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : someSelected ? (
                  <MinusSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4 opacity-50" />
                )}
              </button>
              <span className="text-xs text-muted-foreground">
                {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({formatArabicCount(quotes.length, "اقتباس")})
              </span>
            </div>
          )}

          {quotes.map((quote) => {
            const isSelected = selectedIds.has(quote.id)
            return (
              <div
                key={quote.id}
                className={`group rounded-2xl border p-4 transition-all ${
                  quote.hidden
                    ? "border-border/20 bg-white/[0.01] opacity-50"
                    : isSelected
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/30 bg-white/[0.02] hover:border-border/50"
                }`}
              >
                {editingId === quote.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      dir="auto"
                      className="w-full resize-none rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(quote.id)}
                        className="h-8 gap-1.5 rounded-xl text-xs"
                      >
                        <Check className="h-3.5 w-3.5" />
                        حفظ
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        className="h-8 rounded-xl text-xs"
                      >
                        إلغاء
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleSelect(quote.id)}
                      className="mt-0.5 shrink-0 text-muted-foreground transition-all hover:text-foreground"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 opacity-40 group-hover:opacity-100" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed" dir="auto">
                        &ldquo;{quote.text}&rdquo;
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        {quote.theme && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                            {quote.theme}
                          </span>
                        )}
                        {quote.speaker && (
                          <span className="text-[10px] text-muted-foreground">
                            {quote.speaker === "guest"
                              ? "الضيف"
                              : quote.speaker === "host"
                              ? "المقدم"
                              : ""}
                          </span>
                        )}
                        {quote.hidden && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border">
                            مخفي
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setEditingId(quote.id)
                          setEditText(quote.text)
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteQuote(quote.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {quotes.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border/30 bg-card/50 py-8">
              <p className="text-sm text-muted-foreground">
                تم حذف جميع الاقتباسات
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer Actions */}
      {localEntry && quotes.length > 0 && !loading && (
        <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-card/50 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {confirmDeleteAll ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteAll}
                  className="h-8 rounded-xl text-xs"
                >
                  تأكيد الحذف
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDeleteAll(false)}
                  className="h-8 rounded-xl text-xs"
                >
                  إلغاء
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDeleteAll(true)}
                className="h-8 gap-1.5 rounded-xl text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                حذف الكل
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRegenerate}
              disabled={loading}
              className="h-8 gap-1.5 rounded-xl text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              إعادة توليد
            </Button>
            {localEntry.status === "published" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleUnpublish}
                className="h-8 rounded-xl text-xs"
              >
                إلغاء النشر
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handlePublish}
                className="h-8 gap-1.5 rounded-xl text-xs"
              >
                <Check className="h-3 w-3" />
                نشر
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
