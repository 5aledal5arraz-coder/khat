"use client"

import { useState } from "react"
import {
  CheckCircle2, CircleDot, Circle, Lock,
  AlertTriangle, Info, CircleDashed, Scissors,
  Activity, Timer, RefreshCw, ClipboardCheck, ShieldCheck,
  ClipboardList, Gauge,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTimeSeconds, formatDateTime } from "@/lib/shared/formatters"
// Pure derivations, imported directly (NOT via the "@/lib/studio" barrel, which
// pulls db-backed modules into the client bundle — see studio-client.tsx).
import {
  deriveStepperModel, isReviewApproved,
  attentionCount, notAppliedCount, uncertainCount,
  type StepState,
} from "@/lib/studio/project-stepper"
import type {
  EpisodeReview, ReviewedNote, ReviewNoteStatus, ReviewNoteType, ExtraCut,
} from "@/lib/studio/episode-review"
import type { StudioProject } from "@/lib/studio/projects"
import { useEpisodeReview } from "../contexts"
import { TranscriptionProgressBar } from "./transcription-progress-bar"

// ─── Per-note verdict vocabulary (lucide, NOT emoji; reused KHAT palette) ─────
//
// The honesty principle made visible: `applied` is the ONLY emerald ✅.
// Everything that is not a clean cut is visibly NOT-green — `not_applied` /
// `partial` are the amber "needs your eyes" family (distinguished by icon +
// the % in the detail), and `uncertain` is neutral BLUE with wording that
// tells Khaled to check it himself. Colors are drawn from the existing
// vocabulary (edit-suggestions' CATEGORY_CONFIG + the map's GAP_LABEL_AR) —
// none invented.

const NOTE_STATUS_CONFIG: Record<
  ReviewNoteStatus,
  { label: string; icon: typeof CheckCircle2; chipClass: string; cardClass: string; iconClass: string }
> = {
  applied: {
    label: "تم الحذف",
    icon: CheckCircle2,
    chipClass: "bg-emerald-500/10 text-emerald-700",
    cardClass: "border-emerald-500/20 bg-emerald-500/5",
    iconClass: "text-emerald-700",
  },
  not_applied: {
    label: "لم يُحذف",
    icon: AlertTriangle,
    chipClass: "bg-amber-500/10 text-amber-700",
    cardClass: "border-amber-500/30 bg-amber-500/5",
    iconClass: "text-amber-700",
  },
  partial: {
    label: "قُص جزئياً",
    icon: CircleDashed,
    chipClass: "bg-amber-500/10 text-amber-700",
    cardClass: "border-amber-500/25 bg-amber-500/5",
    iconClass: "text-amber-700",
  },
  uncertain: {
    label: "غير متأكد — راجعه بنفسك",
    icon: Info,
    chipClass: "bg-blue-500/10 text-blue-700",
    cardClass: "border-blue-500/25 bg-blue-500/5",
    iconClass: "text-blue-700",
  },
}

const NOTE_TYPE_LABEL: Record<ReviewNoteType, string> = {
  pre_roll: "بداية الحلقة (ما قبل المحتوى)",
  break: "فترة قطع",
}

/** A raw-timeline range, always LTR + tabular so the → never flips in RTL. */
function RangeChip({ start, end }: { start: number; end: number }) {
  return (
    <span className="text-[12px] font-medium tabular-nums text-muted-foreground" dir="ltr">
      {formatTimeSeconds(start)} → {formatTimeSeconds(end)}
    </span>
  )
}

// ─── The 3-step journey stepper ──────────────────────────────────────────────

const STEP_ICON: Record<StepState, { icon: typeof Circle; className: string }> = {
  done: { icon: CheckCircle2, className: "text-emerald-700" },
  current: { icon: CircleDot, className: "text-blue-700" },
  pending: { icon: Circle, className: "text-muted-foreground/60" },
  locked: { icon: Lock, className: "text-muted-foreground/60" },
}

