"use client"

/**
 * Phase 2 — Market Signals review queue (client surface).
 *
 * Bulk selection + per-card actions. Every action goes through a server
 * action which writes an audit row to market_signal_review_events. The
 * server actions also call revalidatePath so the list refreshes after
 * each operation.
 *
 * NO internal terms. Every label is Arabic operator copy from copy.ts.
 */

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  XCircle,
  Archive,
  RotateCcw,
  Tag as TagIcon,
  StickyNote,
  Activity,
  ChevronDown,
  X as XIcon,
} from "lucide-react"
import {
  approveSignalAction,
  rejectSignalAction,
  archiveSignalAction,
  restoreSignalAction,
  addTagAction,
  removeTagAction,
  setNoteAction,
  bulkApproveAction,
  bulkRejectAction,
  bulkArchiveAction,
  bulkTagAction,
} from "./signal-actions"
import {
  PAGE_COPY,
  STATUS_LABEL,
  TAG_LABEL,
  sourceLabelFor,
  relativeArabic,
} from "./copy"
import {
  explainScoreArabic,
  scoreToneArabic,
} from "./score-explanation"
import type { ScoreComponents } from "@/lib/market-intelligence/scoring"
import {
  SIGNAL_EDITORIAL_TAGS,
  type SignalEditorialTag,
} from "@/lib/db/schema/editorial-intelligence"
import type { ReviewSignal } from "@/lib/market-intelligence/review-queries"

