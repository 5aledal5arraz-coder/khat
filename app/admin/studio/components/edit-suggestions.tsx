"use client"

import {
  Scissors, Loader2, AlertCircle, RefreshCw,
  Pause, Repeat, MessageSquareOff, Wind, HelpCircle, Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranscript, useAudio } from "../contexts"
import { formatTimestamp } from "./shared"
import type { AudioEditSuggestion } from "@/types/database"

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<AudioEditSuggestion["category"], {
  label: string
  icon: React.ElementType
  color: string
  bgColor: string
}> = {
  long_pause: {
    label: "صمت طويل",
    icon: Pause,
    color: "text-slate-700",
    bgColor: "bg-slate-100 dark:bg-slate-900",
  },
  repetitive: {
    label: "كلام مكرر",
    icon: Repeat,
    color: "text-amber-700",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
  },
  off_topic: {
    label: "خارج الموضوع",
    icon: MessageSquareOff,
    color: "text-red-700",
    bgColor: "bg-red-50 dark:bg-red-950/30",
  },
  filler: {
    label: "حشو",
    icon: Wind,
    color: "text-blue-700",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  other: {
    label: "أخرى",
    icon: HelpCircle,
    color: "text-gray-700",
    bgColor: "bg-gray-50 dark:bg-gray-900",
  },
}

// ---------------------------------------------------------------------------
// Edit Suggestions Content (rendered inside AccordionSection)
// ---------------------------------------------------------------------------

export function EditSuggestionsContent() {
  const { transcriptStatus } = useTranscript()
  const {
    editSuggestions, editSuggestionsStatus, editSuggestionsError,
    editSuggestionsCutSeconds, generateEditSuggestions,
  } = useAudio()

  if (transcriptStatus !== "ready") {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        حوّل الملف الصوتي إلى نص أولاً لتتمكن من تحليل المقاطع
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        يحلل الذكاء الاصطناعي نص الحلقة ويقترح المقاطع التي يُنصح بحذفها لتحسين جودة الصوت والمحتوى
      </p>

      {editSuggestionsStatus === "idle" && (
        <Button
          onClick={generateEditSuggestions}
          className="gap-2 bg-rose-600 hover:bg-rose-700"
        >
          <Scissors className="h-4 w-4" />
          تحليل المقاطع للحذف
        </Button>
      )}

      {editSuggestionsStatus === "generating" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-rose-700" />
          <span className="text-sm text-muted-foreground">جارٍ تحليل النص واكتشاف المقاطع...</span>
          <span className="text-xs text-muted-foreground">قد تستغرق هذه العملية دقيقة أو أكثر</span>
        </div>
      )}

      {editSuggestionsStatus === "error" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-400">{editSuggestionsError}</p>
          </div>
          <Button variant="outline" onClick={generateEditSuggestions} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </Button>
        </div>
      )}

      {editSuggestionsStatus === "ready" && editSuggestions && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Scissors className="h-4 w-4 text-rose-700" />
              <span className="font-medium">{editSuggestions.length} اقتراح للحذف</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>يمكن توفير {formatDuration(editSuggestionsCutSeconds)}</span>
            </div>
          </div>

          {/* Category summary */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(groupByCategory(editSuggestions)).map(([cat, items]) => {
              const config = CATEGORY_CONFIG[cat as AudioEditSuggestion["category"]]
              const Icon = config.icon
              return (
                <span
                  key={cat}
                  className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", config.bgColor)}
                >
                  <Icon className={cn("h-3 w-3", config.color)} />
                  {config.label} ({items.length})
                </span>
              )
            })}
          </div>

          {/* Suggestion list */}
          <div className="space-y-2">
            {editSuggestions.map((suggestion, i) => (
              <SuggestionCard key={i} suggestion={suggestion} index={i + 1} />
            ))}
          </div>

          {/* Regenerate */}
          <Button
            variant="outline"
            size="sm"
            onClick={generateEditSuggestions}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة التحليل
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single suggestion card
// ---------------------------------------------------------------------------

function SuggestionCard({ suggestion, index }: { suggestion: AudioEditSuggestion; index: number }) {
  const config = CATEGORY_CONFIG[suggestion.category]
  const Icon = config.icon
  const duration = suggestion.end_seconds - suggestion.start_seconds

  return (
    <div className="flex gap-3 rounded-lg border border-border/30 p-3">
      {/* Index */}
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {index}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Header: time range + category */}
        <div className="flex items-center flex-wrap gap-2">
          <span className="font-mono text-sm font-medium">
            {formatTimestamp(suggestion.start_seconds)} → {formatTimestamp(suggestion.end_seconds)}
          </span>
          <span className="text-xs text-muted-foreground">({formatDuration(duration)})</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              config.bgColor
            )}
          >
            <Icon className={cn("h-2.5 w-2.5", config.color)} />
            {config.label}
          </span>
        </div>

        {/* Reason */}
        <p className="text-sm text-muted-foreground" dir="rtl" style={{ lineHeight: 1.7 }}>
          {suggestion.reason}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m === 0) return `${s} ثانية`
  if (s === 0) return `${m} دقيقة`
  return `${m}:${s.toString().padStart(2, "0")} دقيقة`
}

function groupByCategory(suggestions: AudioEditSuggestion[]): Record<string, AudioEditSuggestion[]> {
  const groups: Record<string, AudioEditSuggestion[]> = {}
  for (const s of suggestions) {
    if (!groups[s.category]) groups[s.category] = []
    groups[s.category].push(s)
  }
  return groups
}
