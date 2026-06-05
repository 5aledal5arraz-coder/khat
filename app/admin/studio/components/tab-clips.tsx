"use client"

import { useState } from "react"
import {
  Scissors, Loader2, AlertCircle, RefreshCw,
  Copy, Check, Pencil, CheckCircle2, Circle,
  Hash, Sparkles, Package,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useClips } from "../contexts"
import { AI_STATUS_LABELS, PLATFORM_COLORS } from "./shared"
import type { StudioClipItem } from "@/types/database"

export function TabClips() {
  const {
    clipsItems, clipsStatus, clipsError,
    generateClips, updateClipsItems, saveClips,
  } = useClips()

  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [copiedPkgIdx, setCopiedPkgIdx] = useState<number | null>(null)

  const statusInfo = AI_STATUS_LABELS[clipsStatus]

  const updateClipField = (idx: number, field: keyof StudioClipItem, value: string | boolean | string[]) => {
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
      c.clip_title ? `العنوان: ${c.clip_title}` : null,
      `الخطاف: ${c.hook_text}`,
      `الوصف: ${c.caption}`,
      c.viral_hook ? `الخطاف الفيروسي: ${c.viral_hook}` : null,
      c.description ? `الوصف المفصّل: ${c.description}` : null,
      c.hashtags?.length ? `الهاشتاقات: ${c.hashtags.map(h => `#${h}`).join(" ")}` : null,
      `لماذا ينجح: ${c.why_it_works}`,
    ].filter(Boolean).join("\n")
    await navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  /** Copy the posting-ready package: caption + hashtags */
  const handleCopyPackage = async (idx: number) => {
    const c = clipsItems[idx]
    const parts: string[] = []
    if (c.viral_hook) parts.push(c.viral_hook)
    parts.push("")
    parts.push(c.caption)
    if (c.description) {
      parts.push("")
      parts.push(c.description)
    }
    if (c.hashtags?.length) {
      parts.push("")
      parts.push(c.hashtags.map(h => `#${h}`).join(" "))
    }
    await navigator.clipboard.writeText(parts.join("\n"))
    setCopiedPkgIdx(idx)
    setTimeout(() => setCopiedPkgIdx(null), 2000)
  }

  const handleCopyAll = async () => {
    const text = clipsItems.map((c, i) => {
      const lines = [
        `${i + 1}. [${c.platform}] ${c.start_time} - ${c.end_time}`,
        c.clip_title ? `   العنوان: ${c.clip_title}` : null,
        `   الخطاف: ${c.hook_text}`,
        `   الوصف: ${c.caption}`,
        c.viral_hook ? `   الخطاف الفيروسي: ${c.viral_hook}` : null,
        c.description ? `   الوصف المفصّل: ${c.description}` : null,
        c.hashtags?.length ? `   الهاشتاقات: ${c.hashtags.map(h => `#${h}`).join(" ")}` : null,
        `   لماذا ينجح: ${c.why_it_works}`,
        c.used ? "   [تم الاستخدام]" : null,
      ]
      return lines.filter(Boolean).join("\n")
    }).join("\n\n")
    await navigator.clipboard.writeText(text)
    setCopiedIdx(-1)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/30 bg-card/50 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-purple-500" />
            <h2 className="text-[13px] font-semibold">المقاطع القصيرة (Shorts/Reels/TikTok)</h2>
          </div>
          <span className={cn("rounded-md px-2.5 py-0.5 text-[11px] font-medium", statusInfo.className)}>
            {statusInfo.label}
          </span>
        </div>

        {clipsStatus === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ولّد اقتراحات مقاطع قصيرة فيروسية من الحلقة مع أوقات القص والوصف والخطاف وحزمة النشر الكاملة
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
            <span className="text-sm text-muted-foreground">جارٍ تحليل النص واقتراح المقاطع مع حزمة النشر...</span>
          </div>
        )}

        {clipsStatus === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
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

            <div className="space-y-4">
              {clipsItems.map((clip, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-lg border border-border/30 p-4 space-y-3 transition-colors",
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
                      {clip.clip_title && (
                        <span className="text-xs font-medium text-foreground/80">
                          {clip.clip_title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyPackage(idx)}
                        className={cn(
                          "flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-medium transition-colors",
                          copiedPkgIdx === idx
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : "hover:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800"
                        )}
                        title="نسخ حزمة النشر"
                      >
                        {copiedPkgIdx === idx ? <Check className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                        {copiedPkgIdx === idx ? "تم!" : "نسخ الحزمة"}
                      </button>
                      <button
                        onClick={() => handleCopyClip(idx)}
                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
                        title="نسخ الكل"
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
                    <ClipEditForm clip={clip} idx={idx} updateField={updateClipField} />
                  ) : (
                    <ClipDisplay clip={clip} />
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-border/30 pt-4">
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

/** Read-only display of a clip's social package */
function ClipDisplay({ clip }: { clip: StudioClipItem }) {
  return (
    <div className="space-y-3" dir="rtl">
      {/* Viral hook */}
      {clip.viral_hook && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/5 border border-amber-200/50 dark:border-amber-800/30 px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{clip.viral_hook}</p>
        </div>
      )}

      {/* Hook text */}
      <p className="text-sm font-medium">{clip.hook_text}</p>

      {/* Caption */}
      <p className="text-sm text-muted-foreground">{clip.caption}</p>

      {/* Description */}
      {clip.description && (
        <p className="text-xs text-muted-foreground/80 leading-relaxed">{clip.description}</p>
      )}

      {/* Hashtags */}
      {clip.hashtags && clip.hashtags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Hash className="h-3 w-3 text-blue-500 shrink-0" />
          {clip.hashtags.map((tag, i) => (
            <span key={i} className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Why it works */}
      <p className="text-xs text-muted-foreground/70 italic">{clip.why_it_works}</p>
    </div>
  )
}

/** Edit form for a clip */
function ClipEditForm({
  clip, idx, updateField,
}: {
  clip: StudioClipItem
  idx: number
  updateField: (idx: number, field: keyof StudioClipItem, value: string | boolean | string[]) => void
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">البداية</label>
          <input type="text" value={clip.start_time} onChange={(e) => updateField(idx, "start_time", e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-xs font-mono outline-none" dir="ltr" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">النهاية</label>
          <input type="text" value={clip.end_time} onChange={(e) => updateField(idx, "end_time", e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-xs font-mono outline-none" dir="ltr" />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">عنوان المقطع</label>
        <input type="text" value={clip.clip_title || ""} onChange={(e) => updateField(idx, "clip_title", e.target.value)} dir="rtl" className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none" />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">الخطاف الفيروسي</label>
        <input type="text" value={clip.viral_hook || ""} onChange={(e) => updateField(idx, "viral_hook", e.target.value)} dir="rtl" className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none" />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">الخطاف</label>
        <input type="text" value={clip.hook_text} onChange={(e) => updateField(idx, "hook_text", e.target.value)} dir="rtl" className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none" />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">الوصف (كابشن)</label>
        <textarea value={clip.caption} onChange={(e) => updateField(idx, "caption", e.target.value)} dir="rtl" className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none resize-none" rows={2} />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">الوصف المفصّل</label>
        <textarea value={clip.description || ""} onChange={(e) => updateField(idx, "description", e.target.value)} dir="rtl" className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none resize-none" rows={3} />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">الهاشتاقات (مفصولة بفاصلة)</label>
        <input
          type="text"
          value={(clip.hashtags || []).join(", ")}
          onChange={(e) => {
            const tags = e.target.value.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean)
            updateField(idx, "hashtags", tags)
          }}
          dir="ltr"
          className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none"
          placeholder="بودكاست_خط, podcast, motivation"
        />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">لماذا ينجح</label>
        <input type="text" value={clip.why_it_works} onChange={(e) => updateField(idx, "why_it_works", e.target.value)} dir="rtl" className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none" />
      </div>
    </div>
  )
}
