/**
 * «زوار الموقع» — the visitor counter's read side, for the /admin/ops card.
 *
 * ONE statement per page load (the admin home already fans out several, and
 * the connection ceiling is tight): the 30-day daily series, top pages, top
 * sources, and the first recorded day, all as JSON columns of one row. Every
 * window total (today / 7d / 30d) is then DERIVED from the daily series in
 * `deriveVisitorStats()` — pure, unit-tested, and the only place the windows
 * are defined — so the tiles and the sparkline can never disagree.
 *
 * Days are Kuwait calendar days (`VISITOR_TZ`), the same clock that rotates
 * the visitor-id salt. Because the id rotates DAILY, «visitors over 7 days» is
 * the sum of daily uniques: someone who came on three days counts three times.
 * The card says so; it is the price of not tracking anyone across days.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { PAGE_VIEW_EVENT, VISITOR_TZ, SOURCE_KEYS, type TrafficSource } from "./visitor"
import { STATIC_PAGE_LABELS, isTrackablePath } from "./paths"
import { displayEpisodeTitle } from "@/lib/shared/formatters"

export const VISITOR_WINDOW_DAYS = 30
export const TOP_LIMIT = 5

export interface DailyPoint {
  /** Kuwait calendar day, `YYYY-MM-DD`. */
  day: string
  views: number
  visitors: number
}

export interface TopPage {
  path: string
  /** Episode / guest title when the path resolves to one, else a fixed-page label, else the path. */
  label: string
  views: number
  visitors: number
}

export interface TopSource {
  source: Exclude<TrafficSource, "internal">
  views: number
}

export interface VisitorRaw {
  today: string
  firstDay: string | null
  daily: DailyPoint[]
  pages: Array<{ path: string; title: string | null; views: number; visitors: number }>
  sources: Array<{ source: string; views: number }>
}

export const VISITOR_STATS_SQL = sql`
  WITH bounds AS (
    SELECT date_trunc('day', now() AT TIME ZONE ${VISITOR_TZ}) AS today_local
  ),
  ev AS (
    SELECT e.visitor_id,
           e.page_path,
           e.event_data->>'source' AS source,
           (e.created_at AT TIME ZONE ${VISITOR_TZ})::date AS d
    FROM analytics_events e, bounds b
    WHERE e.event_type = ${PAGE_VIEW_EVENT}
      AND e.created_at >= (b.today_local - make_interval(days => ${VISITOR_WINDOW_DAYS - 1})) AT TIME ZONE ${VISITOR_TZ}
  ),
  top_pages AS (
    SELECT page_path, COUNT(*)::int AS views, COUNT(DISTINCT visitor_id)::int AS visitors
    FROM ev GROUP BY page_path ORDER BY views DESC, page_path LIMIT ${TOP_LIMIT}
  )
  SELECT
    to_char((SELECT today_local FROM bounds), 'YYYY-MM-DD') AS today,
    (SELECT to_char(MIN(created_at) AT TIME ZONE ${VISITOR_TZ}, 'YYYY-MM-DD')
       FROM analytics_events WHERE event_type = ${PAGE_VIEW_EVENT}) AS first_day,
    COALESCE((
      SELECT json_agg(json_build_object('day', to_char(d, 'YYYY-MM-DD'), 'views', views, 'visitors', visitors) ORDER BY d)
      FROM (SELECT d, COUNT(*)::int AS views, COUNT(DISTINCT visitor_id)::int AS visitors FROM ev GROUP BY d) t
    ), '[]'::json) AS daily,
    COALESCE((
      SELECT json_agg(json_build_object(
               'path', p.page_path,
               'title', COALESCE(ep.title, g.name, tp.name, 'اقتباس — ' || q.attribution),
               'views', p.views, 'visitors', p.visitors)
             ORDER BY p.views DESC, p.page_path)
      FROM top_pages p
      -- Five rows, each joined on a unique key: cheap. /stories/<slug> is the
      -- legacy alias of /episodes/<slug> (a 308), so it resolves the same way.
      LEFT JOIN episodes ep ON p.page_path IN ('/episodes/' || ep.slug, '/stories/' || ep.slug)
      LEFT JOIN guests g ON p.page_path = '/guests/' || g.slug
      LEFT JOIN topics tp ON p.page_path = '/topics/' || tp.slug
      LEFT JOIN home_quotes q ON p.page_path = '/quotes/' || q.id
    ), '[]'::json) AS pages,
    COALESCE((
      SELECT json_agg(json_build_object('source', source, 'views', views) ORDER BY views DESC, source)
      FROM (SELECT COALESCE(source, 'other') AS source, COUNT(*)::int AS views
            FROM ev WHERE COALESCE(source, 'other') <> 'internal' GROUP BY 1) s
    ), '[]'::json) AS sources
`

