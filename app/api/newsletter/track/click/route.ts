import { NextRequest, NextResponse } from "next/server"
import { verifyTrackingToken } from "@/lib/newsletter/tracking"
import { db } from "@/lib/db"
import { newsletterCampaigns, newsletterLinks, newsletterClicks } from "@/lib/db/schema"
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

  // Safety: only redirect to http(s) URLs
  if (!link.url.startsWith("http://") && !link.url.startsWith("https://")) {
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

  // Atomic: update delivery counters and check if this was the first click.
  // PostgreSQL row-level locking ensures concurrent requests are serialized.
  const result = await db.execute(sql`
    UPDATE newsletter_deliveries
    SET
      click_count = COALESCE(click_count, 0) + 1,
      first_clicked_at = CASE WHEN COALESCE(click_count, 0) = 0 THEN now() ELSE first_clicked_at END,
      last_clicked_at = now(),
      last_event_at = now(),
      status = 'clicked'
    WHERE id = ${deliveryId}
    RETURNING campaign_id, click_count
  `)

  const row = (result as unknown as { campaign_id: string; click_count: number }[])[0]
  if (!row || row.click_count !== 1) return

  // Increment campaign total_clicked only on first click per delivery
  await db.update(newsletterCampaigns)
    .set({ total_clicked: sql`COALESCE(${newsletterCampaigns.total_clicked}, 0) + 1` })
    .where(eq(newsletterCampaigns.id, row.campaign_id))
}
