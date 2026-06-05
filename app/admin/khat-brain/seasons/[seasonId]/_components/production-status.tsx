"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Send,
  Youtube,
  Eye,
  Calendar,
  AlertTriangle,
} from "lucide-react"
import {
  convertV2CardToPreparationAction,
  listSeasonProductionStatusAction,
  type ProductionStatusRow,
} from "../../actions"

/**
 * "Closing the loop" panel for the v2 Overview.
 *
 * For every approved card it surfaces three milestones:
 *   1. Approved (always present once we render here)
 *   2. Preparation (set when the admin converts)
 *   3. Published episode (set when the preparation is linked to a real
 *      episode via episode_preparations.linked_episode_id)
 *
 * The "Convert to Preparation" button is the primary action here. It's
 * idempotent — clicking when already-converted just reveals the existing
 * preparation link instead of erroring.
 */
export function ProductionStatusPanel({
  seasonId,
  initialRows,
}: {
  seasonId: string
  initialRows: ProductionStatusRow[]
}) {
  const [rows, setRows] = useState<ProductionStatusRow[]>(initialRows)
  const [refreshing, startRefresh] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Per-row conversion state — only one in flight at a time.
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyTransPending, startBusy] = useTransition()
  const [flash, setFlash] = useState<{
    candidateId: string
    kind: "ok" | "error"
    message: string
  } | null>(null)

  // Auto-clear the flash after a short delay so it doesn't pile up.
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 5000)
    return () => clearTimeout(t)
  }, [flash])

  const refresh = () => {
    startRefresh(async () => {
      const res = await listSeasonProductionStatusAction(seasonId)
      if (res.success) setRows(res.data.rows)
      else setError(res.error)
    })
  }

  const handleConvert = (candidateId: string) => {
    if (busyId) return
    setError(null)
    setBusyId(candidateId)
    startBusy(async () => {
      const res = await convertV2CardToPreparationAction({
        seasonId,
        topicCandidateId: candidateId,
      })
      setBusyId(null)
      if (!res.success) {
        setFlash({
          candidateId,
          kind: "error",
          message: res.error,
        })
        return
      }
      setFlash({
        candidateId,
        kind: "ok",
        message: res.data.was_existing
          ? "موجود مسبقاً — افتح الإعداد"
          : "تم الإنشاء",
      })
      // Optimistic: optimistically inject the preparation link into the
      // local row so the UI updates without waiting for refresh().
      setRows((prev) =>
        prev.map((r) =>
          r.candidate_id === candidateId
            ? {
                ...r,
                candidate_status:
                  r.candidate_status === "approved"
                    ? "converted_to_preparation"
                    : r.candidate_status,
                preparation: {
                  id: res.data.preparation_id,
                  href: res.data.href,
                  created_at: res.data.converted_at,
                },
              }
            : r,
        ),
      )
      // Then re-sync from server in the background — covers cases where
      // server-side state changes invisibly (e.g. status flipped).
      refresh()
    })
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/40 bg-card/20 p-6 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          الإنتاج
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          لا حلقات معتمدة بعد — تظهر سلسلة الإنتاج هنا بعد أول قبول.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            سلسلة الإنتاج
          </div>
          <h3 className="mt-0.5 text-[14px] font-bold">معتمدة → إعداد → منشورة</h3>
        </div>
        {refreshing && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> تحديث…
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-[11.5px] text-rose-400">
          {error}
        </div>
      )}

      <div className="grid gap-2">
        {rows.map((r) => (
          <ProductionRow
            key={r.candidate_id}
            row={r}
            busy={busyId === r.candidate_id && busyTransPending}
            flash={
              flash && flash.candidateId === r.candidate_id ? flash : null
            }
            onConvert={() => handleConvert(r.candidate_id)}
          />
        ))}
      </div>
    </div>
  )
}

function ProductionRow({
  row,
  busy,
  flash,
  onConvert,
}: {
  row: ProductionStatusRow
  busy: boolean
  flash: { kind: "ok" | "error"; message: string } | null
  onConvert: () => void
}) {
  const hasPrep = row.preparation !== null
  const hasEpisode = row.published_episode !== null

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="truncate text-[13px] font-semibold">
              {row.candidate_title}
            </h4>
            {row.guest_name && (
              <span className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {row.guest_name}
              </span>
            )}
          </div>

          {/* Three-step status chain */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <Step label="معتمدة" complete={true} />
            <ChainSeparator complete={hasPrep} />
            <Step label="إعداد" complete={hasPrep} />
            <ChainSeparator complete={hasEpisode} />
            <Step label="منشورة" complete={hasEpisode} />
          </div>

          {/* Episode meta (when published) */}
          {row.published_episode && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
              {row.published_episode.release_date && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {row.published_episode.release_date.slice(0, 10)}
                </span>
              )}
              {typeof row.published_episode.view_count === "number" && (
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {formatViews(row.published_episode.view_count)}
                </span>
              )}
              {row.published_episode.youtube_url && (
                <a
                  href={row.published_episode.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300"
                >
                  <Youtube className="h-3 w-3" />
                  YouTube
                </a>
              )}
            </div>
          )}
        </div>

        {/* Action area — Convert / Open prep / Open episode */}
        <div className="flex flex-col items-end gap-1">
          {!hasPrep && (
            <button
              type="button"
              onClick={onConvert}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] font-bold text-background hover:opacity-90 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              {busy ? "تحويل…" : "تحويل لإعداد"}
            </button>
          )}
          {hasPrep && (
            <Link
              href={row.preparation!.href}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> الإعداد
            </Link>
          )}
          {hasEpisode && (
            <Link
              href={row.published_episode!.href}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-400 hover:opacity-90"
            >
              <ExternalLink className="h-3 w-3" /> الحلقة
            </Link>
          )}
        </div>
      </div>

      {/* Per-row inline flash (success / error) */}
      {flash && (
        <div
          className={
            "mt-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] " +
            (flash.kind === "ok"
              ? "border border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
              : "border border-rose-500/30 bg-rose-500/5 text-rose-400")
          }
        >
          {flash.kind === "ok" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          {flash.message}
        </div>
      )}
    </div>
  )
}

function Step({ label, complete }: { label: string; complete: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 " +
        (complete
          ? "border border-primary/30 bg-primary/5 text-primary"
          : "border border-border/40 bg-background/50 text-muted-foreground")
      }
    >
      {complete ? (
        <CheckCircle2 className="h-2.5 w-2.5" />
      ) : (
        <Circle className="h-2.5 w-2.5" />
      )}
      {label}
    </span>
  )
}

function ChainSeparator({ complete }: { complete: boolean }) {
  return (
    <span
      className={
        "inline-block h-[1.5px] w-3 rounded-full " +
        (complete ? "bg-primary/40" : "bg-border/40")
      }
    />
  )
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
