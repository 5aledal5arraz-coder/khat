"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn, formatTimeSeconds, formatDate as formatDateUtil } from "@/lib/utils"
import type { StudioStageStatus } from "../contexts/stage-status"

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/** Format seconds as HH:MM:SS or MM:SS duration string */
export const formatDuration = formatTimeSeconds

/** Format date as DD/MM/YYYY */
export const formatDate = (dateString: string) => formatDateUtil(dateString)

/** Format seconds as timestamp (alias for formatTimeSeconds) */
export const formatTimestamp = formatTimeSeconds

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// ---------------------------------------------------------------------------
// Status label maps
// ---------------------------------------------------------------------------

export const TRANSCRIPT_STATUS_LABELS: Record<StudioStageStatus, { label: string; className: string }> = {
  idle: { label: "لم يُجلب بعد", className: "bg-muted/60 text-muted-foreground" },
  generating: { label: "جارٍ الجلب...", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  ready: { label: "جاهز", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  error: { label: "خطأ", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
}

export const AI_STATUS_LABELS: Record<StudioStageStatus, { label: string; className: string }> = {
  idle: { label: "لم يُولَّد بعد", className: "bg-muted/60 text-muted-foreground" },
  generating: { label: "جارٍ التوليد...", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  ready: { label: "جاهز", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  error: { label: "خطأ", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
}

export const PROCESSING_STATUS_LABELS: Record<StudioStageStatus, { label: string; className: string }> = {
  idle: { label: "لم يُعالَج بعد", className: "bg-muted/60 text-muted-foreground" },
  generating: { label: "جارٍ المعالجة...", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  ready: { label: "تمت المعالجة", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  error: { label: "خطأ", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
}

export const PLATFORM_COLORS: Record<string, string> = {
  "YouTube Shorts": "bg-red-500/10 text-red-600 dark:text-red-400",
  "IG Reels": "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  "TikTok": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  "X": "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
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
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground/70">{label}</p>
        <p className={cn("text-[13px] truncate", mono && "font-mono text-[11px]")}>
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

export type TabStatus = StudioStageStatus

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
