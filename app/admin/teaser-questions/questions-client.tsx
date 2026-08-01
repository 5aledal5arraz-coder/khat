"use client"

import { useState, useTransition } from "react"
import {
  AlertTriangle,
  Check,
  Clapperboard,
  Loader2,
  Undo2,
  User,
  X,
} from "lucide-react"
import { formatArabicCount, formatDateTime } from "@/lib/shared/formatters"
import type { TeaserQuestionGroup } from "@/lib/teaser"
import type { TeaserQuestion, TeaserQuestionStatus } from "@/types/teaser"
import {
  approveQuestionAction,
  rejectQuestionAction,
  resetQuestionAction,
} from "./actions"
import { runAction } from "@/app/admin/components/run-action"

/**
 * Review rows for `/admin/teaser-questions`.
 *
 * The shape it renders (`TeaserQuestion`) has NO `ip_hash` / `user_agent`
 * field — the query never selects them, so a visitor's fingerprint cannot
 * reach this client payload even by accident.
 *
 * Three actions, no fourth: قبول · رفض · تراجع. `canReview` is false for a
 * VIEWER, in which case no buttons render at all (the server action refuses
 * them anyway — this just stops offering a control that always fails).
 */

const STATUS_CHIP: Record<TeaserQuestionStatus, { label: string; cls: string }> = {
  pending: { label: "قيد المراجعة", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "مقبول", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "مرفوض", cls: "bg-rose-50 text-rose-700 border-rose-200" },
}

export function QuestionGroups({
  groups,
  canReview,
}: {
  groups: TeaserQuestionGroup[]
  canReview: boolean
}) {
  const [error, setError] = useState("")

  return (
    <div className="space-y-5">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {groups.map((g) => (
        <section
          key={g.teaserId}
          data-teaser-group={g.teaserId}
          className="overflow-hidden rounded-2xl border border-border bg-card"
        >
          {/* Group header — which teaser, which episode/guest, still live? */}
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/25 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Clapperboard className="h-4 w-4 shrink-0 text-muted-foreground" />
                <h2
                  dir="auto"
                  className="text-[14px] font-bold leading-tight text-foreground"
                >
                  {g.teaserTitle}
                </h2>
                <span
                  data-live={g.isLive ? "true" : "false"}
                  className={
                    "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
                    (g.isLive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-border bg-muted text-muted-foreground")
                  }
                >
                  {g.isLive ? "نشط" : "منتهي"}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground" dir="auto">
                {g.episodeTitle ? `الحلقة: ${g.episodeTitle}` : "بلا حلقة مرتبطة"}
                {" · "}
                {g.guestName ? `الضيف: ${g.guestName}` : "بلا ضيف معيّن"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
              {formatArabicCount(g.questions.length, "سؤال")}
            </span>
          </header>

          <ul className="divide-y divide-border">
            {g.questions.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                canReview={canReview}
                onError={setError}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function QuestionRow({
  question,
  canReview,
  onError,
}: {
  question: TeaserQuestion
  canReview: boolean
  onError: (msg: string) => void
}) {
  const [busy, start] = useTransition()
  const chip = STATUS_CHIP[question.status]

  const run = (
    action: (id: string) => Promise<{ success: boolean; error?: string }>,
  ) => {
    onError("")
    start(async () => {
      // `busy` disables approve AND reject on this row, so an unwrapped
      // rejection left the row permanently un-actionable with no explanation.
      const outcome = await runAction(() => action(question.id))
      if (!outcome.ok) {
        onError(outcome.message)
        return
      }
      if (!outcome.data.success) {
        onError(outcome.data.error || "تعذّر تنفيذ الإجراء")
      }
    })
  }

  return (
    <li className="p-4" data-question-id={question.id} data-status={question.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={"inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold " + chip.cls}
        >
          {chip.label}
        </span>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <User className="h-3 w-3" />
          <span dir="auto">{question.display_name || "بدون اسم"}</span>
        </span>
        {question.created_at ? (
          <span className="text-[11.5px] text-muted-foreground" dir="ltr">
            {formatDateTime(question.created_at)}
          </span>
        ) : null}
      </div>

      <p
        dir="auto"
        className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground"
      >
        {question.question_text}
      </p>

      {canReview ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* «تراجع» is offered on any non-pending row, and قبول/رفض on any row
              that isn't already in that state — so no click here is final. */}
          {question.status !== "approved" ? (
            <ActionButton
              label="قبول"
              icon={Check}
              busy={busy}
              tone="approve"
              onClick={() => run(approveQuestionAction)}
            />
          ) : null}
          {question.status !== "rejected" ? (
            <ActionButton
              label="رفض"
              icon={X}
              busy={busy}
              tone="reject"
              onClick={() => run(rejectQuestionAction)}
            />
          ) : null}
          {question.status !== "pending" ? (
            <ActionButton
              label="تراجع"
              icon={Undo2}
              busy={busy}
              tone="undo"
              onClick={() => run(resetQuestionAction)}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

const TONE_CLS = {
  approve: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  reject: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  undo: "border-border bg-card text-muted-foreground hover:bg-muted",
} as const

function ActionButton({
  label,
  icon: Icon,
  tone,
  busy,
  onClick,
}: {
  label: string
  icon: typeof Check
  tone: keyof typeof TONE_CLS
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-action={tone}
      // min-h-11 / min-w-[88px] keeps every control at the 44px touch target
      // on a 390px screen, where these three buttons sit side by side.
      className={
        "inline-flex min-h-11 min-w-[88px] items-center justify-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-50 " +
        TONE_CLS[tone]
      }
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}
