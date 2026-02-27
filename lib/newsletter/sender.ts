import crypto from "crypto"
import { db } from "@/lib/db"
import { newsletterCampaigns, newsletterDeliveries, newsletterLinks } from "@/lib/db/schema"
import { newsletterSubscribers } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { getResend, FROM_EMAIL, APP_URL } from "@/lib/email/resend"
import { newsletterHtml } from "@/lib/email/templates"
import { getPixelUrl, getClickUrl } from "./tracking"

interface SendResult {
  campaignId: string
  sent: number
  failed: number
  total: number
}

/** Extract all href URLs from HTML */
function extractUrls(html: string): string[] {
  const urls = new Set<string>()
  const regex = /href="(https?:\/\/[^"]+)"/g
  let match
  while ((match = regex.exec(html)) !== null) {
    urls.add(match[1])
  }
  return Array.from(urls)
}

/** Replace URLs in HTML with click-tracked versions */
function replaceLinks(
  html: string,
  deliveryId: string,
  linkMap: Map<string, string>, // original URL → link token
): string {
  let result = html
  for (const [url, linkToken] of linkMap) {
    const trackUrl = getClickUrl(APP_URL, deliveryId, linkToken)
    result = result.replaceAll(`href="${url}"`, `href="${trackUrl}"`)
  }
  return result
}

/**
 * Send a newsletter campaign with full open/click tracking.
 *
 * 1. Creates campaign record
 * 2. Creates delivery records for each active subscriber
 * 3. Extracts URLs and creates link records
 * 4. Sends per-subscriber emails with tracking pixel + click-tracked URLs
 * 5. Updates campaign with final counts
 */
export async function sendCampaign(opts: {
  subject: string
  body: string
  sentBy?: string | null
}): Promise<SendResult> {
  if (!db) throw new Error("Database not configured")

  const resend = getResend()
  const contentHtml = opts.body.trim()
  const wrappedHtml = newsletterHtml(contentHtml, "#") // placeholder unsub URL for content extraction

  // 1. Create campaign
  const [campaign] = await db.insert(newsletterCampaigns).values({
    subject: opts.subject.trim(),
    content_html: contentHtml,
    status: "sending",
    sent_by: opts.sentBy || null,
  }).returning()

  // 2. Fetch active subscribers
  const subscribers = await db.select({
    id: newsletterSubscribers.id,
    email: newsletterSubscribers.email,
    unsubscribe_token: newsletterSubscribers.unsubscribe_token,
  })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, "active"))

  if (subscribers.length === 0) {
    await db.update(newsletterCampaigns)
      .set({ status: "sent", total_recipients: 0, total_sent: 0, sent_at: sql`now()` })
      .where(eq(newsletterCampaigns.id, campaign.id))
    return { campaignId: campaign.id, sent: 0, failed: 0, total: 0 }
  }

  // 3. Create delivery records
  const deliveryValues = subscribers.map((sub) => ({
    campaign_id: campaign.id,
    subscriber_id: sub.id,
    status: "queued" as const,
  }))
  const deliveries = await db.insert(newsletterDeliveries).values(deliveryValues).returning()
  const deliveryMap = new Map(deliveries.map((d) => [d.subscriber_id, d]))

  // 4. Extract URLs and create link records
  const urls = extractUrls(wrappedHtml)
  const linkMap = new Map<string, string>() // URL → token

  for (const url of urls) {
    const token = crypto.randomBytes(8).toString("hex")
    try {
      await db.insert(newsletterLinks).values({
        campaign_id: campaign.id,
        url,
        token,
      })
      linkMap.set(url, token)
    } catch {
      // duplicate URL — skip
    }
  }

  // 5. Send per-subscriber emails
  let sentCount = 0
  let failCount = 0

  for (const sub of subscribers) {
    const delivery = deliveryMap.get(sub.id)
    if (!delivery) continue

    try {
      const unsubscribeUrl = `${APP_URL}/api/unsubscribe/newsletter?token=${sub.unsubscribe_token}`

      // Wrap content with layout, then apply tracking
      let emailHtml = newsletterHtml(contentHtml, unsubscribeUrl)

      // Replace links with click-tracked versions
      emailHtml = replaceLinks(emailHtml, delivery.id, linkMap)

      // Add tracking pixel before closing </body>
      const pixelUrl = getPixelUrl(APP_URL, delivery.id)
      const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;" />`
      emailHtml = emailHtml.replace("</body>", `${pixel}</body>`)

      const result = await resend.emails.send({
        from: `نشرة خط بودكاست <${FROM_EMAIL}>`,
        to: sub.email,
        subject: opts.subject.trim(),
        html: emailHtml,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      })

      const messageId = result.data?.id || null
      await db.update(newsletterDeliveries)
        .set({ status: "sent", resend_message_id: messageId, sent_at: sql`now()` })
        .where(eq(newsletterDeliveries.id, delivery.id))
      sentCount++
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error"
      await db.update(newsletterDeliveries)
        .set({ status: "failed", error: errorMsg })
        .where(eq(newsletterDeliveries.id, delivery.id))
      failCount++
    }

    // Rate limit: 100ms between sends
    await new Promise((r) => setTimeout(r, 100))
  }

  // 6. Update campaign
  await db.update(newsletterCampaigns)
    .set({
      status: "sent",
      total_recipients: subscribers.length,
      total_sent: sentCount,
      total_failed: failCount,
      sent_at: sql`now()`,
    })
    .where(eq(newsletterCampaigns.id, campaign.id))

  return { campaignId: campaign.id, sent: sentCount, failed: failCount, total: subscribers.length }
}
