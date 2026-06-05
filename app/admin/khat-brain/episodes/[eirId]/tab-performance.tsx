/**
 * UX-3b — Performance tab.
 *
 *   - episode_performance_signals row + latest performance_snapshots row
 *     → render score + windows + explanation.
 *   - signal missing, snapshots present → "analyzer hasn't run yet."
 *   - both missing                       → empty state with CLI hints.
 */

import {
  TrendingUp,
  Clock,
  AlertTriangle,
  Activity,
  RefreshCw,
  Calculator,
} from "lucide-react"
import { formatDateTime } from "@/lib/shared/formatters"
import type { WorkspacePerformance } from "@/lib/khat-brain/workspace-tabs"
import type { PerformanceSignalExplanation } from "@/lib/db/schema/performance-signals"
import {
  recomputePerformanceAction,
  refreshYoutubePerformanceAction,
} from "./job-actions"
import { JobActionButton } from "./job-action-button"

export function PerformanceTab({
  perf,
  episodeId,
  eirId,
}: {
  perf: WorkspacePerformance
  episodeId: string | null
  eirId: string
}) {
  if (!perf.signal && !perf.latest_snapshot) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/20 p-6 text-center">
        <TrendingUp className="mx-auto h-6 w-6 text-muted-foreground" />
        <h3 className="mt-2 text-[13px] font-semibold">لا توجد بيانات أداء بعد</h3>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
          ستُجمع لقطات الأداء تلقائياً بعد النشر. يمكنك جدولة لقطة جديدة
          الآن:
        </p>
        <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2">
          <JobActionButton
            label="تحديث بيانات الأداء"
            pendingLabel="جارٍ الجدولة…"
            icon={<RefreshCw className="h-3 w-3" />}
            successTitle="تمت إعادة مزامنة الأداء"
            action={refreshYoutubePerformanceAction.bind(null, eirId)}
            size="md"
          />
        </div>
        <p className="mt-3 text-[10.5px] text-muted-foreground/70">
          بعد دورة العامل ستظهر اللقطة الأولى تلقائياً هنا.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Action row */}
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-border/40 bg-card/30 p-3">
        <JobActionButton
          label="إعادة حساب الأداء"
          pendingLabel="جارٍ الحساب…"
          icon={<Calculator className="h-3 w-3" />}
          successTitle="تم احتساب الإشارة التحريرية"
          action={recomputePerformanceAction.bind(null, eirId)}
        />
        <JobActionButton
          label="تحديث بيانات الأداء"
          pendingLabel="جارٍ الجدولة…"
          icon={<RefreshCw className="h-3 w-3" />}
          successTitle="تمت إعادة مزامنة الأداء"
          action={refreshYoutubePerformanceAction.bind(null, eirId)}
        />
      </div>

      {/* Signal score header */}
      {perf.signal ? (
        <SignalCard signal={perf.signal} />
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
            <AlertTriangle className="h-3 w-3" /> لقطات بدون تحليل
          </div>
          <p className="text-[11.5px] leading-relaxed text-foreground/85">
            توجد لقطات أداء لكن لم يتم احتساب إشارة تحريرية بعد. اضغط
            «إعادة حساب الأداء» في الأعلى.
          </p>
        </div>
      )}

      {/* Latest snapshot */}
      {perf.latest_snapshot && (
        <div className="rounded-2xl border border-border/40 bg-card/30 p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3 w-3" /> آخر لقطة
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini
              label="مشاهدات"
              value={
                perf.latest_snapshot.view_count
                  ? Number(perf.latest_snapshot.view_count).toLocaleString()
                  : "—"
              }
            />
            <Mini
              label="إعجابات"
              value={
                perf.latest_snapshot.like_count
                  ? Number(perf.latest_snapshot.like_count).toLocaleString()
                  : "—"
              }
            />
            <Mini
              label="تعليقات"
              value={
                perf.latest_snapshot.comment_count
                  ? Number(perf.latest_snapshot.comment_count).toLocaleString()
                  : "—"
              }
            />
            <Mini label="عدد اللقطات" value={String(perf.snapshot_count)} />
          </div>
          <div
            className="mt-2 text-[10.5px] text-muted-foreground/70"
            dir="rtl"
          >
            المصدر: {perf.latest_snapshot.source} · بتاريخ{" "}
            {formatDateTime(perf.latest_snapshot.snapshot_at)}
          </div>
        </div>
      )}

      {/* Cross-link to the full Performance & Learning page */}
      <div className="rounded-xl border border-dashed border-border/40 bg-background/20 p-3 text-center text-[11px] text-muted-foreground">
        <Activity className="me-1 inline h-3 w-3" />
        التقرير الموسمي الكامل متاح في «الأداء والتعلّم» من القائمة.
        {episodeId && (
          <span dir="ltr" className="ms-1 text-muted-foreground/60">
            episode_id={episodeId.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Signal card ──────────────────────────────────────────────────────

function SignalCard({
  signal,
}: {
  signal: NonNullable<WorkspacePerformance["signal"]>
}) {
  const explanation = (signal.explanation ??
    null) as PerformanceSignalExplanation | null
  const score = signal.editorial_signal_score
  const tone = score === null
    ? "border-border/40 bg-card/30"
    : score >= 0.6
      ? "border-emerald-500/30 bg-emerald-500/5"
      : score >= 0.35
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-rose-500/30 bg-rose-500/5"
  return (
    <div className={"rounded-2xl border p-4 " + tone}>
      <div className="mb-1 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        <TrendingUp className="h-3 w-3" /> إشارة تحريرية
      </div>
      <div className="flex items-baseline gap-3">
        <div className="text-3xl font-bold tabular-nums" dir="ltr">
          {score === null ? "—" : score.toFixed(3)}
        </div>
        <div className="text-[11.5px] text-muted-foreground">
          {signal.baseline_used && (
            <span dir="ltr">baseline: {signal.baseline_used}</span>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label="مشاهدات 7د" value={fmt(signal.views_at_7d)} />
        <Mini label="مشاهدات 14د" value={fmt(signal.views_at_14d)} />
        <Mini label="مشاهدات 28د" value={fmt(signal.views_at_28d)} />
        <Mini
          label="معدل التفاعل"
          value={
            signal.engagement_rate !== null
              ? `${(Number(signal.engagement_rate) * 100).toFixed(2)}%`
              : "—"
          }
        />
      </div>
      {explanation?.notes && explanation.notes.length > 0 && (
        <ul className="mt-3 list-inside list-disc space-y-0.5 text-[11.5px] text-foreground/85">
          {explanation.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 text-[10.5px] text-muted-foreground/70" dir="ltr">
        calculated {formatDateTime(signal.calculated_at.toISOString())}
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/30 bg-background/40 p-2.5">
      <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className="text-[14px] font-semibold tabular-nums" dir="ltr">
        {value}
      </div>
    </div>
  )
}

function fmt(v: number | null): string {
  if (v === null) return "—"
  return Math.round(v).toLocaleString()
}
