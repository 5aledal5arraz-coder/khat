import { db } from "@/lib/db"
import {
  newsletterSubscribers,
  newsletterCampaigns,
  newsletterDeliveries,
} from "@/lib/db/schema"
import { eq, count, desc, sql, and, or, ilike } from "drizzle-orm"

// ── Metrics ──

export async function getNewsletterMetrics() {
  if (!db) return null

  const [
    activeSubResult,
    totalSubResult,
    campaignCountResult,
  ] = await Promise.all([
    db.select({ count: count() })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.status, "active")),
    db.select({ count: count() }).from(newsletterSubscribers),
    db.select({ count: count() })
      .from(newsletterCampaigns)
      .where(eq(newsletterCampaigns.status, "sent")),
  ])

  const activeSubscribers = activeSubResult[0]?.count ?? 0
  const totalSubscribers = totalSubResult[0]?.count ?? 0
  const campaignsSent = campaignCountResult[0]?.count ?? 0

  // Aggregate totals from all sent campaigns
  const [agg] = await db.select({
    total_sent: sql<number>`COALESCE(SUM(${newsletterCampaigns.total_sent}), 0)`,
    total_delivered: sql<number>`COALESCE(SUM(${newsletterCampaigns.total_delivered}), 0)`,
    total_opened: sql<number>`COALESCE(SUM(${newsletterCampaigns.total_opened}), 0)`,
    total_clicked: sql<number>`COALESCE(SUM(${newsletterCampaigns.total_clicked}), 0)`,
    total_bounced: sql<number>`COALESCE(SUM(${newsletterCampaigns.total_bounced}), 0)`,
    total_complaints: sql<number>`COALESCE(SUM(${newsletterCampaigns.total_complaints}), 0)`,
  })
    .from(newsletterCampaigns)
    .where(eq(newsletterCampaigns.status, "sent"))

  const totalSent = Number(agg.total_sent)
  const totalDelivered = Number(agg.total_delivered)
  const totalOpened = Number(agg.total_opened)
  const totalClicked = Number(agg.total_clicked)
  const totalBounced = Number(agg.total_bounced)
  const totalComplaints = Number(agg.total_complaints)

  return {
    activeSubscribers,
    totalSubscribers,
    campaignsSent,
    totalEmailsSent: totalSent,
    deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
    openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
    clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
    bounceRate: totalSent > 0 ? Math.round((totalBounced / totalSent) * 100) : 0,
    totalBounced,
    totalComplaints,
  }
}

export async function getTopCampaigns(limit = 5) {
  if (!db) return []

  const rows = await db.select({
    id: newsletterCampaigns.id,
    subject: newsletterCampaigns.subject,
    total_sent: newsletterCampaigns.total_sent,
    total_opened: newsletterCampaigns.total_opened,
    total_clicked: newsletterCampaigns.total_clicked,
    sent_at: newsletterCampaigns.sent_at,
  })
    .from(newsletterCampaigns)
    .where(eq(newsletterCampaigns.status, "sent"))
    .orderBy(desc(newsletterCampaigns.total_opened))
    .limit(limit)

  return rows.map(r => ({
    id: r.id,
    subject: r.subject,
    total_sent: r.total_sent ?? 0,
    total_opened: r.total_opened ?? 0,
    total_clicked: r.total_clicked ?? 0,
    sent_at: r.sent_at?.toISOString() ?? "",
  }))
}

// ── Campaign Detail ──

export async function getCampaignById(id: string) {
  if (!db) return null

  const [campaign] = await db.select()
    .from(newsletterCampaigns)
    .where(eq(newsletterCampaigns.id, id))
    .limit(1)

  if (!campaign) return null

  return {
    ...campaign,
    sent_at: campaign.sent_at?.toISOString() ?? null,
    scheduled_at: campaign.scheduled_at?.toISOString() ?? null,
    created_at: campaign.created_at?.toISOString() ?? null,
    updated_at: campaign.updated_at?.toISOString() ?? null,
  }
}

export async function getCampaignDeliveries(campaignId: string) {
  if (!db) return []

  const rows = await db.select({
    id: newsletterDeliveries.id,
    status: newsletterDeliveries.status,
    email: newsletterSubscribers.email,
    sent_at: newsletterDeliveries.sent_at,
    open_count: newsletterDeliveries.open_count,
    click_count: newsletterDeliveries.click_count,
    last_event_at: newsletterDeliveries.last_event_at,
    error: newsletterDeliveries.error,
  })
    .from(newsletterDeliveries)
    .innerJoin(newsletterSubscribers, eq(newsletterDeliveries.subscriber_id, newsletterSubscribers.id))
    .where(eq(newsletterDeliveries.campaign_id, campaignId))
    .orderBy(desc(newsletterDeliveries.sent_at))

  return rows.map(r => ({
    id: r.id,
    email: r.email,
    status: r.status,
    sent_at: r.sent_at?.toISOString() ?? null,
    open_count: r.open_count ?? 0,
    click_count: r.click_count ?? 0,
    last_event_at: r.last_event_at?.toISOString() ?? null,
    error: r.error,
  }))
}

// ── Subscribers ──

export async function getSubscribersWithStatus(opts?: {
  status?: string
  search?: string
}) {
  if (!db) return { subscribers: [], counts: { all: 0, active: 0, unsubscribed: 0 } }

  // Counts
  const [allCount, activeCount, unsubCount] = await Promise.all([
    db.select({ count: count() }).from(newsletterSubscribers),
    db.select({ count: count() }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, "active")),
    db.select({ count: count() }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, "unsubscribed")),
  ])

  const counts = {
    all: allCount[0]?.count ?? 0,
    active: activeCount[0]?.count ?? 0,
    unsubscribed: unsubCount[0]?.count ?? 0,
  }

  // Build where conditions
  const conditions: ReturnType<typeof eq>[] = []

  if (opts?.status && opts.status !== "all") {
    conditions.push(eq(newsletterSubscribers.status, opts.status))
  }

  if (opts?.search?.trim()) {
    conditions.push(ilike(newsletterSubscribers.email, `%${opts.search.trim()}%`))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const subscribers = await db.select({
    id: newsletterSubscribers.id,
    email: newsletterSubscribers.email,
    status: newsletterSubscribers.status,
    created_at: newsletterSubscribers.created_at,
    unsubscribed_at: newsletterSubscribers.unsubscribed_at,
  })
    .from(newsletterSubscribers)
    .where(whereClause)
    .orderBy(desc(newsletterSubscribers.created_at))
    .limit(500)

  return {
    subscribers: subscribers.map(s => ({
      id: s.id,
      email: s.email,
      status: s.status ?? "active",
      created_at: s.created_at?.toISOString() ?? "",
      unsubscribed_at: (s as any).unsubscribed_at?.toISOString() ?? null,
    })),
    counts,
  }
}

// ── Health ──

export async function getHealthStats() {
  if (!db) return null

  const [activeSubs, totalCampaigns, totalDeliveries] = await Promise.all([
    db.select({ count: count() }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, "active")),
    db.select({ count: count() }).from(newsletterCampaigns),
    db.select({ count: count() }).from(newsletterDeliveries),
  ])

  return {
    activeSubscribers: activeSubs[0]?.count ?? 0,
    totalCampaigns: totalCampaigns[0]?.count ?? 0,
    totalDeliveries: totalDeliveries[0]?.count ?? 0,
  }
}
