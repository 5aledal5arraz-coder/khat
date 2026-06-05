"use client"

import {
  UserSearch, Loader2, AlertCircle, RefreshCw, Sparkles,
  MessageSquareQuote, Target, Mic2, Shield,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useGuestIntelligence, useTranscript } from "../contexts"

export function TabGuestIntelligence() {
  const { guestIntelligence, guestIntelligenceStatus, guestIntelligenceError, generateGuestIntelligence } = useGuestIntelligence()
  const { transcriptStatus } = useTranscript()

  if (transcriptStatus !== "ready") {
    return (
      <div className="py-8 text-center">
        <UserSearch className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">يجب استخراج النص أولاً لتحليل الضيف</p>
      </div>
    )
  }

  if (guestIntelligenceStatus === "idle" || (!guestIntelligence && guestIntelligenceStatus !== "generating")) {
    return (
      <div className="py-8 text-center space-y-4">
        <UserSearch className="h-10 w-10 mx-auto text-teal-400/60" />
        <div>
          <p className="text-sm font-medium">ذكاء الضيف</p>
          <p className="text-xs text-muted-foreground mt-1">
            كشف تلقائي للضيف وأسلوب الحديث والمواقف الرئيسية والاقتباسات البارزة
          </p>
        </div>
        <Button onClick={generateGuestIntelligence} size="sm" className="gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          تحليل الضيف
        </Button>
      </div>
    )
  }

  if (guestIntelligenceStatus === "generating") {
    return (
      <div className="py-8 text-center space-y-3">
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-teal-500" />
        <p className="text-sm text-muted-foreground">جارٍ تحليل الضيف...</p>
      </div>
    )
  }

  if (guestIntelligenceStatus === "error") {
    return (
      <div className="py-6 space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{guestIntelligenceError}</p>
        </div>
        <Button onClick={generateGuestIntelligence} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  const g = guestIntelligence!

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">تحليل ذكي للضيف</span>
        <Button onClick={generateGuestIntelligence} variant="ghost" size="sm" className="gap-1.5 h-7 text-xs">
          <RefreshCw className="h-3 w-3" />
          إعادة التحليل
        </Button>
      </div>

      {/* Detected Name & Bio */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">{g.detected_name || "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{g.detected_bio || "—"}</p>
          </div>
          {g.confidence_score != null && (
            <div className="flex items-center gap-1.5">
              <Shield className={cn(
                "h-4 w-4",
                g.confidence_score >= 0.8 ? "text-emerald-500" :
                g.confidence_score >= 0.5 ? "text-amber-500" : "text-red-500"
              )} />
              <span className={cn(
                "text-xs font-medium",
                g.confidence_score >= 0.8 ? "text-emerald-600 dark:text-emerald-400" :
                g.confidence_score >= 0.5 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
              )}>
                {Math.round(g.confidence_score * 100)}% ثقة
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Speaking Style */}
      {g.speaking_style && (
        <div className="rounded-lg border border-border/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Mic2 className="h-4 w-4 text-violet-500" />
            <p className="text-xs font-medium">أسلوب الحديث</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{g.speaking_style}</p>
        </div>
      )}

      {/* Key Positions */}
      {g.key_positions && g.key_positions.length > 0 && (
        <div className="rounded-lg border border-border/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-blue-500" />
            <p className="text-xs font-medium">المواقف الرئيسية ({g.key_positions.length})</p>
          </div>
          <div className="space-y-2">
            {g.key_positions.map((pos, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                  {i + 1}
                </span>
                <p className="text-sm text-muted-foreground">{pos}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notable Quotes */}
      {g.notable_quotes && g.notable_quotes.length > 0 && (
        <div className="rounded-lg border border-border/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquareQuote className="h-4 w-4 text-amber-500" />
            <p className="text-xs font-medium">اقتباسات بارزة ({g.notable_quotes.length})</p>
          </div>
          <div className="space-y-3">
            {g.notable_quotes.map((q, i) => (
              <div key={i} className="space-y-1">
                <blockquote className="border-r-2 border-amber-300 pr-3 text-sm italic">
                  &ldquo;{q.text}&rdquo;
                </blockquote>
                {q.context && (
                  <p className="text-xs text-muted-foreground pr-5">{q.context}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
