import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getEpisodes } from "@/lib/queries/episodes"
import { getAllPaths } from "@/lib/emotional-paths"
import { db, USE_DB } from "@/lib/db"
import { visitorEvents } from "@/lib/db/schema"
import { desc, sql, gte } from "drizzle-orm"

const PERIOD_MAP: Record<string, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
}

const EMPTY_RESPONSE = {
  uniqueVisitors: 0,
  episodeViews: 0,
  engagementRate: 0,
  searchCount: 0,
  totalEvents: 0,
  topEpisodes: [],
  contentBreakdown: [],
  topSearches: [],
  topPaths: [],
}

export async function GET(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const period = request.nextUrl.searchParams.get("period") || "30d"
  const days = PERIOD_MAP[period] ?? 30

  // Compute start date
  let startDate: string | null = null
  if (days !== null) {
    const d = new Date()
    d.setDate(d.getDate() - days)
    startDate = d.toISOString()
  }

  // Check if DB is configured
  if (!USE_DB) {
    return NextResponse.json({ configured: false, ...EMPTY_RESPONSE })
  }

  try {
    const query = db!.select({
      visitor_id: visitorEvents.visitor_id,
      event_type: visitorEvents.event_type,
      target_id: visitorEvents.target_id,
      metadata: visitorEvents.metadata,
      created_at: visitorEvents.created_at,
    })
      .from(visitorEvents)
      .orderBy(desc(visitorEvents.created_at))
      .limit(50000)

    const events = startDate
      ? await query.where(gte(visitorEvents.created_at, new Date(startDate)))
      : await query

    if (!events || events.length === 0) {
      return NextResponse.json({ configured: true, ...EMPTY_RESPONSE })
    }

    // Fetch episodes & paths for enrichment
    const [episodes, paths] = await Promise.all([
      getEpisodes({ includeHidden: true }),
      getAllPaths(),
    ])

    const episodeMap = new Map(episodes.map((e) => [e.id, e]))
    const pathMap = new Map(paths.map((p) => [p.slug as string, p]))

    // --- Aggregation ---
    const visitorIds = new Set<string>()
    const episodeViewCounts = new Map<string, number>()
    const deepWatchCounts = new Map<string, number>()
    const contentCounts = new Map<string, number>()
    const searchCounts = new Map<string, number>()
    const pathCounts = new Map<string, number>()
    const deepWatchVisitors = new Set<string>()

    let searchEventTotal = 0

    for (const ev of events) {
      visitorIds.add(ev.visitor_id)

      switch (ev.event_type) {
        case "episode_view": {
          episodeViewCounts.set(
            ev.target_id,
            (episodeViewCounts.get(ev.target_id) || 0) + 1
          )
          break
        }
        case "watch_50":
        case "watch_90": {
          deepWatchCounts.set(
            ev.target_id,
            (deepWatchCounts.get(ev.target_id) || 0) + 1
          )
          deepWatchVisitors.add(ev.visitor_id)
          break
        }
        case "search_used":
        case "search": {
          searchCounts.set(
            ev.target_id,
            (searchCounts.get(ev.target_id) || 0) + 1
          )
          searchEventTotal++
          break
        }
        case "path_click": {
          pathCounts.set(
            ev.target_id,
            (pathCounts.get(ev.target_id) || 0) + 1
          )
          break
        }
      }

      // Content breakdown
      contentCounts.set(
        ev.event_type,
        (contentCounts.get(ev.event_type) || 0) + 1
      )
    }

    const uniqueVisitors = visitorIds.size
    const episodeViews = Array.from(episodeViewCounts.values()).reduce(
      (a, b) => a + b,
      0
    )
    const engagementRate =
      uniqueVisitors > 0
        ? Math.round((deepWatchVisitors.size / uniqueVisitors) * 100)
        : 0

    // Top episodes (by view count)
    const topEpisodes = Array.from(episodeViewCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, views]) => {
        const ep = episodeMap.get(id)
        return {
          id,
          title: ep?.title || id,
          slug: ep?.slug || "",
          thumbnail: ep?.thumbnail_url || null,
          views,
          deepWatches: deepWatchCounts.get(id) || 0,
        }
      })

    // Content breakdown
    const EVENT_LABELS: Record<string, string> = {
      episode_view: "صفحات الحلقات",
      path_click: "المسارات",
      guest_open: "الضيوف",
      quote_open: "الاقتباسات",
      search_used: "البحث",
      search: "البحث",
      episode_saved: "المحفوظات",
      episode_watch: "تشغيل الحلقات",
      watch_25: "مشاهدة 25%",
      watch_50: "مشاهدة 50%",
      watch_90: "مشاهدة 90%",
      save_item: "المحفوظات",
      quote_view: "الاقتباسات",
    }

    // Merge duplicate labels (e.g. search + search_used, save_item + episode_saved)
    const labelCounts = new Map<string, number>()
    for (const [type, count] of contentCounts) {
      const label = EVENT_LABELS[type] || type
      labelCounts.set(label, (labelCounts.get(label) || 0) + count)
    }

    const contentBreakdown = Array.from(labelCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)

    // Top searches
    const topSearches = Array.from(searchCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([query, count]) => ({ query, count }))

    // Top paths
    const topPaths = Array.from(pathCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([slug, count]) => {
        const p = pathMap.get(slug)
        return { slug, title: p?.title || slug, count }
      })

    return NextResponse.json({
      configured: true,
      uniqueVisitors,
      episodeViews,
      engagementRate,
      searchCount: searchEventTotal,
      totalEvents: events.length,
      topEpisodes,
      contentBreakdown,
      topSearches,
      topPaths,
    })
  } catch (err) {
    console.error("Website analytics error:", err)
    return NextResponse.json({
      configured: true,
      error: err instanceof Error ? err.message : "Unknown error",
      ...EMPTY_RESPONSE,
    })
  }
}