export function SignalsList({
  signals,
  totalForTab,
  page,
  pageSize,
  tabKey,
}: {
  signals: ReviewSignal[]
  totalForTab: number
  page: number
  pageSize: number
  tabKey: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [bulkTagOpen, setBulkTagOpen] = useState(false)

  const allOnPage = useMemo(() => signals.map((s) => s.id), [signals])
  const allSelected =
    selected.size > 0 && allOnPage.every((id) => selected.has(id))

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setSelected((prev) => {
      if (allOnPage.every((id) => prev.has(id))) {
        const next = new Set(prev)
        for (const id of allOnPage) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of allOnPage) next.add(id)
      return next
    })
  }

  const ids = Array.from(selected)
  const runBulk = (
    fn: () => Promise<unknown>,
  ) => {
    start(async () => {
      await fn()
      setSelected(new Set())
      setBulkTagOpen(false)
      router.refresh()
    })
  }

  if (totalForTab === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed border-border/40 bg-card/20 px-6 py-12 text-center text-[12.5px] text-muted-foreground"
        data-empty-tab
      >
        {PAGE_COPY.emptyTab}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      <div
        className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-background/80 px-3 py-2 backdrop-blur"
        data-bulk-bar
      >
        <button
          type="button"
          onClick={toggleAll}
          className="rounded-lg border border-border/40 px-2.5 py-1 text-[11.5px] text-foreground/80 hover:bg-muted/30"
        >
          {allSelected ? PAGE_COPY.clearSelection : PAGE_COPY.selectAll}
        </button>
        <span className="text-[11.5px] text-muted-foreground" data-selection-count>
          {PAGE_COPY.selectionPrefix} {selected.size}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          disabled={pending || ids.length === 0}
          onClick={() => runBulk(() => bulkApproveAction({ signalIds: ids }))}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
          data-bulk-approve
        >
          <CheckCircle2 className="h-3 w-3" /> {PAGE_COPY.bulkApprove}
        </button>
        <button
          type="button"
          disabled={pending || ids.length === 0}
          onClick={() => runBulk(() => bulkRejectAction({ signalIds: ids }))}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11.5px] font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"
          data-bulk-reject
        >
          <XCircle className="h-3 w-3" /> {PAGE_COPY.bulkReject}
        </button>
        <button
          type="button"
          disabled={pending || ids.length === 0}
          onClick={() => runBulk(() => bulkArchiveAction({ signalIds: ids }))}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11.5px] font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-40"
          data-bulk-archive
        >
          <Archive className="h-3 w-3" /> {PAGE_COPY.bulkArchive}
        </button>
        <div className="relative">
          <button
            type="button"
            disabled={pending || ids.length === 0}
            onClick={() => setBulkTagOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11.5px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
            data-bulk-tag
          >
            <TagIcon className="h-3 w-3" /> {PAGE_COPY.bulkTag}
            <ChevronDown className="h-3 w-3" />
          </button>
          {bulkTagOpen && (
            <div
              className="absolute end-0 top-full z-20 mt-1 grid min-w-[180px] grid-cols-1 gap-0.5 rounded-xl border border-border/50 bg-background p-1.5 shadow-lg"
              data-bulk-tag-menu
            >
              {(SIGNAL_EDITORIAL_TAGS as readonly SignalEditorialTag[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="rounded-md px-2 py-1 text-start text-[11.5px] text-foreground/85 hover:bg-muted/30"
                  onClick={() =>
                    runBulk(() => bulkTagAction({ signalIds: ids, tag: t }))
                  }
                >
                  {TAG_LABEL[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card list */}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {signals.map((s) => (
          <SignalCard
            key={s.id}
            signal={s}
            checked={selected.has(s.id)}
            onToggle={() => toggle(s.id)}
            pending={pending}
            onRefresh={() => router.refresh()}
          />
        ))}
      </ul>

      {/* Pagination */}
      <Pagination total={totalForTab} page={page} pageSize={pageSize} tabKey={tabKey} />
    </div>
  )
}

function SignalCard({
  signal,
  checked,
  onToggle,
  pending,
  onRefresh,
}: {
  signal: ReviewSignal
  checked: boolean
  onToggle: () => void
  pending: boolean
  onRefresh: () => void
}) {
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState(signal.operator_notes ?? "")
  const [busy, setBusy] = useState(false)
  const statusInfo = STATUS_LABEL[signal.review_status]

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      onRefresh()
    } finally {
      setBusy(false)
    }
  }

  const statusToneCls =
    statusInfo.tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : statusInfo.tone === "danger"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
        : statusInfo.tone === "warn"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-slate-500/30 bg-slate-500/10 text-slate-200"

  return (
    <li
      className="rounded-2xl border border-border/40 bg-card/30 p-4"
      data-signal-card
      data-signal-id={signal.id}
      data-status={signal.review_status}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-3.5 w-3.5 accent-violet-500"
          aria-label="تحديد الإشارة"
          data-signal-checkbox
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span
              className={
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 " +
                statusToneCls
              }
            >
              {statusInfo.label}
            </span>
            {signal.operator_created && (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-violet-200">
                يدوية
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/30 px-2 py-0.5 text-muted-foreground">
              <Activity className="h-2.5 w-2.5" />
              {sourceLabelFor(signal.source)}
            </span>
            <span className="text-muted-foreground/70">
              {PAGE_COPY.perCard.collectedLabel} {relativeArabic(signal.collected_at)}
            </span>
            {signal.signal_score !== null && (
              <ScoreBadge
                score={signal.signal_score}
                components={signal.score_components as ScoreComponents | null}
              />
            )}
          </div>

          <h3 className="text-[13.5px] font-semibold leading-snug text-foreground">
            {signal.title}
          </h3>

          {signal.description && (
            <p className="mt-1 line-clamp-2 text-[11.5px] text-muted-foreground">
              {signal.description}
            </p>
          )}

          {signal.signal_score !== null && (
            <p
              className="mt-1.5 text-[11px] text-muted-foreground/85"
              data-score-reason
            >
              <span className="text-muted-foreground/70">سبب التقييم:</span>{" "}
              {explainScoreArabic(
                signal.score_components as ScoreComponents | null,
                signal.signal_score,
              )}
            </p>
          )}

          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground/85">
            {signal.theme && (
              <Field label={PAGE_COPY.perCard.themeLabel} value={signal.theme} />
            )}
            {signal.emotional_trigger && (
              <Field
                label={PAGE_COPY.perCard.emotionLabel}
                value={signal.emotional_trigger}
              />
            )}
            {signal.controversy_score !== null && (
              <Field
                label={PAGE_COPY.perCard.controversyLabel}
                value={signal.controversy_score.toFixed(2)}
                ltr
              />
            )}
            {signal.view_signal !== null && (
              <Field
                label={PAGE_COPY.perCard.viewsLabel}
                value={signal.view_signal.toLocaleString()}
                ltr
              />
            )}
          </dl>

          {/* Tags */}
          {signal.editorial_tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {signal.editorial_tags.map((t) => {
                const label = TAG_LABEL[t as SignalEditorialTag] ?? t
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={busy || pending}
                    onClick={() =>
                      run(() => removeTagAction({ signalId: signal.id, tag: t }))
                    }
                    className="group inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/5 px-2 py-0.5 text-[10.5px] text-violet-200 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
                    title="إزالة الوسم"
                  >
                    {label}
                    <XIcon className="h-2.5 w-2.5 opacity-50 group-hover:opacity-100" />
                  </button>
                )
              })}
            </div>
          )}

          {/* Note */}
          {!noteOpen && signal.operator_notes && (
            <div
              className="mt-2 rounded-lg border border-border/30 bg-background/30 p-2 text-[11px] text-foreground/80"
              data-signal-note
            >
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {PAGE_COPY.perCard.notesLabel}
              </div>
              {signal.operator_notes}
            </div>
          )}
          {noteOpen && (
            <div className="mt-2 space-y-1.5">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[11.5px] text-foreground placeholder:text-muted-foreground/60"
                placeholder={PAGE_COPY.perCard.notesLabel}
                dir="rtl"
                data-note-input
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={busy || pending}
                  onClick={() =>
                    run(async () => {
                      await setNoteAction({
                        signalId: signal.id,
                        note: noteDraft,
                      })
                      setNoteOpen(false)
                    })
                  }
                  className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
                  data-note-save
                >
                  {PAGE_COPY.perCard.saveNote}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoteOpen(false)
                    setNoteDraft(signal.operator_notes ?? "")
                  }}
                  className="rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/30"
                >
                  {PAGE_COPY.perCard.cancel}
                </button>
              </div>
            </div>
          )}

          {/* Action row */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {signal.review_status !== "approved" && (
              <ActionBtn
                tone="ok"
                icon={<CheckCircle2 className="h-3 w-3" />}
                label={PAGE_COPY.perCard.approve}
                disabled={busy || pending}
                onClick={() =>
                  run(() => approveSignalAction({ signalId: signal.id }))
                }
                testId="approve"
              />
            )}
            {signal.review_status !== "rejected" && (
              <ActionBtn
                tone="danger"
                icon={<XCircle className="h-3 w-3" />}
                label={PAGE_COPY.perCard.reject}
                disabled={busy || pending}
                onClick={() =>
                  run(() => rejectSignalAction({ signalId: signal.id }))
                }
                testId="reject"
              />
            )}
            {signal.review_status !== "archived" && (
              <ActionBtn
                tone="warn"
                icon={<Archive className="h-3 w-3" />}
                label={PAGE_COPY.perCard.archive}
                disabled={busy || pending}
                onClick={() =>
                  run(() => archiveSignalAction({ signalId: signal.id }))
                }
                testId="archive"
              />
            )}
            {signal.review_status !== "new" && (
              <ActionBtn
                tone="muted"
                icon={<RotateCcw className="h-3 w-3" />}
                label={PAGE_COPY.perCard.restore}
                disabled={busy || pending}
                onClick={() =>
                  run(() => restoreSignalAction({ signalId: signal.id }))
                }
                testId="restore"
              />
            )}

            <div className="relative">
              <button
                type="button"
                disabled={busy || pending}
                onClick={() => setTagMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/5 px-2 py-0.5 text-[11px] text-violet-200 hover:bg-violet-500/15 disabled:opacity-40"
                data-action="add-tag"
              >
                <TagIcon className="h-3 w-3" /> {PAGE_COPY.perCard.addTag}
              </button>
              {tagMenuOpen && (
                <div className="absolute end-0 top-full z-20 mt-1 grid min-w-[160px] grid-cols-1 gap-0.5 rounded-xl border border-border/50 bg-background p-1.5 shadow-lg">
                  {(SIGNAL_EDITORIAL_TAGS as readonly SignalEditorialTag[])
                    .filter((t) => !signal.editorial_tags.includes(t))
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          run(async () => {
                            await addTagAction({ signalId: signal.id, tag: t })
                            setTagMenuOpen(false)
                          })
                        }
                        className="rounded-md px-2 py-1 text-start text-[11px] text-foreground/85 hover:bg-muted/30"
                      >
                        {TAG_LABEL[t]}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {!noteOpen && (
              <button
                type="button"
                disabled={busy || pending}
                onClick={() => setNoteOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/30 disabled:opacity-40"
                data-action="add-note"
              >
                <StickyNote className="h-3 w-3" />
                {signal.operator_notes
                  ? PAGE_COPY.perCard.notesLabel
                  : PAGE_COPY.perCard.addNote}
              </button>
            )}

            {signal.reviewed_at && (
              <span className="ms-auto text-[10.5px] text-muted-foreground/60">
                {PAGE_COPY.perCard.reviewedLabel} {relativeArabic(signal.reviewed_at)}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

function ActionBtn({
  tone,
  icon,
  label,
  disabled,
  onClick,
  testId,
}: {
  tone: "ok" | "danger" | "warn" | "muted"
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
  testId: string
}) {
  const cls = {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
    danger: "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
    muted: "border-border/40 bg-background/40 text-muted-foreground hover:bg-muted/30",
  }[tone]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-action={testId}
      className={
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium disabled:opacity-40 " +
        cls
      }
    >
      {icon}
      {label}
    </button>
  )
}

function Field({
  label,
  value,
  ltr = false,
}: {
  label: string
  value: string
  ltr?: boolean
}) {
  return (
    <>
      <dt className="truncate text-muted-foreground/70">{label}</dt>
      <dd
        className="truncate text-foreground/85"
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </dd>
    </>
  )
}

function ScoreBadge({
  score,
  components,
}: {
  score: number
  components: ScoreComponents | null
}) {
  const tone = scoreToneArabic(score)
  const cls = {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    muted: "border-slate-500/30 bg-slate-500/10 text-slate-200",
  }[tone.tone]
  const title = explainScoreArabic(components, score)
  return (
    <span
      data-score-badge
      title={title}
      className={
        "ms-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] " +
        cls
      }
    >
      <span>قوة الإشارة</span>
      <span className="font-mono tabular-nums" dir="ltr">
        {score.toFixed(2)}
      </span>
      <span className="opacity-80">· {tone.label}</span>
    </span>
  )
}

function Pagination({
  total,
  page,
  pageSize,
  tabKey,
}: {
  total: number
  page: number
  pageSize: number
  tabKey: string
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  if (lastPage <= 1) return null
  const baseHref = "/admin/khat-brain/market/signals"
  const linkFor = (p: number) =>
    `${baseHref}?tab=${tabKey}&page=${p}`
  return (
    <nav
      className="mt-3 flex items-center justify-between rounded-xl border border-border/30 bg-background/30 px-3 py-2 text-[11.5px]"
      aria-label="ترقيم الصفحات"
      data-pagination
    >
      <a
        href={linkFor(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={
          "rounded-md border border-border/40 px-2 py-0.5 hover:bg-muted/30 " +
          (page <= 1 ? "pointer-events-none opacity-40" : "")
        }
      >
        {PAGE_COPY.pagination.prev}
      </a>
      <span className="text-muted-foreground" dir="rtl">
        {PAGE_COPY.pagination.page} {page} {PAGE_COPY.pagination.of} {lastPage}
      </span>
      <a
        href={linkFor(Math.min(lastPage, page + 1))}
        aria-disabled={page >= lastPage}
        className={
          "rounded-md border border-border/40 px-2 py-0.5 hover:bg-muted/30 " +
          (page >= lastPage ? "pointer-events-none opacity-40" : "")
        }
      >
        {PAGE_COPY.pagination.next}
      </a>
    </nav>
  )
}
