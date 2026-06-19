/**
 * Newsletter campaign delivery handler.
 *
 * The admin send endpoint creates the campaign + queued delivery rows
 * synchronously, then enqueues this job. The handler runs the resumable
 * delivery loop: it only processes deliveries still "queued", so a retry
 * (after a crash or timeout) safely continues without re-mailing anyone.
 * Per-recipient failures are recorded and don't abort the run.
 */

import { processCampaignDeliveries } from "@/lib/newsletter/sender"
import { registerHandler } from "../registry"

interface NewsletterSendPayload {
  campaignId: string
}

interface NewsletterSendResult extends Record<string, unknown> {
  campaignId: string
  sent: number
  failed: number
  total: number
}

registerHandler<NewsletterSendPayload, NewsletterSendResult>(
  "newsletter.send_campaign",
  async (payload, ctx) => {
    if (!payload.campaignId) {
      throw new Error("newsletter.send_campaign: payload requires campaignId")
    }
    const result = await processCampaignDeliveries(payload.campaignId)
    return { ...result, worker: ctx.workerId }
  },
)
