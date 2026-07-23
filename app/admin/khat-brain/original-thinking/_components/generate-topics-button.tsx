"use client"

/**
 * Phase X — "إنشاء ١٠ مواضيع جديدة" button.
 *
 * Replaces the old inline server-action form that swallowed the
 * generator result. Now surfaces the full tally to the editor:
 * how many were accepted, how many rejected, and WHY each was
 * rejected (in Arabic, never raw enums). On failure it shows the
 * operator-language message in a warning tone.
 *
 * Arabic content only — the English generation path was removed.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { rejectionReasonLabel } from "@/lib/operator-language"
import {
  generateOriginalTopicsAction,
  type GenerateActionResult,
} from "../actions"

export function GenerateTopicsButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [result, setResult] = useState<GenerateActionResult | null>(null)

  const onClick = () => {
    setResult(null)
    start(async () => {
      const r = await generateOriginalTopicsAction("ar", 10)
      setResult(r)
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-[12px] font-medium text-violet-700 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {pending ? "جارٍ التوليد…" : "إنشاء ١٠ مواضيع جديدة"}
      </button>

      {result && (
        <div
          className={cn(
            "w-full max-w-xl rounded-xl border p-3 text-[11.5px] leading-relaxed",
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/5 text-foreground/80"
              : "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          <div className={cn("font-medium", result.ok ? "text-emerald-700" : "text-destructive")}>
            {result.message}
          </div>

          {result.ok && result.rejection_reasons && result.rejection_reasons.length > 0 && (
            <div className="mt-2 border-t border-border/40 pt-2">
              <div className="mb-1 text-[10.5px] font-medium text-muted-foreground">
                أسباب الرفض
              </div>
              <ul className="space-y-1.5">
                {result.rejection_reasons.map((rej, i) => (
                  <li key={i} className="text-foreground/80">
                    <span className="font-medium">«{rej.title || "بلا عنوان"}»</span>
                    {": "}
                    <span className="text-muted-foreground">
                      {rej.reasons.map((r) => rejectionReasonLabel(r)).join("، ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
