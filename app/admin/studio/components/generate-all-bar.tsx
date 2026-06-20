"use client"

import {
  Sparkles, Loader2, AlertCircle, CheckCircle2, Circle,
  RotateCcw, Play,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePublish, useTranscript, useContent, useChapters, useClips, useWebsitePkg, useDeepAnalysis, useGuestIntelligence, GENERATE_ALL_STEPS } from "../contexts"

export function GenerateAllBar() {
  const {
    generateAll, generateAllRunning, generateAllCurrentStep,
    generateAllCompleted, generateAllError,
  } = usePublish()
  const { transcriptStatus } = useTranscript()
  const { aiStatus } = useContent()
  const { chaptersStatus } = useChapters()
  const { clipsStatus } = useClips()
  const { websitePkgStatus } = useWebsitePkg()
  const { deepAnalysisStatus } = useDeepAnalysis()
  const { guestIntelligenceStatus } = useGuestIntelligence()

  const allReady =
    transcriptStatus === "ready" &&
    aiStatus === "ready" &&
    chaptersStatus === "ready" &&
    clipsStatus === "ready" &&
    websitePkgStatus === "ready" &&
    deepAnalysisStatus === "ready" &&
    guestIntelligenceStatus === "ready"

  const someReady = [transcriptStatus, aiStatus, chaptersStatus, clipsStatus, websitePkgStatus, deepAnalysisStatus, guestIntelligenceStatus]
    .some((s) => s === "ready")
  const hasError = generateAllError !== ""
  const canResume = hasError && someReady && !allReady

  if (allReady && !generateAllRunning && generateAllCompleted.length === 0) {
    return null
  }

  return (
    <div className={cn(
      "rounded-xl border p-5 space-y-4 transition-all duration-200",
      allReady
        ? "border-emerald-500/20 bg-emerald-500/5"
        : "border-amber-500/20 bg-amber-500/5"
    )}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {allReady ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Sparkles className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            </div>
          )}
          <div>
            <h2 className="text-[13px] font-semibold">
              {allReady ? "جميع المراحل مكتملة" : "توليد المحتوى"}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {allReady
                ? "تم توليد جميع مخرجات الذكاء الاصطناعي بنجاح"
                : "نص تلقائي، مخرجات AI، فصول، مقاطع، حزمة الموقع، تحليل عميق، وملف الضيف"}
            </p>
          </div>
        </div>
        {!allReady && (
          <div className="flex items-center gap-2 shrink-0">
            {canResume && (
              <Button
                onClick={generateAll}
                disabled={generateAllRunning}
                variant="outline"
                size="sm"
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-400"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                استئناف
              </Button>
            )}
            <Button
              onClick={generateAll}
              disabled={generateAllRunning}
              size="sm"
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
            >
              {generateAllRunning ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />جارٍ التوليد...</>
              ) : someReady && !hasError ? (
                <><Sparkles className="h-3.5 w-3.5" />إعادة التوليد</>
              ) : (
                <><Play className="h-3.5 w-3.5" />توليد الكل</>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Step progress */}
      {(generateAllRunning || generateAllCompleted.length > 0 || allReady) && (
        <div className="flex flex-wrap gap-2">
          {GENERATE_ALL_STEPS.map((step) => {
            const isCompleted = generateAllCompleted.includes(step.key)
            const isCurrent = generateAllCurrentStep === step.key
            return (
              <div
                key={step.key}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition-all duration-200",
                  isCompleted && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  isCurrent && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                  !isCompleted && !isCurrent && "bg-muted/40 text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                ) : (
                  <Circle className="h-3 w-3 shrink-0" />
                )}
                {step.label}
              </div>
            )
          })}
        </div>
      )}

      {generateAllError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-700 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-700 dark:text-red-400">{generateAllError}</p>
            {canResume && (
              <p className="text-xs text-red-700/70 mt-1.5">
                المراحل المكتملة محفوظة — اضغط &ldquo;استئناف&rdquo; لإكمال المراحل المتبقية
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
