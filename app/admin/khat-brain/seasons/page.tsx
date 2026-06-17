/**
 * UX-2 — Seasons list (the new entry point for season planning).
 *
 *   /admin/khat-brain/seasons
 *
 * Replaces the legacy /admin/khat-map dashboard funnel with a clean
 * list of every active season + their status / target / accepted /
 * pending counts. One primary CTA per row: "open workspace".
 *
 * Creating a new season still flows through the existing v2 setup form
 * (we link to it rather than embedding it — UX-2 stays focused on
 * navigation + workspace; UX-2.5 doesn't need a new create flow).
 */

import Link from "next/link"
import { Compass, Plus, ArrowLeft, Sparkles, Activity } from "lucide-react"
import { requireAdmin } from "@/lib/api-utils"
import { listSeasonSummaries } from "@/lib/khat-brain/seasons-summary"
import { KHAT_SEASON_STATUS_LABEL, KHAT_MAP_V2_MODE_LABEL } from "@/types/khat-map"
import { formatDateTime } from "@/lib/shared/formatters"
import { Empty } from "../../components/ui-kit"

export const dynamic = "force-dynamic"

export default async function SeasonsListPage() {
  await requireAdmin()
  const [active, archived] = await Promise.all([
    listSeasonSummaries("active"),
    listSeasonSummaries("archived"),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/5 via-violet-500/5 to-transparent p-6">
        <div className="absolute -top-8 -end-8 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary">
              <Compass className="h-3 w-3" /> المواسم والمواضيع
            </div>
            <h1 className="text-2xl font-bold tracking-tight">المواسم</h1>
            <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
              مواسم Khat تُولّد حلقاتها هنا. اختر موسماً نشطاً لفتح مساحة عمل
              التوليد الهجين، أو ابدأ موسماً جديداً.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/admin/khat-brain/seasons/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-[12.5px] font-medium text-violet-200 transition-colors hover:bg-violet-500/20"
            >
              <Plus className="h-3.5 w-3.5" /> موسم جديد
            </Link>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="مواسم نشطة" value={active.length} />
          <Stat
            label="حلقات معتمدة"
            value={active.reduce((a, s) => a + s.accepted_count, 0)}
          />
          <Stat
            label="مرشّحون قيد المراجعة"
            value={active.reduce((a, s) => a + s.pending_count, 0)}
          />
          <Stat label="مواسم مؤرشفة" value={archived.length} />
        </div>
      </div>

      {/* ── Active seasons ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Sparkles className="h-4 w-4" /> المواسم النشطة
        </h2>
        {active.length === 0 ? (
          <Empty
            text="لا توجد مواسم نشطة. ابدأ بضغط «موسم جديد» في الأعلى."
          />
        ) : (
          <ul className="space-y-2">
            {active.map((s) => (
              <SeasonRow key={s.id} season={s} />
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
          <ul className="mt-3 space-y-2 opacity-70">
            {archived.map((s) => (
              <SeasonRow key={s.id} season={s} muted />
            ))}
          </ul>
        </details>
      )}

      {/* ── Back link to home ─────────────────────────────────── */}
      <div className="flex justify-end">
        <Link
          href="/admin/khat-brain"
          className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> رجوع إلى مركز القيادة
        </Link>
      </div>
    </div>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────

function SeasonRow({
  season,
  muted,
}: {
  season: Awaited<ReturnType<typeof listSeasonSummaries>>[number]
  muted?: boolean
}) {
  return (
    <li
      className={
        "rounded-2xl border border-border/40 bg-card/30 p-4 transition-colors hover:border-violet-500/40 " +
        (muted ? "opacity-80" : "")
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${KHAT_SEASON_STATUS_LABEL[season.status].bg} ${KHAT_SEASON_STATUS_LABEL[season.status].text}`}
            >
              {KHAT_SEASON_STATUS_LABEL[season.status].label}
            </span>
            {season.v2_mode && (
              <span
                className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] tracking-wider text-muted-foreground"
              >
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
            <span>
              {season.pending_count} قيد المراجعة
            </span>
            <span>{season.generated_count} مرشّح · {season.rejected_count} مرفوض</span>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums" dir="ltr">
        {value.toLocaleString()}
      </div>
    </div>
  )
}
