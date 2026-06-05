"use client"

/**
 * Hybrid Topic generation button + result panel.
 *
 * Operator-language guarantee:
 *   • "قُبل / رُفض" are RESERVED for human operator clicks on
 *     individual candidate cards (those live in the wizard below).
 *   • This panel only ever uses:
 *       - "تم توليد N مرشّحاً جديداً"        (system output, pending review)
 *       - "استبعد النظام N مرشّحات ضعيفة"   (AI auto-filter, before review)
 *   • A "جاري تحليل…" banner appears when the action auto-enqueues
 *     downstream pipeline stages; the operator knows that future
 *     generations will be richer once analysis catches up.
 *   • An explicit "عرض المرشحات الجديدة" button refreshes the page so
 *     the wizard below picks up the new pending candidates.
 */

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Activity, RefreshCw, AlertTriangle } from "lucide-react"
import {
  generateHybridTopicsAction,
  type HybridActionResult,
} from "./hybrid-actions"

export function HybridGenerateButton({
  seasonId,
  language = "ar",
  count = 10,
  aiBlocked = false,
  aiBlockReason,
}: {
  seasonId: string
  language?: "ar" | "en"
  count?: number
  aiBlocked?: boolean
  aiBlockReason?: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<HybridActionResult | null>(null)
  const router = useRouter()
  const disabled = isPending || aiBlocked

  // Auto-refresh the server tree as soon as the hybrid action returns
  // ok. revalidatePath happens server-side but doesn't push fresh data
  // into already-mounted client components — `router.refresh()` re-runs
  // the layout + page server components, which re-renders the wizard
  // with the new pending candidates included in `initialPending`.
  useEffect(() => {
    if (result?.ok) {
      router.refresh()
    }
    // We intentionally watch only `result` — the router instance is
    // stable across renders so listing it as a dep is noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-primary/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-200">
            <Sparkles className="h-3 w-3" /> المولّد الهجين
          </div>
          <p className="text-[12px] leading-relaxed text-foreground/85">
            يدمج إشارات السوق، التفكير الأصيل، تعلّم الأداء، وذاكرة المنصة
            لاقتراح حلقات قوية وغير معادة.
          </p>
          {aiBlocked && aiBlockReason && (
            <p
              className="mt-1.5 text-[11px] text-rose-300"
              data-ai-block-reason
            >
              {aiBlockReason}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={disabled}
          title={aiBlocked ? aiBlockReason ?? "الذكاء الاصطناعي غير متاح" : undefined}
          data-ai-blocked={aiBlocked}
          onClick={() =>
            startTransition(async () => {
              const r = await generateHybridTopicsAction({
                seasonId,
                language,
                count,
              })
              setResult(r)
            })
          }
          className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-[12px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
        >
          {isPending
            ? "جارٍ التوليد…"
            : aiBlocked
              ? "التوليد متوقف — تحقق من حالة AI"
              : `إنشاء ${count} مرشّحات هجينة`}
        </button>
      </div>

      {result && !result.ok && (
        <div
          className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[12px] text-rose-200"
          data-hybrid-failure
        >
          <div className="inline-flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            تعذّر التوليد
          </div>
          <p className="mt-1 text-foreground/85">{result.message}</p>
        </div>
      )}

      {result && result.ok && (
        <div
          className="mt-3 space-y-2"
          data-hybrid-success
        >
          {/* Path badge — clusters vs foundational. */}
          {result.fallback_path === "foundational" && (
            <div
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-1 text-[11px] text-amber-200"
              data-hybrid-path="foundational"
            >
              <Sparkles className="h-3 w-3" />
              <span>المسار التأسيسي · بُنيت من ذاكرة خط (إشارات السوق غير جاهزة بعد)</span>
            </div>
          )}
          {result.fallback_path === "clusters" && (
            <div
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-[11px] text-emerald-200"
              data-hybrid-path="clusters"
            >
              <Sparkles className="h-3 w-3" />
              <span>بُنيت من إشارات سوق معتمدة</span>
            </div>
          )}

          {/* SYSTEM OUTPUT — never "قُبل". These are pending review. */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-[12px] text-emerald-100/90">
            تم توليد{" "}
            <span className="font-semibold tabular-nums">
              {result.generated_for_review}
            </span>{" "}
            مرشّحاً جديداً للمراجعة. راجِعها في قسم «مراجعة المرشحين الجدد» أدناه.
          </div>

          {/* AI AUTO-FILTER — explicitly labelled as system-side. */}
          {result.auto_filtered > 0 && (
            <div
              className="rounded-xl border border-border/40 bg-background/30 p-3 text-[11.5px] text-muted-foreground"
              data-hybrid-auto-filtered
            >
              استبعد النظام{" "}
              <span className="font-semibold tabular-nums text-foreground/80">
                {result.auto_filtered}
              </span>{" "}
              مرشّحات ضعيفة قبل المراجعة.
            </div>
          )}

          {/* ANALYSIS IN-FLIGHT — banner only, doesn't block candidates. */}
          {result.analysis_pending && (
            <div
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11.5px] text-amber-200"
              data-hybrid-analysis-pending
            >
              <Activity className="h-3 w-3 animate-pulse" />
              جاري تحليل إشارات السوق… سنعرض المرشحات عند اكتمال التحليل.
            </div>
          )}

          {/* Inline preview of newly-generated titles (read-only). */}
          {result.preview_titles.length > 0 && (
            <ul className="list-inside list-disc space-y-1 rounded-xl border border-border/30 bg-background/30 p-3 text-[12px] text-foreground/85">
              {result.preview_titles.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}

          {/* Explicit refresh — also auto-refreshes via revalidatePath. */}
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[11.5px] font-medium text-violet-200 hover:bg-violet-500/20"
            data-hybrid-show-new
          >
            <RefreshCw className="h-3 w-3" />
            عرض المرشحات الجديدة
          </button>
        </div>
      )}
    </div>
  )
}
