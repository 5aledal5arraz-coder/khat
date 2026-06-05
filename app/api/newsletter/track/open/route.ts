import { NextRequest, NextResponse } from "next/server"
import { verifyTrackingToken } from "@/lib/newsletter/tracking"
import { db } from "@/lib/db"
import { newsletterCampaigns } from "@/lib/db/schema"
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

  // Atomic: update delivery counters and check if this was the first open.
  // PostgreSQL row-level locking ensures concurrent requests are serialized,
  // so only one request will see open_count = 1 after the increment.
  const result = await db.execute(sql`
    UPDATE newsletter_deliveries
    SET
      open_count = COALESCE(open_count, 0) + 1,
      first_opened_at = CASE WHEN COALESCE(open_count, 0) = 0 THEN now() ELSE first_opened_at END,
      last_opened_at = now(),
      last_event_at = now(),
      status = 'opened'
    WHERE id = ${deliveryId}
    RETURNING campaign_id, open_count
  `)

  const row = (result as unknown as { campaign_id: string; open_count: number }[])[0]
  if (!row || row.open_count !== 1) return

  // Increment campaign total_opened only on first open per delivery
  await db.update(newsletterCampaigns)
    .set({ total_opened: sql`COALESCE(${newsletterCampaigns.total_opened}, 0) + 1` })
    .where(eq(newsletterCampaigns.id, row.campaign_id))
}
