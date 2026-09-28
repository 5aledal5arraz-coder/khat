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
 *
 * Liveness:
 *   The generation runs in the worker (`season.hybrid_generate`). The click
 *   only enqueues it and returns a jobId; <JobStatusCard> then reports the
 *   real state — queued, «عامل المهام لا يعمل», stage n/2, a failure with its
 *   reason — and survives a reload (the season page looks the job up by its
 *   dedupe key and passes `initialJob`). When it finishes the page refreshes
 *   so the wizard below shows the new pending candidates.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Activity, RefreshCw, AlertTriangle, Timer, Loader2 } from "lucide-react"
import {
  generateHybridTopicsAction,
  type HybridActionResult,
} from "./hybrid-actions"
import { runAction } from "@/app/admin/components/run-action"
import { useJobStatus } from "@/app/admin/components/use-job-status"
import { JobStatusView, useJobRetry } from "@/app/admin/components/job-status-card"
import type { JobSnapshot } from "@/lib/jobs/status-view"
import type { HybridJobResult } from "@/lib/jobs/season-jobs"

/**
 * Honest expectation, derived from measurement — not a promise.
 *
 * Measured 2026-07-22: 277s total, of which 230s was the topic call burning a
 * 120s timeout before succeeding on the retry. With the per-call timeout fixed
 * (HYBRID_AI_TIMEOUT_MS in lib/hybrid-topics/generate.ts) the same run is
 * ~110s AI + ~3s embedding + ~38s enrichment ≈ 2.5 minutes. A retried AI
 * attempt or an enrichment repair pass pushes it toward 8-9 minutes, so the
 * copy names both bands instead of quoting the good case as if it were the
 * only one.
 */
const EXPECTED_COPY =
  "تستغرق عادةً من دقيقتين إلى ٤ دقائق. إذا تعثّرت أول محاولة وأعادها النظام تلقائياً قد تصل إلى ٨–٩ دقائق."

