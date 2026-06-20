"use client"

import { useState } from "react"
import { ArrowUpFromLine, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { StudioWebsitePackage, Episode } from "@/types/database"

interface DiffFieldRow {
  key: string
  label: string
  currentValue: string
  newValue: string
  checked: boolean
}

export function DiffPreviewModal({
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border/30 bg-card shadow-2xl admin-animate-in">
        <div className="flex items-center justify-between border-b border-border/30 px-6 py-4">
          <h3 className="text-[13px] font-semibold">معاينة التغييرات</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted/40 transition-colors">
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
            <div key={row.key} className="rounded-lg border border-border/30 p-4 space-y-3">
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
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">الجديد</span>
                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-2.5 text-xs leading-relaxed whitespace-pre-wrap min-h-[3rem] max-h-32 overflow-y-auto" dir="rtl">
                    {row.newValue}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border/30 px-6 py-4">
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
