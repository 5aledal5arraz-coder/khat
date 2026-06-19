import crypto from "crypto"
import { db } from "@/lib/db"
import { newsletterCampaigns, newsletterDeliveries, newsletterLinks } from "@/lib/db/schema"
import { newsletterSubscribers } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { getResend, FROM_EMAIL, REPLY_TO, APP_URL } from "@/lib/email/resend"
import { newsletterHtml } from "@/lib/email/templates"
import { getPixelUrl, getClickUrl } from "./tracking"

/** Max emails sent concurrently per batch */
const SEND_CONCURRENCY = 10

export interface CreateCampaignResult {
  campaignId: string
  /** Active subscribers this campaign will be delivered to. */
  total: number
  /** false when there were 0 recipients (campaign closed immediately). */
  queued: boolean
}

export interface SendResult {
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
  linkMap: Map<string, string>,
): string {
  let result = html
  for (const [url, linkToken] of linkMap) {
    const trackUrl = getClickUrl(APP_URL, deliveryId, linkToken)
    result = result.replaceAll(`href="${url}"`, `href="${trackUrl}"`)
  }
  return result
}

export interface CampaignInput {
  subject: string
  body: string
  sentBy?: string | null
}

/**
 * Phase 1 of sending — synchronous, fast, idempotent setup:
 *   1. Releases stale "sending" campaigns (crashed/timed-out) older than 15m.
 *   2. Rejects if another campaign is actively sending.
 *   3. Creates the campaign (status "sending") + one "queued" delivery row per
 *      active subscriber + the click-tracking link records.
 *
 * Returns immediately so the HTTP request never waits on the actual send —
 * the heavy lifting is done by processCampaignDeliveries() inside a job.
 */
export async function createCampaignRecord(opts: CampaignInput): Promise<CreateCampaignResult> {
  if (!db) throw new Error("Database not configured")

  // Self-heal: a send that crashed or hit the serverless timeout would leave a
  // campaign stuck "sending" and lock the queue. Anything still sending after
  // 15 minutes is abandoned — mark it failed.
  await db.update(newsletterCampaigns)
    .set({ status: "failed" })
    .where(and(
      eq(newsletterCampaigns.status, "sending"),
      sql`${newsletterCampaigns.created_at} < now() - interval '15 minutes'`,
    ))

  const [activeSend] = await db.select({ id: newsletterCampaigns.id })
    .from(newsletterCampaigns)
    .where(eq(newsletterCampaigns.status, "sending"))
    .limit(1)
  if (activeSend) {
    throw new Error("يوجد إرسال جارٍ بالفعل — انتظر حتى ينتهي")
  }

  const contentHtml = opts.body.trim()

  // 1. Create the campaign. The pre-check above is a fast, friendly path, but
  // the real guarantee against the check-then-insert race (two concurrent
  // sends → duplicate emails to everyone) is the partial unique index
  // `uq_newsletter_one_sending` (post-schema.sql) that allows at most ONE row
  // with status='sending'. A losing race surfaces here as a 23505.
  let campaign: typeof newsletterCampaigns.$inferSelect
  try {
    const inserted = await db.insert(newsletterCampaigns).values({
      subject: opts.subject.trim(),
      content_html: contentHtml,
      status: "sending",
      sent_by: opts.sentBy || null,
    }).returning()
    campaign = inserted[0]
  } catch (err: unknown) {
    const e = err as Record<string, unknown> | undefined
    const code = e?.code || (e?.cause as Record<string, unknown> | undefined)?.code
    if (code === "23505") {
      throw new Error("يوجد إرسال جارٍ بالفعل — انتظر حتى ينتهي")
    }
    throw err
  }

  // 2. Active subscribers only (excludes unsubscribed / bounced / complained).
  const subscribers = await db.select({ id: newsletterSubscribers.id })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, "active"))

  if (subscribers.length === 0) {
    await db.update(newsletterCampaigns)
      .set({ status: "sent", total_recipients: 0, total_sent: 0, sent_at: sql`now()` })
      .where(eq(newsletterCampaigns.id, campaign.id))
    return { campaignId: campaign.id, total: 0, queued: false }
  }

  // 3. One queued delivery per subscriber (unique(campaign,subscriber) dedupes).
  await db.insert(newsletterDeliveries).values(
    subscribers.map((sub) => ({
      campaign_id: campaign.id,
      subscriber_id: sub.id,
      status: "queued" as const,
    })),
  )

  // 4. Click-tracking link records, extracted from a representative render.
  const wrappedHtml = newsletterHtml(contentHtml, "#")
  for (const url of extractUrls(wrappedHtml)) {
    const token = crypto.randomBytes(8).toString("hex")
    try {
      await db.insert(newsletterLinks).values({ campaign_id: campaign.id, url, token })
    } catch {
      // duplicate URL for this campaign — skip
    }
  }

  await db.update(newsletterCampaigns)
    .set({ total_recipients: subscribers.length })
    .where(eq(newsletterCampaigns.id, campaign.id))

  return { campaignId: campaign.id, total: subscribers.length, queued: true }
}

/**
 * Phase 2 of sending — RESUMABLE batch delivery. Safe to call repeatedly
 * (e.g. on job retry): it only processes deliveries still in "queued", so
 * already-sent recipients are never re-mailed. Per-recipient failures are
 * recorded (status "failed") and do not abort the run; the job worker retries
 * the whole job on a hard crash and this picks up where it left off.
 */
