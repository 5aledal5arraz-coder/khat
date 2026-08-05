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
import { count, eq, desc, sql } from "drizzle-orm"
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
    // ── Parallel data fetching ──────────────────────────────────────────────
    const [
      // Episode counts
      totalEpisodesResult,
      publishedResult,
      draftResult,
      hiddenResult,
      // Guests & content
      totalGuestsResult,
      totalQuotesResult,
      totalTimestampsResult,
      totalSponsorsResult,
      // Submissions
      guestAppsResult,
      newGuestAppsResult,
      sponsorsResult,
      newSponsorsResult,
      // Newsletter
      totalSubsResult,
      activeSubsResult,
      totalCampaignsResult,
      sentCampaignsResult,
      // Studio
      totalStudioResult,
      completedStudioResult,
    ] = await Promise.all([
      db!.select({ count: count() }).from(episodes),
      db!.select({ count: count() }).from(episodes).where(eq(episodes.status, "published")),
      db!.select({ count: count() }).from(episodes).where(eq(episodes.status, "draft")),
      db!.select({ count: count() }).from(hiddenEpisodes),
      db!.select({ count: count() }).from(guests),
      db!.select({ count: count() }).from(quotes),
      db!.select({ count: count() }).from(timestamps),
      db!.select({ count: count() }).from(episodeSponsors),
      db!.select({ count: count() }).from(guestApplications),
      db!.select({ count: count() }).from(guestApplications).where(eq(guestApplications.status, "new")),
      db!.select({ count: count() }).from(sponsorshipLeads),
      db!.select({ count: count() }).from(sponsorshipLeads).where(eq(sponsorshipLeads.status, "new")),
      db!.select({ count: count() }).from(newsletterSubscribers),
      db!.select({ count: count() }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, "active")),
      db!.select({ count: count() }).from(newsletterCampaigns),
      db!.select({ count: count() }).from(newsletterCampaigns).where(eq(newsletterCampaigns.status, "sent")),
      db!.select({ count: count() }).from(studioSessions),
      db!.select({ count: count() }).from(studioSessions).where(eq(studioSessions.status, "published")),
    ])

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