function StepItem({
  index,
  title,
  state,
  when,
}: {
  index: string
  title: string
  state: StepState
  when: string | null
}) {
  const cfg = STEP_ICON[state]
  const Icon = cfg.icon
  const active = state === "done" || state === "current"
  return (
    <li className="flex min-w-0 flex-1 items-center gap-2">
      <Icon className={cn("h-5 w-5 shrink-0", cfg.className, state === "current" && "admin-shimmer")} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={cn("text-[10.5px] font-semibold tabular-nums", active ? "text-foreground" : "text-muted-foreground")}>
            {index}
          </span>
          <span className={cn("truncate text-[12px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
            {title}
          </span>
        </div>
        <span className="block truncate text-[10px] text-muted-foreground">
          {state === "done" && when ? formatDateTime(when)
            : state === "done" ? "اكتملت"
            : state === "current" ? "الخطوة الحالية"
            : state === "locked" ? "مقفلة حتى الاعتماد"
            : "قادمة"}
        </span>
      </div>
    </li>
  )
}

function Connector({ done }: { done: boolean }) {
  return (
    <li aria-hidden className={cn("h-px w-6 shrink-0 sm:w-10", done ? "bg-emerald-500/40" : "bg-border")} />
  )
}

export function ProjectStepper({
  state,
  mappedAt,
  reviewedAt,
}: {
  state: StudioProject["state"]
  mappedAt: string | null
  reviewedAt: string | null
}) {
  const model = deriveStepperModel(state)
  return (
    <div className="rounded-2xl border border-border/40 bg-card/50 p-4">
      <ol className="flex items-center gap-2">
        <StepItem index="١" title="الخريطة" state={model.map} when={mappedAt} />
        <Connector done={model.map === "done"} />
        <StepItem index="٢" title="المراجعة" state={model.review} when={reviewedAt} />
        <Connector done={model.review === "done"} />
        <StepItem index="٣" title="حزمة النشر" state={model.publish} when={null} />
      </ol>
    </div>
  )
}

// ─── The review display (pure — takes the review as a prop) ──────────────────

function SummaryChip({ icon: Icon, label, count, className }: {
  icon: typeof CheckCircle2; label: string; count: number; className: string
}) {
  if (count === 0) return null
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", className)}>
      <Icon className="h-3 w-3" />
      {label} <span className="tabular-nums" dir="ltr">{count}</span>
    </span>
  )
}

function NoteCard({ note }: { note: ReviewedNote }) {
  const cfg = NOTE_STATUS_CONFIG[note.status]
  const Icon = cfg.icon
  return (
    <li className={cn("rounded-xl border p-3", cfg.cardClass)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span className="text-[12px] font-semibold text-foreground">
            {NOTE_TYPE_LABEL[note.type]}
          </span>
          <RangeChip start={note.raw_range.start} end={note.raw_range.end} />
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-medium", cfg.chipClass)}>
          <Icon className={cn("h-3 w-3", cfg.iconClass)} />
          {cfg.label}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {note.detail}
      </p>
    </li>
  )
}

function ExtraCutCard({ cut }: { cut: ExtraCut }) {
  return (
    <li className="rounded-xl border border-slate-500/20 bg-slate-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-slate-700">
          <Info className="h-3 w-3" />
          قص غير مُعلَّم
        </span>
        <RangeChip start={cut.raw_range.start} end={cut.raw_range.end} />
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{cut.note}</p>
    </li>
  )
}

export function EpisodeReviewView({ review }: { review: EpisodeReview }) {
  const s = review.summary
  return (
    <div className="space-y-4">
      {/* Summary chips — the applied ✅ stands apart from the attention buckets. */}
      <div className="flex flex-wrap items-center gap-2">
        <SummaryChip icon={CheckCircle2} label="تم الحذف" count={s.applied}
          className="bg-emerald-500/10 text-emerald-700" />
        <SummaryChip icon={AlertTriangle} label="لم يُحذف" count={s.not_applied}
          className="bg-amber-500/10 text-amber-700" />
        <SummaryChip icon={CircleDashed} label="قُص جزئياً" count={s.partial}
          className="bg-amber-500/10 text-amber-700" />
        <SummaryChip icon={Info} label="غير متأكد" count={s.uncertain}
          className="bg-blue-500/10 text-blue-700" />
        <SummaryChip icon={Scissors} label="قص إضافي" count={s.extra}
          className="bg-slate-500/10 text-slate-700" />
      </div>

      {/* Per-note verdicts. */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-[12px] font-semibold text-foreground">
          <ClipboardList className="h-4 w-4 text-blue-700" />
          ملاحظات المرحلة الأولى
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground tabular-nums" dir="ltr">
            {review.notes.length}
          </span>
        </div>
        {review.notes.length === 0 ? (
          <p className="rounded-xl border border-border/40 bg-card/40 px-3 py-2.5 text-[11.5px] text-muted-foreground">
            لا توجد ملاحظات في خريطة المرحلة الأولى.
          </p>
        ) : (
          <ul className="space-y-2">
            {review.notes.map((n, i) => <NoteCard key={i} note={n} />)}
          </ul>
        )}
      </section>

      {/* Extra (unmarked) cuts — informational. */}
      {review.extra_cuts.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1 text-[12px] font-semibold text-foreground">
            <Scissors className="h-4 w-4 text-slate-700" />
            قصّات إضافية اكتُشفت
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground tabular-nums" dir="ltr">
              {review.extra_cuts.length}
            </span>
          </div>
          <ul className="space-y-2">
            {review.extra_cuts.map((c, i) => <ExtraCutCard key={i} cut={c} />)}
          </ul>
        </section>
      )}

      {/* Provenance — durations + alignment confidence. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Gauge className="h-3 w-3" />
          ثقة المحاذاة: <span className="tabular-nums" dir="ltr">{Math.round(review.overall_confidence * 100)}%</span>
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums" dir="ltr">
          {formatTimeSeconds(review.raw_duration)} → {formatTimeSeconds(review.edited_duration)}
        </span>
      </div>
    </div>
  )
}

// ─── The approval gate ───────────────────────────────────────────────────────

/**
 * Deliberate friction (Sara): the un-applied / uncertain notes sit ABOVE the
 * approve button with a count, and the button stays MUTED + disabled until
 * Khaled acknowledges he has seen them. He CAN still approve — the checkbox
 * is a one-click acknowledgement, not a wall (maybe he cut it differently on
 * the video) — but he cannot approve past un-applied notes blindly. Modeled
 * on the `selectedCount` gate in diff-preview-modal.
 */
export function ApprovalGate({
  review,
  approving,
  approveError,
  onApprove,
}: {
  review: EpisodeReview
  approving: boolean
  approveError: string
  onApprove: () => void
}) {
  const attention = attentionCount(review)
  const notApplied = notAppliedCount(review)
  const uncertain = uncertainCount(review)
  const [acknowledged, setAcknowledged] = useState(false)

  const gated = attention > 0
  const canApprove = !gated || acknowledged

  return (
    <div className="space-y-3 rounded-2xl border border-border/40 bg-card/50 p-4">
      {gated && (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            راجع قبل الاعتماد
          </div>
          <ul className="space-y-1 text-[11.5px] leading-relaxed text-foreground/85">
            {notApplied > 0 && (
              <li className="inline-flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-amber-700" />
                <span className="tabular-nums" dir="ltr">{notApplied}</span>
                {" "}ملاحظات لم تُطبّق بالكامل (لم تُحذف أو قُصّت جزئياً)
              </li>
            )}
            {uncertain > 0 && (
              <li className="inline-flex items-center gap-1.5">
                <Info className="h-3 w-3 text-blue-700" />
                <span className="tabular-nums" dir="ltr">{uncertain}</span>
                {" "}ملاحظات «غير متأكد» — تعذّر إثباتها نصياً، راجعها بنفسك
              </li>
            )}
          </ul>
          <label className="flex cursor-pointer items-start gap-2 pt-1">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
            />
            <span className="text-[11.5px] leading-relaxed text-foreground/85">
              اطّلعت على الملاحظات أعلاه وأتحمّل مسؤولية اعتمادها (قد أكون قصصتها بشكل مختلف في الفيديو).
            </span>
          </label>
        </div>
      )}

      {approveError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-2.5 text-[11.5px] text-rose-700">
          {approveError}
        </div>
      )}

      <button
        type="button"
        onClick={onApprove}
        disabled={approving || !canApprove}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          canApprove
            // Primary once he can act — emerald, the "this is the action" weight.
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            // Muted/secondary while un-acknowledged (the deliberate friction).
            : "border border-border bg-muted text-muted-foreground",
        )}
      >
        {approving
          ? <Activity className="h-4 w-4 animate-pulse" />
          : <ShieldCheck className="h-4 w-4" />}
        اعتماد المراجعة والانتقال للمرحلة ٣
      </button>
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        الاعتماد ينقل المشروع إلى «تمت المراجعة» ويفتح توليد حزمة النشر (المرحلة ٣).
      </p>
    </div>
  )
}

function ApprovedConfirmation({ reviewedAt }: { reviewedAt: string | null }) {
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        اعتُمدت المراجعة — المرحلة ٣ متاحة الآن
      </div>
      {reviewedAt && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          آخر مراجعة: {formatDateTime(reviewedAt)}
        </p>
      )}
    </div>
  )
}

