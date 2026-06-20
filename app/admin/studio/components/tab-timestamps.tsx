"use client"

import { useState } from "react"
import {
  ListOrdered, Clock, Loader2, AlertCircle, RefreshCw,
  Copy, Check, Pencil, Plus, Minus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useChapters, useWebsitePkg } from "../contexts"
import { AI_STATUS_LABELS, CopyButton, formatTimestamp } from "./shared"
import type { StudioChapterItem } from "@/types/database"

export function TabTimestamps() {
  const {
    chaptersItems, chaptersStatus, chaptersError,
    generateChapters, updateChaptersItems, saveChapters,
  } = useChapters()
  const { timestamps, websitePkgStatus } = useWebsitePkg()

  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  const statusInfo = AI_STATUS_LABELS[chaptersStatus]

  const updateChapter = (idx: number, field: keyof StudioChapterItem, value: string) => {
    const updated = [...chaptersItems]
    updated[idx] = { ...updated[idx], [field]: value }
    updateChaptersItems(updated)
  }

  const addChapter = () => {
    const last = chaptersItems[chaptersItems.length - 1]
    const newTime = last ? last.start_time : "00:00:00"
    const updated = [...chaptersItems, { start_time: newTime, title: "" }]
    updateChaptersItems(updated)
  }

  const removeChapter = (idx: number) => {
    const updated = chaptersItems.filter((_, i) => i !== idx)
    updateChaptersItems(updated)
    saveChapters(updated)
  }

  const handleCopyYouTube = async () => {
    const text = chaptersItems
      .map((c) => {
        const parts = c.start_time.split(":")
        const display = parts[0] === "00" ? `${parts[1]}:${parts[2]}` : c.start_time
        return `${display} ${c.title}`
      })
      .join("\n")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      {/* YouTube Chapters */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-blue-700" />
            <h2 className="text-[13px] font-semibold">فصول يوتيوب (Chapters)</h2>
          </div>
          <span className={cn("rounded-md px-2.5 py-0.5 text-[11px] font-medium", statusInfo.className)}>
            {statusInfo.label}
          </span>
        </div>

        {chaptersStatus === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ولّد فصولاً زمنية لفيديو يوتيوب لتحسين التنقل و SEO
            </p>
            <Button onClick={generateChapters} className="gap-2">
              <ListOrdered className="h-4 w-4" />
              توليد الفصول
            </Button>
          </div>
        )}

        {chaptersStatus === "generating" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-blue-700" />
            <span className="text-sm text-muted-foreground">جارٍ تحليل النص وتوليد الفصول...</span>
          </div>
        )}

        {chaptersStatus === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-700 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{chaptersError}</p>
            </div>
            <Button variant="outline" onClick={generateChapters} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        )}

        {chaptersStatus === "ready" && chaptersItems.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyYouTube} className="gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5 text-green-700" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "تم النسخ" : "نسخ بتنسيق يوتيوب"}
              </Button>
              <button
                onClick={() => setEditing(!editing)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
                  editing ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
                )}
              >
                <Pencil className="h-3.5 w-3.5" />
                {editing ? "إغلاق التحرير" : "تحرير"}
              </button>
            </div>

            <div className="space-y-1.5">
              {chaptersItems.map((ch, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <input
                        type="text"
                        value={ch.start_time}
                        onChange={(e) => updateChapter(idx, "start_time", e.target.value)}
                        className="w-24 shrink-0 rounded-lg border bg-background px-2 py-1.5 text-xs font-mono text-center outline-none focus:ring-2 focus:ring-primary/20"
                        dir="ltr"
                        placeholder="00:00:00"
                      />
                      <input
                        type="text"
                        value={ch.title}
                        onChange={(e) => updateChapter(idx, "title", e.target.value)}
                        dir="rtl"
                        className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <button
                        onClick={() => removeChapter(idx)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
                        title="حذف"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="w-20 shrink-0 text-xs font-mono text-muted-foreground" dir="ltr">
                        {ch.start_time.startsWith("00:") ? ch.start_time.slice(3) : ch.start_time}
                      </span>
                      <span className="flex-1 text-sm" dir="rtl">{ch.title}</span>
                    </>
                  )}
                </div>
              ))}
            </div>

            {editing && (
              <button
                onClick={addChapter}
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                إضافة فصل
              </button>
            )}

            <div className="border-t border-border/30 pt-4">
              <Button variant="outline" onClick={generateChapters} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                إعادة التوليد
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Website Timestamps */}
      {websitePkgStatus === "ready" && timestamps.length > 0 && (
        <div className="rounded-xl border border-border/30 bg-card/50 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-teal-700" />
              <h2 className="text-[13px] font-semibold">الطوابع الزمنية للموقع ({timestamps.length})</h2>
            </div>
            <CopyButton onClick={() => handleCopy(timestamps.map(t => `${formatTimestamp(t.time_seconds)} ${t.title}`).join("\n"))} />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border p-3">
            {timestamps.map((t, idx) => (
              <div key={idx} className="flex items-center gap-3 text-sm">
                <span className="shrink-0 w-16 text-xs font-mono text-muted-foreground" dir="ltr">
                  {formatTimestamp(t.time_seconds)}
                </span>
                <span dir="rtl">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
