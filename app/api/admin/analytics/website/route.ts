import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getEpisodes } from "@/lib/queries/episodes"
import { db, USE_DB } from "@/lib/db"
import { visitorEvents, guests } from "@/lib/db/schema"
import { desc, gte } from "drizzle-orm"

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
  topGuests: [],
  recentActivity: [],
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

    // Fetch episodes and guests for enrichment
    const [episodes, guestRows] = await Promise.all([
      getEpisodes({ includeHidden: true }),
      db!.select({ id: guests.id, name: guests.name, slug: guests.slug, photo_url: guests.photo_url }).from(guests),
    ])

    const episodeMap = new Map(episodes.map((e) => [e.id, e]))
    const guestMap = new Map(guestRows.map((g) => [g.id, g]))

    // --- Aggregation ---
    const visitorIds = new Set<string>()
    const episodeViewCounts = new Map<string, number>()
    const deepWatchCounts = new Map<string, number>()
    const contentCounts = new Map<string, number>()
    const searchCounts = new Map<string, number>()
    const guestClickCounts = new Map<string, number>()
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
        case "guest_open": {
          guestClickCounts.set(
            ev.target_id,
            (guestClickCounts.get(ev.target_id) || 0) + 1
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

    // Top guests by clicks
    const topGuests = Array.from(guestClickCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, clicks]) => {
        const g = guestMap.get(id)
        return {
          id,
          name: g?.name || id,
          slug: g?.slug || "",
          photo_url: g?.photo_url || null,
          clicks,
        }
      })

    // Recent activity feed (last 20 meaningful events)
    const ACTIVITY_LABELS: Record<string, string> = {
      episode_view: "شاهد حلقة",
      episode_watch: "شغّل حلقة",
      watch_25: "وصل 25% من",
      watch_50: "وصل 50% من",
      watch_90: "وصل 90% من",
      guest_open: "فتح ملف ضيف",
      quote_open: "فتح اقتباس",
      search_used: "بحث عن",
      search: "بحث عن",
      episode_saved: "حفظ حلقة",
      save_item: "حفظ عنصر",
    }

    const recentActivity = events
      .slice(0, 20)
      .map((ev) => {
        const label = ACTIVITY_LABELS[ev.event_type] || ev.event_type
        let targetName = ev.target_id
        if (["episode_view", "episode_watch", "watch_25", "watch_50", "watch_90", "episode_saved"].includes(ev.event_type)) {
          targetName = episodeMap.get(ev.target_id)?.title || ev.target_id
        } else if (ev.event_type === "guest_open") {
          targetName = guestMap.get(ev.target_id)?.name || ev.target_id
        }
        return {
          type: ev.event_type,
          label,
          targetName,
          created_at: ev.created_at?.toISOString() || null,
        }
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
      topGuests,
      recentActivity,
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
