"use client"

import {
  Sparkles, Loader2, AlertCircle, CheckCircle2, Circle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudioSession, GENERATE_ALL_STEPS } from "./studio-context"

export function GenerateAllBar() {
  const {
    generateAll, generateAllRunning, generateAllCurrentStep,
    generateAllCompleted, generateAllError,
  } = useStudioSession()

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-900 dark:from-amber-950/30 dark:to-orange-950/20 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h2 className="font-semibold">توليد الكل</h2>
          <span className="text-xs text-muted-foreground">
            نص تلقائي، مخرجات AI، فصول زمنية، مقاطع قصيرة، وحزمة الموقع
          </span>
        </div>
        <Button
          onClick={generateAll}
          disabled={generateAllRunning}
          className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
        >
          {generateAllRunning ? (
            <><Loader2 className="h-4 w-4 animate-spin" />جارٍ التوليد...</>
          ) : (
            <><Sparkles className="h-4 w-4" />توليد الكل</>
          )}
        </Button>
      </div>

      {/* Step progress — only show when running or completed */}
      {(generateAllRunning || generateAllCompleted.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {GENERATE_ALL_STEPS.map((step) => {
            const isCompleted = generateAllCompleted.includes(step.key)
            const isCurrent = generateAllCurrentStep === step.key
            return (
              <div key={step.key} className="flex items-center gap-1.5">
                {isCompleted ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                )}
                <span className={cn(
                  "text-xs",
                  isCompleted && "text-green-700 dark:text-green-400",
                  isCurrent && "font-medium text-amber-700 dark:text-amber-400",
                  !isCompleted && !isCurrent && "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {generateAllError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{generateAllError}</p>
        </div>
      )}
    </div>
  )
}