export async function processCampaignDeliveries(campaignId: string): Promise<SendResult> {
  if (!db) throw new Error("Database not configured")

  const [campaign] = await db.select({
    id: newsletterCampaigns.id,
    subject: newsletterCampaigns.subject,
    content_html: newsletterCampaigns.content_html,
    status: newsletterCampaigns.status,
  }).from(newsletterCampaigns).where(eq(newsletterCampaigns.id, campaignId)).limit(1)

  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)
  if (campaign.status === "sent") {
    return finalizeCampaign(campaignId)
  }

  const contentHtml = campaign.content_html

  // Respect unsubscribes/suppressions that happened AFTER the campaign was
  // created: drop any queued delivery whose subscriber is no longer active.
  // This both prevents emailing them and stops those rows from keeping the
  // campaign open forever (they'd never leave 'queued' otherwise).
  await db.update(newsletterDeliveries)
    .set({ status: "failed", error: "subscriber no longer active" })
    .where(and(
      eq(newsletterDeliveries.campaign_id, campaignId),
      eq(newsletterDeliveries.status, "queued"),
      sql`${newsletterDeliveries.subscriber_id} IN (SELECT id FROM newsletter_subscribers WHERE status <> 'active')`,
    ))

  // Only the still-unsent, still-active recipients (resumable).
  const pending = await db.select({
    deliveryId: newsletterDeliveries.id,
    email: newsletterSubscribers.email,
    unsubToken: newsletterSubscribers.unsubscribe_token,
  })
    .from(newsletterDeliveries)
    .innerJoin(newsletterSubscribers, eq(newsletterSubscribers.id, newsletterDeliveries.subscriber_id))
    .where(and(
      eq(newsletterDeliveries.campaign_id, campaignId),
      eq(newsletterDeliveries.status, "queued"),
      eq(newsletterSubscribers.status, "active"),
    ))

  // Nothing left to send (fresh finalize or fully-resumed run) → just close out.
  // Constructing the Resend client lazily means finalize never needs the key.
  if (pending.length === 0) {
    return finalizeCampaign(campaignId)
  }

  const resend = getResend()
  // Link map for click rewriting.
  const links = await db.select({ url: newsletterLinks.url, token: newsletterLinks.token })
    .from(newsletterLinks)
    .where(eq(newsletterLinks.campaign_id, campaignId))
  const linkMap = new Map(links.map((l) => [l.url, l.token]))

  for (let i = 0; i < pending.length; i += SEND_CONCURRENCY) {
    const batch = pending.slice(i, i + SEND_CONCURRENCY)
    await Promise.allSettled(
      batch.map(async (row) => {
        try {
          const unsubscribeUrl = `${APP_URL}/api/unsubscribe/newsletter?token=${row.unsubToken}`
          let emailHtml = newsletterHtml(contentHtml, unsubscribeUrl)
          emailHtml = replaceLinks(emailHtml, row.deliveryId, linkMap)
          const pixelUrl = getPixelUrl(APP_URL, row.deliveryId)
          emailHtml = emailHtml.replace(
            "</body>",
            `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;" /></body>`,
          )

          const result = await resend.emails.send({
            from: `نشرة بودكاست خط <${FROM_EMAIL}>`,
            to: row.email,
            replyTo: REPLY_TO,
            subject: campaign.subject,
            html: emailHtml,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }, {
            // Stable per-delivery key: if a crash between Resend-accept and the
            // DB update below leaves this row "queued", the retry re-sends with
            // the same key and Resend deduplicates → no double email.
            idempotencyKey: `nl-delivery-${row.deliveryId}`,
          })

          await db!.update(newsletterDeliveries)
            .set({ status: "sent", resend_message_id: result.data?.id || null, sent_at: sql`now()` })
            .where(eq(newsletterDeliveries.id, row.deliveryId))
        } catch (err: unknown) {
          await db!.update(newsletterDeliveries)
            .set({ status: "failed", error: err instanceof Error ? err.message : "Unknown error" })
            .where(eq(newsletterDeliveries.id, row.deliveryId))
        }
      }),
    )
  }

  return finalizeCampaign(campaignId)
}

/**
 * Recompute campaign totals from the delivery rows (source of truth) and close
 * the campaign when nothing is left queued. Recomputing — rather than
 * incrementing — keeps totals correct across retries and resumed runs.
 */
async function finalizeCampaign(campaignId: string): Promise<SendResult> {
  const [counts] = await db!.select({
    total: sql<number>`count(*)::int`,
    sent: sql<number>`count(*) filter (where ${newsletterDeliveries.status} not in ('queued','failed'))::int`,
    failed: sql<number>`count(*) filter (where ${newsletterDeliveries.status} = 'failed')::int`,
    queued: sql<number>`count(*) filter (where ${newsletterDeliveries.status} = 'queued')::int`,
  }).from(newsletterDeliveries).where(eq(newsletterDeliveries.campaign_id, campaignId))

  const allDone = (counts?.queued ?? 0) === 0
  await db!.update(newsletterCampaigns)
    .set({
      total_recipients: counts?.total ?? 0,
      total_sent: counts?.sent ?? 0,
      total_failed: counts?.failed ?? 0,
      ...(allDone ? { status: "sent" as const, sent_at: sql`now()` } : {}),
      updated_at: sql`now()`,
    })
    .where(eq(newsletterCampaigns.id, campaignId))

  return {
    campaignId,
    sent: counts?.sent ?? 0,
    failed: counts?.failed ?? 0,
    total: counts?.total ?? 0,
  }
}

/**
 * Synchronous all-in-one send (create + deliver). Kept for scripts/tests and
 * back-compat. Production sends go through the job queue: createCampaignRecord()
 * then enqueue "newsletter.send_campaign" → processCampaignDeliveries().
 */
export async function sendCampaign(opts: CampaignInput): Promise<SendResult> {
  const created = await createCampaignRecord(opts)
  if (!created.queued) {
    return { campaignId: created.campaignId, sent: 0, failed: 0, total: 0 }
  }
  return processCampaignDeliveries(created.campaignId)
}