/** Honest expectation set BEFORE the click — re-transcription is minutes. */
const EXPECTED_COPY =
  "يفرّغ النسخة المعدّلة كاملاً بالتوقيتات ثم يقارنها بالتسجيل الأصلي وخريطة المرحلة الأولى — يستغرق عادةً عدة دقائق. لا تغلق الصفحة."

// ─── Stage container — stepper + trigger/poll + review + approval ────────────

export function StageReview() {
  const {
    project, hydrated, mappedAt, reviewedAt,
    review, status, error, elapsedSeconds, progress, generate,
    approving, approveError, approve,
  } = useEpisodeReview()

  // Only the edited cut of a linked project reaches here (SessionBody guards),
  // but stay defensive — never render a half-journey.
  if (!hydrated || !project) return null

  const approved = isReviewApproved(project.state)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
          <ClipboardCheck className="h-4 w-4 text-blue-700" />
        </div>
        <div>
          <h2 className="text-[13px] font-semibold">المرحلة ٢: مراجعة المونتاج</h2>
          <span className="text-[11px] text-muted-foreground">
            هل طُبّقت قصّات المرحلة الأولى فعلاً على النسخة المعدّلة؟
          </span>
        </div>
      </div>

      <ProjectStepper state={project.state} mappedAt={mappedAt} reviewedAt={reviewedAt} />

      <div className="rounded-2xl border border-border/40 bg-card/50 p-4">
        {/* No review yet, idle → trigger. */}
        {status === "idle" && !review && (
          <div className="space-y-3">
            <p className="inline-flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              <Timer className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{EXPECTED_COPY}</span>
            </p>
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-[12px] font-medium text-blue-700 hover:bg-blue-500/20"
            >
              <ClipboardCheck className="h-4 w-4" />
              تشغيل مراجعة المونتاج
            </button>
          </div>
        )}

        {/* Running → determinate progress bar (stage · % · chunk · ETA), with the
            elapsed counter kept as its quiet secondary line. */}
        {status === "running" && (
          <TranscriptionProgressBar
            progress={progress}
            elapsedSeconds={elapsedSeconds}
            accent="blue"
          />
        )}

        {/* Error. */}
        {status === "error" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-[12px] text-rose-700">
              <div className="inline-flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                تعذّرت المراجعة
              </div>
              <p className="mt-1 text-foreground/85">{error}</p>
            </div>
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-[12px] font-medium text-blue-700 hover:bg-blue-500/20"
            >
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Ready → the review + the approval gate. */}
        {status === "ready" && review && (
          <div className="space-y-4">
            <EpisodeReviewView review={review} />
            {approved
              ? <ApprovedConfirmation reviewedAt={reviewedAt} />
              : (
                <>
                  <ApprovalGate
                    review={review}
                    approving={approving}
                    approveError={approveError}
                    onApprove={approve}
                  />
                  <button
                    type="button"
                    onClick={generate}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className="h-3 w-3" />
                    إعادة تشغيل المراجعة
                  </button>
                </>
              )}
          </div>
        )}
      </div>
    </div>
  )
}
