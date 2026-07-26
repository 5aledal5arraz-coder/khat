/**
 * UX-3a — Episodes index.
 *
 *   /admin/khat-brain/episodes
 *
 * Filterable list of every active EIR. Server-rendered. URL is the
 * single source of truth for filters (?phase=…&season=…&guest=…&q=…)
 * so a refresh / share preserves the operator's view.
 *
 * Each row carries the next-action CTA from `lib/khat-brain/next-action.ts`
 * — the same surface the Command Center queue uses — so the operator
 * has one mental model: phase + CTA.
 */

import Link from "next/link"
import {
  PlayCircle,
  ArrowRight,
  Search,
  Filter,
} from "lucide-react"
import { requireAdmin } from "@/lib/api-utils"
import {
  listEpisodeWorkspaceIndex,
  type EpisodeIndexFilter,
} from "@/lib/khat-brain/episode-workspace"
import { listSeasons } from "@/lib/khat-map/core/queries"
import {
  EPISODE_PHASES,
  type EpisodePhase,
} from "@/lib/db/schema/eir"
import { nextActionFor, type NextActionTone } from "@/lib/khat-brain/next-action"
import { PHASE_LABEL } from "@/lib/khat-brain/phase-labels"
import { resolveStage } from "@/lib/khat-brain/pipeline-stages"
import { Empty } from "../../components/ui-kit"
import { formatDateTime } from "@/lib/shared/formatters"

export const dynamic = "force-dynamic"

interface SearchParamsShape {
  phase?: string
  /**
   * One of the five funnel stages on `/admin/ops` (see
   * `lib/khat-brain/pipeline-stages.ts`). The home's funnel tiles link here
   * with it — a tile that showed a count and then opened the UNFILTERED list
   * would be a link that breaks its own promise.
   */
  stage?: string
  season?: string
  guest?: string
  q?: string
}