export function HybridGenerateButton({
  seasonId,
  language = "ar",
  count = 10,
  aiBlocked = false,
  aiBlockReason,
  initialJob = null,
}: {
  seasonId: string
  language?: "ar" | "en"
  count?: number
  aiBlocked?: boolean
  aiBlockReason?: string | null
  /** This season's in-flight / just-finished hybrid job, looked up server-side. */
  initialJob?: JobSnapshot | null
}) {
  const [isPending, startTransition] = useTransition()
  // Only a failure to ENQUEUE lands here; the generation's own outcome is the job's result.
  const [result, setResult] = useState<HybridActionResult | null>(null)
  const [jobId, setJobId] = useState<string | null>(initialJob?.id ?? null)
  const [dismissed, setDismissed] = useState(false)
  const router = useRouter()
  const status = useJobStatus({
    jobId,
    initialJob,
    // Candidates were persisted by the worker — re-render the wizard below.
    onSettled: () => router.refresh(),
  })
  const jobRunning = jobId !== null && status.inFlight
  const jobRetry = useJobRetry((newId) => {
    setJobId(newId)
    setDismissed(false)
  })
  const disabled = isPending || aiBlocked || jobRunning
  const jobResult =
    status.job?.status === "succeeded"
      ? (status.job.result as HybridJobResult | null)
      : null

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
            <Sparkles className="h-3 w-3" /> المولّد الهجين
          </div>
          <p className="text-[12px] leading-relaxed text-foreground/85">
            يدمج إشارات السوق، التفكير الأصيل، تعلّم الأداء، وذاكرة المنصة
            لاقتراح حلقات قوية وغير معادة.
          </p>
          {/* Expectation set BEFORE the click — a long wait the operator was
              warned about is a different experience from a frozen screen. */}
          {!aiBlocked && (
            <p
              className="mt-1.5 inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
              data-hybrid-expectation
            >
              <Timer className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>{EXPECTED_COPY}</span>
            </p>
          )}
          {aiBlocked && aiBlockReason && (
            <p
              className="mt-1.5 text-[11px] text-rose-700"
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
              // Hybrid generation is one of the slowest actions in the panel,
              // so it is the likeliest to be cut off by the gateway before it
              // returns. runAction turns that into a normal failure result
              // rendered by the panel below, instead of a rejected transition
              // that leaves the button spinning with nothing explained.
              setResult(null)
              const outcome = await runAction(() =>
                generateHybridTopicsAction({ seasonId, language, count }),
              )
              if (outcome.ok && outcome.data.ok && outcome.data.jobId) {
                setJobId(outcome.data.jobId)
                setDismissed(false)
                return
              }
              setResult(
                outcome.ok
                  ? outcome.data
                  : {
                      ok: false,
                      generation_id: null,
                      generated_for_review: 0,
                      auto_filtered: 0,
                      unenriched: 0,
                      analysis_pending: false,
                      message: outcome.message,
                      preview_titles: [],
                    },
              )
            })
          }
          className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-[12px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          {isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>جارٍ الجدولة…</span>
            </>
          ) : jobRunning ? (
            <>
              <Activity className="h-3.5 w-3.5 animate-pulse" />
              <span>بانتظار اكتمال المهمة…</span>
            </>
          ) : aiBlocked ? (
            "التوليد متوقف — تحقق من حالة AI"
          ) : (
            `إنشاء ${count} مرشّحات هجينة`
          )}
        </button>
      </div>

      {/* The job's real state — queued / worker down / stage n/2 / failed. */}
      {jobId && !dismissed && (
        <JobStatusView
          className="mt-3"
          title="التوليد الهجين"
          jobId={jobId}
          {...status}
          onDismiss={() => setDismissed(true)}
          onRetry={status.job ? () => jobRetry.retry(status.job!.id) : undefined}
          retryPending={jobRetry.pending}
          retryError={jobRetry.error}
        />
      )}

      {result && !result.ok && (
        <div
          className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[12px] text-rose-700"
          data-hybrid-failure
        >
          <div className="inline-flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            تعذّر التوليد
          </div>
          <p className="mt-1 text-foreground/85">{result.message}</p>
        </div>
      )}

      {jobResult && jobResult.ok && !dismissed && (
        <div
          className="mt-3 space-y-2"
          data-hybrid-success
        >
          {/* Path badge — clusters vs foundational. */}
          {jobResult.fallback_path === "foundational" && (
            <div
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-1 text-[11px] text-amber-700"
              data-hybrid-path="foundational"
            >
              <Sparkles className="h-3 w-3" />
              <span>المسار التأسيسي · بُنيت من ذاكرة خط (إشارات السوق غير جاهزة بعد)</span>
            </div>
          )}
          {jobResult.fallback_path === "clusters" && (
            <div
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-[11px] text-emerald-700"
              data-hybrid-path="clusters"
            >
              <Sparkles className="h-3 w-3" />
              <span>بُنيت من إشارات سوق معتمدة</span>
            </div>
          )}

          {/* SYSTEM OUTPUT — never "قُبل". These are pending review. */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-[12px] text-emerald-700/90">
            تم توليد{" "}
            <span className="font-semibold tabular-nums">
              {jobResult.generated_for_review}
            </span>{" "}
            مرشّحاً جديداً للمراجعة. راجِعها في قسم «مراجعة المرشحين الجدد» أدناه.
          </div>

          {/* PARTIAL ENRICHMENT — the run produced cards, but some of them
              arrived without the editorial layer. Reporting the count is the
              difference between an honest result and a false success. */}
          {jobResult.unenriched > 0 && (
            <div
              className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11.5px] leading-relaxed text-amber-700"
              data-hybrid-unenriched
            >
              <div className="inline-flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                إثراء تحريري ناقص
              </div>
              <p className="mt-1 text-foreground/85">
                <span className="font-semibold tabular-nums">
                  {jobResult.unenriched}
                </span>{" "}
                من{" "}
                <span className="font-semibold tabular-nums">
                  {jobResult.generated_for_review}
                </span>{" "}
                مرشّحات وصلت بدون إثراء تحريري — بلا درجة ترتيب ولا محاور ولا
                عدسات. تظهر في المراجعة بعلامة «بدون إثراء تحريري». أعد التوليد
                إذا كنت تحتاج التقييم الكامل.
              </p>
            </div>
          )}

          {/* AI AUTO-FILTER — explicitly labelled as system-side. */}
          {jobResult.auto_filtered > 0 && (
            <div
              className="rounded-xl border border-border/40 bg-background/30 p-3 text-[11.5px] text-muted-foreground"
              data-hybrid-auto-filtered
            >
              استبعد النظام{" "}
              <span className="font-semibold tabular-nums text-foreground/80">
                {jobResult.auto_filtered}
              </span>{" "}
              مرشّحات ضعيفة قبل المراجعة.
            </div>
          )}

          {/* ANALYSIS IN-FLIGHT — banner only, doesn't block candidates. */}
          {jobResult.analysis_pending && (
            <div
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11.5px] text-amber-700"
              data-hybrid-analysis-pending
            >
              <Activity className="h-3 w-3 animate-pulse" />
              جاري تحليل إشارات السوق… سنعرض المرشحات عند اكتمال التحليل.
            </div>
          )}

          {/* Inline preview of newly-generated titles (read-only). */}
          {jobResult.preview_titles.length > 0 && (
            <ul className="list-inside list-disc space-y-1 rounded-xl border border-border/30 bg-background/30 p-3 text-[12px] text-foreground/85">
              {jobResult.preview_titles.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}

          {/* Explicit refresh — also auto-refreshes via revalidatePath. */}
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11.5px] font-medium text-primary hover:bg-primary/20"
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
