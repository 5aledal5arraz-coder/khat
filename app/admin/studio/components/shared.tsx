"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// ---------------------------------------------------------------------------
// Status label maps
// ---------------------------------------------------------------------------

export const TRANSCRIPT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  not_fetched: { label: "لم يُجلب بعد", className: "bg-muted text-muted-foreground" },
  fetching: { label: "جارٍ الجلب...", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400" },
  ready: { label: "جاهز", className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  error: { label: "خطأ", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
}

export const AI_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  idle: { label: "لم يُولَّد بعد", className: "bg-muted text-muted-foreground" },
  generating: { label: "جارٍ التوليد...", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400" },
  ready: { label: "جاهز", className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  error: { label: "خطأ", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
}

export const PROCESSING_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  idle: { label: "لم يُعالَج بعد", className: "bg-muted text-muted-foreground" },
  processing: { label: "جارٍ المعالجة...", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400" },
  ready: { label: "تمت المعالجة", className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  error: { label: "خطأ", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
}

export const PLATFORM_COLORS: Record<string, string> = {
  "YouTube Shorts": "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  "IG Reels": "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-400",
  "TikTok": "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400",
  "X": "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
}

export const PREVIEW_WORD_LIMIT = 400

// ---------------------------------------------------------------------------
// InfoRow
// ---------------------------------------------------------------------------

export function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={cn("text-sm truncate", mono && "font-mono text-xs")}>
          {value || "—"}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CopyButton
// ---------------------------------------------------------------------------

export function CopyButton({ onClick }: { onClick: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        onClick()
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
      title="نسخ"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Status dot for tab triggers
// ---------------------------------------------------------------------------

export type TabStatus = "idle" | "generating" | "ready" | "error"

export function StatusDot({ status }: { status: TabStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        status === "idle" && "bg-muted-foreground/40",
        status === "generating" && "bg-yellow-500 animate-pulse",
        status === "ready" && "bg-green-500",
        status === "error" && "bg-red-500"
      )}
    />
  )
}