export default async function EpisodesIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsShape>
}) {
  await requireAdmin()
  const params = await searchParams
  // An unrecognised key resolves to `null` → no stage filter at all, rather
  // than an empty phase set that would silently render "no episodes".
  const stage = resolveStage(params.stage)
  const filter: EpisodeIndexFilter = {
    phase:
      params.phase &&
      (EPISODE_PHASES as readonly string[]).includes(params.phase)
        ? (params.phase as EpisodePhase)
        : null,
    phases: stage?.phases ?? null,
    seasonId: params.season ?? null,
    hasGuest:
      params.guest === "has" || params.guest === "missing" ? params.guest : null,
    q: params.q ?? null,
    limit: 200,
  }

  const [rows, seasons] = await Promise.all([
    listEpisodeWorkspaceIndex(filter),
    listSeasons("active"),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <Link
            href="/admin/ops"
            className="mb-2 inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-3 w-3" /> رجوع إلى الرئيسية
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <PlayCircle className="h-5 w-5 text-violet-700" /> خط الإنتاج
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            كل الحلقات النشطة مع الإجراء التالي المقترح لكل واحدة.
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground" dir="rtl">
          {rows.length} حلقة نشطة
        </div>
      </div>

      {/* ── Filters (URL-driven) ─────────────────────────── */}
      <form
        action="/admin/khat-brain/episodes"
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/40 bg-card/30 p-3"
      >
        {/* The stage arrives in the URL, not from a control in this form. It
            is carried through submits as a hidden field so that refining the
            search does not silently widen the list back to every phase; the
            chip beside it is how the operator drops it deliberately. */}
        {stage ? (
          <input type="hidden" name="stage" value={stage.key} />
        ) : null}
        <FilterField label="بحث" htmlFor="q">
          <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-background/40 px-2 py-1.5">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              id="q"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="بعنوان الحلقة"
              className="w-44 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </div>
        </FilterField>
        <FilterField label="مرحلة" htmlFor="phase">
          <select
            id="phase"
            name="phase"
            defaultValue={params.phase ?? ""}
            className="rounded-lg border border-border/40 bg-background/40 px-2 py-1.5 text-[12px] outline-none"
          >
            <option value="">— كل المراحل —</option>
            {EPISODE_PHASES.filter((p) => p !== "archived").map((p) => (
              <option key={p} value={p}>
                {PHASE_LABEL[p]} ({p})
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="موسم" htmlFor="season">
          <select
            id="season"
            name="season"
            defaultValue={params.season ?? ""}
            className="rounded-lg border border-border/40 bg-background/40 px-2 py-1.5 text-[12px] outline-none"
          >
            <option value="">— كل المواسم —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="ضيف" htmlFor="guest">
          <select
            id="guest"
            name="guest"
            defaultValue={params.guest ?? ""}
            className="rounded-lg border border-border/40 bg-background/40 px-2 py-1.5 text-[12px] outline-none"
          >
            <option value="">الكل</option>
            <option value="has">مع ضيف</option>
            <option value="missing">بدون ضيف</option>
          </select>
        </FilterField>
        <button
          type="submit"
          className="ms-auto inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] font-medium text-violet-700 hover:bg-violet-500/20"
        >
          <Filter className="h-3 w-3" /> تطبيق
        </button>
      </form>

      {/* Active stage — stated, and removable in one click. A filter the page
          applies without saying so is how a list gets misread as empty. */}
      {stage ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px]" data-active-stage={stage.key}>
          <span className="text-muted-foreground">المرحلة المعروضة:</span>
          <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 font-medium text-violet-700">
            {stage.label}
          </span>
          <Link
            href={clearStageHref(params)}
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            إلغاء التصفية
          </Link>
        </div>
      ) : null}

      {/* ── Rows ──────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <Empty text="لا توجد حلقات تطابق هذه المعايير." />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <EpisodeRow key={r.id} row={r} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The current URL minus `stage`, so «إلغاء التصفية» drops ONLY the stage and
 * keeps whatever else the operator had narrowed to.
 */
function clearStageHref(params: SearchParamsShape): string {
  const qs = new URLSearchParams()
  if (params.q) qs.set("q", params.q)
  if (params.phase) qs.set("phase", params.phase)
  if (params.season) qs.set("season", params.season)
  if (params.guest) qs.set("guest", params.guest)
  const s = qs.toString()
  return s ? `/admin/khat-brain/episodes?${s}` : "/admin/khat-brain/episodes"
}

// ─── Subcomponents ───────────────────────────────────────────────

function EpisodeRow({
  row,
}: {
  row: Awaited<ReturnType<typeof listEpisodeWorkspaceIndex>>[number]
}) {
  const action = nextActionFor(row.phase)
  const toneCta = toneClasses(action.tone)
  return (
    <li className="rounded-2xl border border-border/40 bg-card/30 p-4 transition-colors hover:border-violet-500/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {PHASE_LABEL[row.phase]}
            </span>
            <span className="text-[10.5px] text-muted-foreground" dir="ltr">
              {row.phase}
            </span>
            {row.season_name && (
              <span
                className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground"
                dir="ltr"
              >
                {row.season_name}
              </span>
            )}
            <span className="text-[10.5px] text-muted-foreground" dir="ltr">
              {formatDateTime(row.updated_at)}
            </span>
          </div>
          <h3 className="truncate text-[13.5px] font-semibold leading-tight">
            {row.working_title}
          </h3>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {row.guest_name ? (
              <>
                <span className="text-foreground">ضيف:</span> {row.guest_name}
              </>
            ) : (
              <span className="text-amber-700">بلا ضيف</span>
            )}
          </div>
        </div>
        <Link
          href={`/admin/khat-brain/episodes/${row.id}`}
          className={
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium " +
            toneCta
          }
        >
          {action.label} ←
        </Link>
      </div>
    </li>
  )
}

function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function toneClasses(tone: NextActionTone): string {
  switch (tone) {
    case "urgent":
      return "border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20"
    case "warning":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
    default:
      return "border-violet-500/40 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20"
  }
}

