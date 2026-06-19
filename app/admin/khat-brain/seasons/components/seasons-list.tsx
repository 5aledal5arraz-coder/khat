"use client"

/**
 * Seasons list with multi-select bulk deletion.
 *
 * page.tsx (server) fetches the active + archived season summaries and hands
 * them here. This client component owns the interactive surface: per-row
 * checkboxes, a "select all" per section, a sticky "Delete Selected (N)"
 * action bar, and a confirmation dialog. Deletion goes through the
 * deleteSeasonsBulkAction server action (a hard DELETE that cascades to all
 * related season data) and the list refreshes via router.refresh().
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Sparkles,
  Activity,
  AlertTriangle,
  Trash2,
  Loader2,
  X,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Empty } from "@/app/admin/components/ui-kit"
import { formatDateTime } from "@/lib/shared/formatters"
import {
  KHAT_SEASON_STATUS_LABEL,
  KHAT_MAP_V2_MODE_LABEL,
} from "@/types/khat-map"
import type { SeasonSummary } from "@/lib/khat-brain/seasons-summary"
import { deleteSeasonsBulkAction } from "../actions"

export function SeasonsList({
  active,
  archived,
}: {
  active: SeasonSummary[]
  archived: SeasonSummary[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const byId = new Map<string, SeasonSummary>()
  for (const s of [...active, ...archived]) byId.set(s.id, s)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleMany(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  const selectedSeasons = [...selected]
    .map((id) => byId.get(id))
    .filter((s): s is SeasonSummary => Boolean(s))

  function handleConfirmDelete() {
    setError(null)
    const ids = [...selected]
    startTransition(async () => {
      const res = await deleteSeasonsBulkAction(ids)
      if (!res.success) {
        setError(res.error)
        return
      }
      setConfirmOpen(false)
      clearSelection()
      router.refresh()
    })
  }

  return (
    <>
      {/* ── Active seasons ─────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4" /> المواسم النشطة
          </h2>
          {active.length > 0 && (
            <SelectAll
              seasons={active}
              selected={selected}
              onToggleMany={toggleMany}
            />
          )}
        </div>
        {active.length === 0 ? (
          <Empty text="لا توجد مواسم نشطة. ابدأ بضغط «موسم جديد» في الأعلى." />
        ) : (
          <ul className="space-y-2">
            {active.map((s) => (
              <SeasonRow
                key={s.id}
                season={s}
                checked={selected.has(s.id)}
                onToggle={() => toggle(s.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ── Archived seasons (collapsed) ───────────────────────── */}
      {archived.length > 0 && (
        <details className="group rounded-2xl border border-border/40 bg-card/20 p-4">
          <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Activity className="h-4 w-4 transition-transform group-open:rotate-90" />
            مؤرشفة
            <span className="text-[10.5px] text-muted-foreground/60">
              ({archived.length})
            </span>
          </summary>
          <div className="mt-3 flex justify-end">
            <SelectAll
              seasons={archived}
              selected={selected}
              onToggleMany={toggleMany}
            />
          </div>
          <ul className="mt-2 space-y-2">
            {archived.map((s) => (
              <SeasonRow
                key={s.id}
                season={s}
                muted
                checked={selected.has(s.id)}
                onToggle={() => toggle(s.id)}
              />
            ))}
          </ul>
        </details>
      )}

      {/* ── Sticky bulk-action bar ─────────────────────────────── */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-semibold text-foreground" dir="ltr">
              {selected.size}
            </span>
            <span className="text-muted-foreground">محدد</span>
            <button
              type="button"
              onClick={clearSelection}
              className="ms-1 inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> إلغاء التحديد
            </button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="gap-2"
            onClick={() => {
              setError(null)
              setConfirmOpen(true)
            }}
          >
            <Trash2 className="h-4 w-4" />
            حذف المحدد ({selected.size})
          </Button>
        </div>
      )}

      {/* ── Confirmation dialog ────────────────────────────────── */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(v) => {
          if (!isPending) setConfirmOpen(v)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle>
                  {selected.size === 1
                    ? "حذف الموسم؟"
                    : `حذف ${selected.size} مواسم؟`}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  لا يمكن التراجع عن هذا الإجراء. سيتم حذف الموسم وكل بياناته
                  المرتبطة (المرشّحون، المواضيع، القرارات، الإشارات التحريرية).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedSeasons.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border/30 bg-muted/20 p-2">
              <ul className="space-y-1">
                {selectedSeasons.slice(0, 8).map((s) => (
                  <li
                    key={s.id}
                    className="truncate px-2 py-1 text-[12px] text-foreground/80"
                    dir="auto"
                    title={s.name}
                  >
                    • {s.name}
                  </li>
                ))}
              </ul>
              {selectedSeasons.length > 8 && (
                <p className="mt-1 px-2 text-[11px] text-muted-foreground/60">
                  + {selectedSeasons.length - 8} موسم آخر
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => setConfirmOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleConfirmDelete}
              className="gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الحذف...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  تأكيد الحذف
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────

function SelectAll({
  seasons,
  selected,
  onToggleMany,
}: {
  seasons: SeasonSummary[]
  selected: Set<string>
  onToggleMany: (ids: string[], on: boolean) => void
}) {
  const ids = seasons.map((s) => s.id)
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-foreground">
      <input
        type="checkbox"
        checked={allSelected}
        onChange={(e) => onToggleMany(ids, e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-violet-500"
      />
      تحديد الكل
    </label>
  )
}

function SeasonRow({
  season,
  muted,
  checked,
  onToggle,
}: {
  season: SeasonSummary
  muted?: boolean
  checked: boolean
  onToggle: () => void
}) {
  return (
    <li
      className={
        "rounded-2xl border p-4 transition-colors " +
        (checked
          ? "border-violet-500/60 bg-violet-500/5 "
          : "border-border/40 bg-card/30 hover:border-violet-500/40 ") +
        (muted ? "opacity-80" : "")
      }
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`تحديد الموسم: ${season.name}`}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-violet-500"
        />

        {/* Clicking the body toggles selection; the workspace link is separate. */}
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault()
              onToggle()
            }
          }}
          className="min-w-0 flex-1 cursor-pointer"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${KHAT_SEASON_STATUS_LABEL[season.status].bg} ${KHAT_SEASON_STATUS_LABEL[season.status].text}`}
            >
              {KHAT_SEASON_STATUS_LABEL[season.status].label}
            </span>
            {season.v2_mode && (
              <span className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] tracking-wider text-muted-foreground">
                {KHAT_MAP_V2_MODE_LABEL[season.v2_mode] ?? season.v2_mode}
              </span>
            )}
            <span className="text-[10.5px] text-muted-foreground/60" dir="ltr">
              {formatDateTime(season.last_activity_at)}
            </span>
          </div>
          <h3 className="truncate text-[14px] font-semibold leading-tight">
            {season.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
            <span>
              <span className="text-foreground">{season.accepted_count}</span>
              {" / "}
              <span>{season.target_episode_count}</span> معتمدة
            </span>
            <span>{season.pending_count} قيد المراجعة</span>
            <span>
              {season.generated_count} مرشّح · {season.rejected_count} مرفوض
            </span>
          </div>
        </div>

        <Link
          href={`/admin/khat-brain/seasons/${season.id}`}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-[12px] font-medium text-violet-200 transition-colors hover:bg-violet-500/20"
        >
          فتح مساحة العمل ←
        </Link>
      </div>
    </li>
  )
}
