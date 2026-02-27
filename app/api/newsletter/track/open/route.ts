import { NextRequest, NextResponse } from "next/server"
import { verifyTrackingToken } from "@/lib/newsletter/tracking"
import { db } from "@/lib/db"
import { newsletterDeliveries, newsletterCampaigns } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t")

  // Always return the pixel, even on error — don't break email rendering
  const pixelResponse = () =>
    new NextResponse(PIXEL, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })

  if (!token || !db) return pixelResponse()

  const deliveryId = verifyTrackingToken(token)
  if (!deliveryId) return pixelResponse()

  // Record open asynchronously — don't block the pixel response
  recordOpen(deliveryId).catch(() => {})

  return pixelResponse()
}

async function recordOpen(deliveryId: string) {
  if (!db) return

  // Get current delivery state
  const [delivery] = await db.select({
    id: newsletterDeliveries.id,
    campaign_id: newsletterDeliveries.campaign_id,
    open_count: newsletterDeliveries.open_count,
  })
    .from(newsletterDeliveries)
    .where(eq(newsletterDeliveries.id, deliveryId))
    .limit(1)

  if (!delivery) return

  const isFirstOpen = (delivery.open_count ?? 0) === 0

  // Update delivery
  await db.update(newsletterDeliveries)
    .set({
      open_count: sql`COALESCE(${newsletterDeliveries.open_count}, 0) + 1`,
      first_opened_at: isFirstOpen ? sql`now()` : undefined,
      last_opened_at: sql`now()`,
      last_event_at: sql`now()`,
      status: "opened",
    })
    .where(eq(newsletterDeliveries.id, deliveryId))

  // Increment campaign total_opened only on first open
  if (isFirstOpen) {
    await db.update(newsletterCampaigns)
      .set({ total_opened: sql`COALESCE(${newsletterCampaigns.total_opened}, 0) + 1` })
      .where(eq(newsletterCampaigns.id, delivery.campaign_id))
  }
}
