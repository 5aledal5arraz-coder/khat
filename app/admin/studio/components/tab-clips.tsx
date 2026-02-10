"use client"

import { useState } from "react"
import {
  Scissors, Loader2, AlertCircle, RefreshCw,
  Copy, Check, Pencil, CheckCircle2, Circle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudioSession } from "./studio-context"
import { AI_STATUS_LABELS, PLATFORM_COLORS } from "./shared"
import type { StudioClipItem } from "@/types/database"

export function TabClips() {
  const {
    clipsItems, clipsStatus, clipsError,
    generateClips, updateClipsItems, saveClips,
  } = useStudioSession()

  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const statusInfo = AI_STATUS_LABELS[clipsStatus]

  const updateClipField = (idx: number, field: keyof StudioClipItem, value: string | boolean) => {
    const updated = [...clipsItems]
    updated[idx] = { ...updated[idx], [field]: value }
    updateClipsItems(updated)
  }

  const toggleUsed = (idx: number) => {
    const updated = [...clipsItems]
    updated[idx] = { ...updated[idx], used: !updated[idx].used }
    updateClipsItems(updated)
    saveClips(updated)
  }

  const handleCopyClip = async (idx: number) => {
    const c = clipsItems[idx]
    const text = [
      `[${c.platform}] ${c.start_time} - ${c.end_time}`,
      `الخطاف: ${c.hook_text}`,
      `الوصف: ${c.caption}`,
      `لماذا ينجح: ${c.why_it_works}`,
    ].join("\n")
    await navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const handleCopyAll = async () => {
    const text = clipsItems.map((c, i) => [
      `${i + 1}. [${c.platform}] ${c.start_time} - ${c.end_time}`,
      `   الخطاف: ${c.hook_text}`,
      `   الوصف: ${c.caption}`,
      `   لماذا ينجح: ${c.why_it_works}`,
      c.used ? "   [تم الاستخدام]" : "",
    ].filter(Boolean).join("\n")).join("\n\n")
    await navigator.clipboard.writeText(text)
    setCopiedIdx(-1)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-purple-500" />
            <h2 className="font-semibold">المقاطع القصيرة (Shorts/Reels/TikTok)</h2>
          </div>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusInfo.className)}>
            {statusInfo.label}
          </span>
        </div>

        {clipsStatus === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ولّد اقتراحات مقاطع قصيرة فيروسية من الحلقة مع أوقات القص والوصف والخطاف
            </p>
            <Button onClick={generateClips} className="gap-2">
              <Scissors className="h-4 w-4" />
              توليد مقاطع قصيرة
            </Button>
          </div>
        )}

        {clipsStatus === "generating" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
            <span className="text-sm text-muted-foreground">جارٍ تحليل النص واقتراح المقاطع...</span>
          </div>
        )}

        {clipsStatus === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{clipsError}</p>
            </div>
            <Button variant="outline" onClick={generateClips} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        )}

        {clipsStatus === "ready" && clipsItems.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyAll} className="gap-1.5">
                {copiedIdx === -1 ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedIdx === -1 ? "تم النسخ" : "نسخ الكل"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {clipsItems.filter((c) => c.used).length}/{clipsItems.length} مُستخدم
              </span>
            </div>

            <div className="space-y-3">
              {clipsItems.map((clip, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-lg border p-4 space-y-3 transition-colors",
                    clip.used && "opacity-60 bg-muted/30"
                  )}
                >
                  {/* Clip header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", PLATFORM_COLORS[clip.platform] || "bg-muted text-muted-foreground")}>
                        {clip.platform}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground" dir="ltr">
                        {clip.start_time} — {clip.end_time}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyClip(idx)}
                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
                        title="نسخ"
                      >
                        {copiedIdx === idx ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                      </button>
                      <button
                        onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                          editingIdx === idx ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
                        )}
                        title="تحرير"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => toggleUsed(idx)}
                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
                        title={clip.used ? "إلغاء الاستخدام" : "تم الاستخدام"}
                      >
                        {clip.used ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Clip content */}
                  {editingIdx === idx ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">البداية</label>
                          <input type="text" value={clip.start_time} onChange={(e) => updateClipField(idx, "start_time", e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-xs font-mono outline-none" dir="ltr" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">النهاية</label>
                          <input type="text" value={clip.end_time} onChange={(e) => updateClipField(idx, "end_time", e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-xs font-mono outline-none" dir="ltr" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">الخطاف</label>
                        <input type="text" value={clip.hook_text} onChange={(e) => updateClipField(idx, "hook_text", e.target.value)} dir="rtl" className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">الوصف</label>
                        <input type="text" value={clip.caption} onChange={(e) => updateClipField(idx, "caption", e.target.value)} dir="rtl" className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">لماذا ينجح</label>
                        <input type="text" value={clip.why_it_works} onChange={(e) => updateClipField(idx, "why_it_works", e.target.value)} dir="rtl" className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5" dir="rtl">
                      <p className="text-sm font-medium">{clip.hook_text}</p>
                      <p className="text-sm text-muted-foreground">{clip.caption}</p>
                      <p className="text-xs text-muted-foreground/70 italic">{clip.why_it_works}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <Button variant="outline" onClick={generateClips} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                إعادة التوليد
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
