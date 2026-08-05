import { env } from "@/lib/env"
import { NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { db, USE_DB } from "@/lib/db"
import {
  episodes,
  guests,
  quotes,
  timestamps,
  hiddenEpisodes,
  guestApplications,
  sponsorshipLeads,
  newsletterSubscribers,
  newsletterCampaigns,
  studioSessions,
  episodeSponsors,
} from "@/lib/db/schema"
import { eq, desc, sql } from "drizzle-orm"
import { getChannelDetails, getChannelVideos, getChannelIdFromHandle, type YouTubeChannel } from "@/lib/youtube/client"

const YOUTUBE_CHANNEL_ID = env.YOUTUBE_CHANNEL_ID || ""
const YOUTUBE_CHANNEL_HANDLE = env.YOUTUBE_CHANNEL_HANDLE || ""
const HAS_YOUTUBE = !!env.YOUTUBE_API_KEY && !!(YOUTUBE_CHANNEL_ID || YOUTUBE_CHANNEL_HANDLE)

interface DashboardData {
  // Platform overview
  platform: {
    totalEpisodes: number
    publishedEpisodes: number
    draftEpisodes: number
    hiddenEpisodes: number
    totalGuests: number
    totalQuotes: number
    totalTimestamps: number
    totalSponsors: number
  }
  // Submissions
  submissions: {
    guestApplications: number
    newGuestApplications: number
    sponsorshipLeads: number
    newSponsorshipLeads: number
    newsletterSubscribers: number
    activeSubscribers: number
  }
  // Newsletter
  newsletter: {
    totalCampaigns: number
    sentCampaigns: number
    totalEmailsSent: number
    openRate: number
    clickRate: number
    recentCampaigns: {
      id: string
      subject: string
      total_sent: number
      total_opened: number
      total_clicked: number
      sent_at: string
    }[]
  }
  // YouTube
  youtube: {
    available: boolean
    channel: YouTubeChannel | null
    recentVideos: {
      id: string
      title: string
      publishedAt: string
      thumbnailUrl: string
      viewCount: number
      likeCount: number
      commentCount: number
      durationSeconds: number
    }[]
    topVideos: {
      id: string
      title: string
      thumbnailUrl: string
      viewCount: number
      likeCount: number
      commentCount: number
    }[]
    totalViews: number
    totalLikes: number
    totalComments: number
    avgViewsPerVideo: number
    avgEngagementRate: number
  }
  // Studio
  studio: {
    totalSessions: number
    completedSessions: number
  }
  // Insights
  insights: {
    type: "success" | "warning" | "info"
    title: string
    description: string
  }[]
}

export async function GET() {
  const authError = await requireAdminAPI()
  if (authError) return authError

  if (!USE_DB) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 })
  }

  try {
    /**
     * ── EIGHTEEN COUNTS IN ONE QUERY, NOT EIGHTEEN QUERIES ──────────────────
     *
     * THIS IS THE BUG KHALED REPORTED as «صفحة التحليلات ما تشتغل», and the
     * database said it plainly in the log:
     *
     *   remaining connection slots are reserved for roles with the
     *   SUPERUSER attribute
     *
     * The managed Postgres allows `max_connections = 25`. This app's pool is
     * 10 and the worker's is another 10; with pg_cron and Postgres's own
     * superuser reserve that is essentially the whole ceiling. Every other
     * endpoint asks for ONE connection at a time and never notices. This
     * route asked for EIGHTEEN AT ONCE — a `Promise.all` of eighteen separate
     * `count()` statements, each needing its own client — so it was the only
     * page on the site that could exhaust the pool by itself, and the first
     * thing to fail when the worker was also busy. Observed failing on
     * 2026-08-03 and again on 2026-08-05; the counts that lost the race
     * differed each time, which is what a race looks like and why it read as
     * "sometimes it works".
     *
     * Raising the pool would have moved the ceiling, not removed the cause,
     * and the ceiling belongs to the database plan. Counting eighteen things
     * does not need eighteen connections: scalar sub-selects do it in ONE
     * round trip on ONE client. Same numbers, same shape returned to the
     * caller, 1/18th of the connection demand — and it is now the same weight
     * as every other endpoint rather than the heaviest by an order of
     * magnitude.
     *
     * Postgres plans each sub-select independently; these are unfiltered or
     * single-equality counts over small tables, so this is one cheap plan,
     * not a join.
     */
    const [c] = await db!
      .select({
        totalEpisodes: sql<number>`(select count(*) from ${episodes})`,
        published: sql<number>`(select count(*) from ${episodes} where ${episodes.status} = 'published')`,
        draft: sql<number>`(select count(*) from ${episodes} where ${episodes.status} = 'draft')`,
        hidden: sql<number>`(select count(*) from ${hiddenEpisodes})`,
        totalGuests: sql<number>`(select count(*) from ${guests})`,
        totalQuotes: sql<number>`(select count(*) from ${quotes})`,
        totalTimestamps: sql<number>`(select count(*) from ${timestamps})`,
        totalSponsors: sql<number>`(select count(*) from ${episodeSponsors})`,
        guestApps: sql<number>`(select count(*) from ${guestApplications})`,
        newGuestApps: sql<number>`(select count(*) from ${guestApplications} where ${guestApplications.status} = 'new')`,
        sponsorLeads: sql<number>`(select count(*) from ${sponsorshipLeads})`,
        newSponsorLeads: sql<number>`(select count(*) from ${sponsorshipLeads} where ${sponsorshipLeads.status} = 'new')`,
        totalSubs: sql<number>`(select count(*) from ${newsletterSubscribers})`,
        activeSubs: sql<number>`(select count(*) from ${newsletterSubscribers} where ${newsletterSubscribers.status} = 'active')`,
        totalCampaigns: sql<number>`(select count(*) from ${newsletterCampaigns})`,
        sentCampaigns: sql<number>`(select count(*) from ${newsletterCampaigns} where ${newsletterCampaigns.status} = 'sent')`,
        totalStudio: sql<number>`(select count(*) from ${studioSessions})`,
        completedStudio: sql<number>`(select count(*) from ${studioSessions} where ${studioSessions.status} = 'published')`,
      })
      .from(sql`(select 1) as _`)

    // Postgres returns count() as bigint, which pg gives back as a STRING.
    // The old shape (`[{ count: n }]` from Drizzle's `count()`) was already
    // numeric; this keeps the rest of the handler unchanged by restoring both
    // the type and the shape it expects.
    const n = (v: unknown) => Number(v ?? 0)
    const totalEpisodesResult = [{ count: n(c.totalEpisodes) }]
    const publishedResult = [{ count: n(c.published) }]
    const draftResult = [{ count: n(c.draft) }]
    const hiddenResult = [{ count: n(c.hidden) }]
    const totalGuestsResult = [{ count: n(c.totalGuests) }]
    const totalQuotesResult = [{ count: n(c.totalQuotes) }]
    const totalTimestampsResult = [{ count: n(c.totalTimestamps) }]
    const totalSponsorsResult = [{ count: n(c.totalSponsors) }]
    const guestAppsResult = [{ count: n(c.guestApps) }]
    const newGuestAppsResult = [{ count: n(c.newGuestApps) }]
    const sponsorsResult = [{ count: n(c.sponsorLeads) }]
    const newSponsorsResult = [{ count: n(c.newSponsorLeads) }]
    const totalSubsResult = [{ count: n(c.totalSubs) }]
    const activeSubsResult = [{ count: n(c.activeSubs) }]
    const totalCampaignsResult = [{ count: n(c.totalCampaigns) }]
    const sentCampaignsResult = [{ count: n(c.sentCampaigns) }]
    const totalStudioResult = [{ count: n(c.totalStudio) }]
    const completedStudioResult = [{ count: n(c.completedStudio) }]

    // ── Newsletter aggregate stats ──────────────────────────────────────────
    const [newsletterAgg] = await db!.select({
      total_sent: sql<number>`COALESCE(SUM(${newsletterCampaigns.total_sent}), 0)`,
      total_opened: sql<number>`COALESCE(SUM(${newsletterCampaigns.total_opened}), 0)`,
      total_clicked: sql<number>`COALESCE(SUM(${newsletterCampaigns.total_clicked}), 0)`,
    })
      .from(newsletterCampaigns)
      .where(eq(newsletterCampaigns.status, "sent"))

    const totalSent = Number(newsletterAgg.total_sent)
    const totalOpened = Number(newsletterAgg.total_opened)
    const totalClicked = Number(newsletterAgg.total_clicked)

    // Recent campaigns
    const recentCampaigns = await db!.select({
      id: newsletterCampaigns.id,
      subject: newsletterCampaigns.subject,
      total_sent: newsletterCampaigns.total_sent,
      total_opened: newsletterCampaigns.total_opened,
      total_clicked: newsletterCampaigns.total_clicked,
      sent_at: newsletterCampaigns.sent_at,
    })
      .from(newsletterCampaigns)
      .where(eq(newsletterCampaigns.status, "sent"))
      .orderBy(desc(newsletterCampaigns.sent_at))
      .limit(5)




    // ── YouTube data ────────────────────────────────────────────────────────
    let youtubeData: DashboardData["youtube"] = {
      available: false,
      channel: null,
      recentVideos: [],
      topVideos: [],
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      avgViewsPerVideo: 0,
      avgEngagementRate: 0,
    }

    if (HAS_YOUTUBE) {
      try {
        // Resolve channel ID from handle if not set directly
        let channelId = YOUTUBE_CHANNEL_ID
        if (!channelId && YOUTUBE_CHANNEL_HANDLE) {
          channelId = await getChannelIdFromHandle(YOUTUBE_CHANNEL_HANDLE) || ""
        }
        if (!channelId) throw new Error("Could not resolve YouTube channel ID")

        const [channel, allVideos] = await Promise.all([
          getChannelDetails(channelId),
          getChannelVideos(channelId, 200),
        ])

        if (channel && allVideos.length > 0) {
          const totalViews = allVideos.reduce((sum, v) => sum + v.viewCount, 0)
          const totalLikes = allVideos.reduce((sum, v) => sum + v.likeCount, 0)
          const totalComments = allVideos.reduce((sum, v) => sum + v.commentCount, 0)
          const avgViews = Math.round(totalViews / allVideos.length)
          const avgEngagement = totalViews > 0
            ? Number(((totalLikes + totalComments) / totalViews * 100).toFixed(1))
            : 0

          // Sort by date for recent
          const sortedByDate = [...allVideos].sort(
            (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
          )
          // Sort by views for top
          const sortedByViews = [...allVideos].sort((a, b) => b.viewCount - a.viewCount)

          youtubeData = {
            available: true,
            channel,
            recentVideos: sortedByDate.slice(0, 6).map(v => ({
              id: v.id,
              title: v.title,
              publishedAt: v.publishedAt,
              thumbnailUrl: v.thumbnailUrl,
              viewCount: v.viewCount,
              likeCount: v.likeCount,
              commentCount: v.commentCount,
              durationSeconds: v.durationSeconds,
            })),
            topVideos: sortedByViews.slice(0, 6).map(v => ({
              id: v.id,
              title: v.title,
              thumbnailUrl: v.thumbnailUrl,
              viewCount: v.viewCount,
              likeCount: v.likeCount,
              commentCount: v.commentCount,
            })),
            totalViews,
            totalLikes,
            totalComments,
            avgViewsPerVideo: avgViews,
            avgEngagementRate: avgEngagement,
          }
        }
      } catch (err) {
        console.error("YouTube analytics error:", err)
        // YouTube section stays as unavailable
      }
    }

    // ── Build insights ──────────────────────────────────────────────────────
    const insights: DashboardData["insights"] = []

    const totalEps = totalEpisodesResult[0].count
    const publishedEps = publishedResult[0].count
    const draftEps = draftResult[0].count
    const hiddenEps = hiddenResult[0].count
    const newGuestApps = newGuestAppsResult[0].count
    const newSponsorApps = newSponsorsResult[0].count
    const totalSubs = activeSubsResult[0].count

    if (newGuestApps > 0) {
      insights.push({
        type: "warning",
        title: `${newGuestApps} طلب ضيف جديد`,
        description: "يوجد طلبات ضيوف بانتظار المراجعة",
      })
    }

    if (newSponsorApps > 0) {
      insights.push({
        type: "warning",
        title: `${newSponsorApps} طلب رعاية جديد`,
        description: "يوجد طلبات رعاية بانتظار المراجعة",
      })
    }

    if (draftEps > 0) {
      insights.push({
        type: "info",
        title: `${draftEps} حلقة مسودة`,
        description: "حلقات في وضع المسودة تحتاج مراجعة أو نشر",
      })
    }

    if (totalSubs > 50) {
      insights.push({
        type: "success",
        title: `${totalSubs} مشترك نشط`,
        description: "قاعدة مشتركي النشرة البريدية في نمو",
      })
    } else if (totalSubs > 0) {
      insights.push({
        type: "info",
        title: `${totalSubs} مشترك نشط`,
        description: "النشرة البريدية تحتاج مزيداً من الترويج لزيادة المشتركين",
      })
    }

    if (youtubeData.available && youtubeData.channel) {
      if (youtubeData.avgEngagementRate > 5) {
        insights.push({
          type: "success",
          title: `تفاعل يوتيوب ${youtubeData.avgEngagementRate}%`,
          description: "معدل تفاعل القناة على يوتيوب ممتاز",
        })
      }
    }

    if (hiddenEps > 3) {
      insights.push({
        type: "info",
        title: `${hiddenEps} حلقة مخفية`,
        description: "عدد كبير من الحلقات المخفية — تأكد أنها مقصودة",
      })
    }

    const sentCampaigns = sentCampaignsResult[0].count
    if (sentCampaigns === 0 && totalSubs > 0) {
      insights.push({
        type: "warning",
        title: "لم ترسل نشرات بريدية بعد",
        description: "لديك مشتركون لكن لم ترسل أي نشرة بريدية — حان الوقت للتواصل",
      })
    }

    // ── Assemble response ───────────────────────────────────────────────────
    const data: DashboardData = {
      platform: {
        totalEpisodes: totalEps,
        publishedEpisodes: publishedEps,
        draftEpisodes: draftEps,
        hiddenEpisodes: hiddenEps,
        totalGuests: totalGuestsResult[0].count,
        totalQuotes: totalQuotesResult[0].count,
        totalTimestamps: totalTimestampsResult[0].count,
        totalSponsors: totalSponsorsResult[0].count,
      },
      submissions: {
        guestApplications: guestAppsResult[0].count,
        newGuestApplications: newGuestApps,
        sponsorshipLeads: sponsorsResult[0].count,
        newSponsorshipLeads: newSponsorApps,
        newsletterSubscribers: totalSubsResult[0].count,
        activeSubscribers: totalSubs,
      },
      newsletter: {
        totalCampaigns: totalCampaignsResult[0].count,
        sentCampaigns,
        totalEmailsSent: totalSent,
        openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
        clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
        recentCampaigns: recentCampaigns.map(c => ({
          id: c.id,
          subject: c.subject,
          total_sent: c.total_sent ?? 0,
          total_opened: c.total_opened ?? 0,
          total_clicked: c.total_clicked ?? 0,
          sent_at: c.sent_at?.toISOString() ?? "",
        })),
      },
      youtube: youtubeData,
      studio: {
        totalSessions: totalStudioResult[0].count,
        completedSessions: completedStudioResult[0].count,
      },
      insights,
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error("Dashboard analytics error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
