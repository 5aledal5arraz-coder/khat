import { NextRequest, NextResponse } from "next/server"
import { verifyTrackingToken } from "@/lib/newsletter/tracking"
import { db } from "@/lib/db"
import { newsletterDeliveries, newsletterCampaigns, newsletterLinks, newsletterClicks } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t")
  const linkToken = request.nextUrl.searchParams.get("l")

  if (!token || !linkToken || !db) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  const deliveryId = verifyTrackingToken(token)
  if (!deliveryId) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Look up the link by token
  const [link] = await db.select({
    id: newsletterLinks.id,
    url: newsletterLinks.url,
  })
    .from(newsletterLinks)
    .where(eq(newsletterLinks.token, linkToken))
    .limit(1)

  if (!link) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Record click asynchronously — don't block the redirect
  recordClick(deliveryId, link.id).catch(() => {})

  return NextResponse.redirect(link.url)
}

async function recordClick(deliveryId: string, linkId: string) {
  if (!db) return

  // Insert click record
  await db.insert(newsletterClicks).values({
    link_id: linkId,
    delivery_id: deliveryId,
  })

  // Get current delivery state
  const [delivery] = await db.select({
    id: newsletterDeliveries.id,
    campaign_id: newsletterDeliveries.campaign_id,
    click_count: newsletterDeliveries.click_count,
  })
    .from(newsletterDeliveries)
    .where(eq(newsletterDeliveries.id, deliveryId))
    .limit(1)

  if (!delivery) return

  const isFirstClick = (delivery.click_count ?? 0) === 0

  // Update delivery
  await db.update(newsletterDeliveries)
    .set({
      click_count: sql`COALESCE(${newsletterDeliveries.click_count}, 0) + 1`,
      first_clicked_at: isFirstClick ? sql`now()` : undefined,
      last_clicked_at: sql`now()`,
      last_event_at: sql`now()`,
      status: "clicked",
    })
    .where(eq(newsletterDeliveries.id, deliveryId))

  // Increment campaign total_clicked only on first click per delivery
  if (isFirstClick) {
    await db.update(newsletterCampaigns)
      .set({ total_clicked: sql`COALESCE(${newsletterCampaigns.total_clicked}, 0) + 1` })
      .where(eq(newsletterCampaigns.id, delivery.campaign_id))
  }
}