/** `null` = unreadable. Never render that as zero. */
export async function getVisitorRaw(): Promise<VisitorRaw | null> {
  if (!db) return null
  try {
    const res = await db.execute(VISITOR_STATS_SQL)
    const row = res.rows[0] as Record<string, unknown> | undefined
    if (!row || typeof row.today !== "string") return null
    return {
      today: row.today,
      firstDay: typeof row.first_day === "string" ? row.first_day : null,
      daily: (row.daily as DailyPoint[]) ?? [],
      pages: (row.pages as VisitorRaw["pages"]) ?? [],
      sources: (row.sources as VisitorRaw["sources"]) ?? [],
    }
  } catch (e) {
    console.error("getVisitorRaw exception:", e)
    return null
  }
}

/** `YYYY-MM-DD` minus `n` calendar days (UTC arithmetic on a date-only value). */
export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export interface WindowTotals {
  views: number
  visitors: number
}

export interface VisitorStats {
  firstDay: string | null
  today: WindowTotals
  week: WindowTotals
  month: WindowTotals
  /** Exactly `VISITOR_WINDOW_DAYS` points, oldest first, missing days filled with 0. */
  series: DailyPoint[]
  topPages: TopPage[]
  topSources: TopSource[]
}

function pageLabel(path: string, title: string | null): string {
  if (title && title.trim()) {
    // The same stamp-free title the episode page itself shows.
    return path.startsWith("/episodes/") || path.startsWith("/stories/")
      ? displayEpisodeTitle(title) || title.trim()
      : title.trim()
  }
  if (STATIC_PAGE_LABELS[path]) return STATIC_PAGE_LABELS[path]
  return path
}

export function deriveVisitorStats(raw: VisitorRaw): VisitorStats {
  const byDay = new Map(raw.daily.map((p) => [p.day, p]))
  const series: DailyPoint[] = []
  for (let i = VISITOR_WINDOW_DAYS - 1; i >= 0; i--) {
    const day = shiftDay(raw.today, i)
    const p = byDay.get(day)
    series.push({ day, views: p?.views ?? 0, visitors: p?.visitors ?? 0 })
  }
  const sum = (points: DailyPoint[]): WindowTotals => ({
    views: points.reduce((a, p) => a + p.views, 0),
    visitors: points.reduce((a, p) => a + p.visitors, 0),
  })
  const known = new Set<string>(SOURCE_KEYS)
  return {
    firstDay: raw.firstDay,
    today: sum(series.slice(-1)),
    week: sum(series.slice(-7)),
    month: sum(series),
    series,
    // A path that fails today's allowlist is never shown — not even raw. The
    // endpoint can no longer store one; this covers rows written before the
    // slug rule tightened, or by hand.
    topPages: raw.pages.filter((p) => isTrackablePath(p.path)).slice(0, TOP_LIMIT).map((p) => ({
      path: p.path,
      label: pageLabel(p.path, p.title),
      views: p.views,
      visitors: p.visitors,
    })),
    topSources: mergeSources(raw.sources, known),
  }
}

/** Unknown bucket names fold into «other» (merged, not duplicated); «internal» is navigation, not a source. */
function mergeSources(rows: VisitorRaw["sources"], known: Set<string>): TopSource[] {
  const acc = new Map<TopSource["source"], number>()
  for (const s of rows) {
    if (s.source === "internal") continue
    const key = (known.has(s.source) ? s.source : "other") as TopSource["source"]
    acc.set(key, (acc.get(key) ?? 0) + s.views)
  }
  return [...acc.entries()]
    .map(([source, views]) => ({ source, views }))
    .sort((a, b) => b.views - a.views || a.source.localeCompare(b.source))
    .slice(0, TOP_LIMIT)
}

export async function getVisitorStats(): Promise<VisitorStats | null> {
  const raw = await getVisitorRaw()
  return raw ? deriveVisitorStats(raw) : null
}

export const SOURCE_LABELS: Record<TopSource["source"], string> = {
  google: "قوقل",
  youtube: "يوتيوب",
  x: "إكس",
  instagram: "إنستقرام",
  whatsapp: "واتساب",
  tiktok: "تيك توك",
  facebook: "فيسبوك",
  other: "مواقع أخرى",
  direct: "مباشر",
}
