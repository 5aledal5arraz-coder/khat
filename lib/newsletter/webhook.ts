/**
 * Resend webhook verification + event processing.
 *
 * Resend signs webhooks with Svix. We verify the signature ourselves
 * (HMAC-SHA256 over `${id}.${timestamp}.${body}`) rather than pulling in
 * the `svix` package — the algorithm is stable and documented.
 *
 * Processing is fully IDEMPOTENT: every state transition is guarded by a
 * "stamp once" timestamp column (delivered_at / bounced_at / complained_at)
 * so Resend's at-least-once retries never double-count campaign totals or
 * re-suppress a subscriber.
 *
 * Long-term sender reputation:
 *   • hard bounces  → subscriber suppressed (status 'bounced'), never mailed again
 *   • complaints    → subscriber suppressed (status 'complained'), always (legal)
 *   • soft/transient bounces → recorded, but the address is kept
 *
 * Opens/clicks are intentionally NOT handled here — we track those via our
 * own pixel + link-redirect endpoints, so consuming Resend's open/click
 * events too would double-count.
 */

import crypto from "crypto"
import { and, eq, isNull, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { newsletterCampaigns, newsletterDeliveries } from "@/lib/db/schema/newsletter"
import { newsletterSubscribers } from "@/lib/db/schema/system"

const REPLAY_TOLERANCE_SEC = 60 * 5

export function verifyResendSignature(opts: {
  secret: string
  svixId: string | null
  svixTimestamp: string | null
  svixSignature: string | null
  body: string
}): boolean {
  const { secret, svixId, svixTimestamp, svixSignature, body } = opts
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false

  // Replay protection — reject stale/future timestamps.
  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(Date.now() / 1000 - ts) > REPLAY_TOLERANCE_SEC) return false

  // Secret is "whsec_<base64>"; the HMAC key is the decoded base64 part.
  const secretKey = secret.startsWith("whsec_") ? secret.slice(6) : secret
  let keyBytes: Buffer
  try {
    keyBytes = Buffer.from(secretKey, "base64")
  } catch {
    return false
  }
  if (keyBytes.length === 0) return false

  const signedContent = `${svixId}.${svixTimestamp}.${body}`
  const expected = crypto.createHmac("sha256", keyBytes).update(signedContent).digest("base64")
  const expectedBuf = Buffer.from(expected)

  // The signature header is a space-delimited list of "v1,<sig>" entries.
  const provided = svixSignature
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter(Boolean)

  return provided.some((sig) => {
    const sigBuf = Buffer.from(sig)
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
  })
}

export interface ResendEvent {
  type?: string
  data?: {
    email_id?: string
    bounce?: { type?: string; subType?: string; message?: string }
    [k: string]: unknown
  }
}

export interface ProcessResult {
  handled: boolean
  action: string
}

/** Soft bounces are transient — keep the address; everything else suppresses. */
function isSoftBounce(bounceType: string | null): boolean {
  return bounceType ? /transient|soft|delayed/i.test(bounceType) : false
}

export async function processResendEvent(event: ResendEvent): Promise<ProcessResult> {
  if (!db) return { handled: false, action: "no_db" }
  const type = event.type || ""
  const emailId = event.data?.email_id
  if (!emailId) return { handled: false, action: "no_email_id" }

  const [delivery] = await db
    .select({
      id: newsletterDeliveries.id,
      campaign_id: newsletterDeliveries.campaign_id,
      subscriber_id: newsletterDeliveries.subscriber_id,
    })
    .from(newsletterDeliveries)
    .where(eq(newsletterDeliveries.resend_message_id, emailId))
    .limit(1)
  if (!delivery) return { handled: false, action: "delivery_not_found" }

  switch (type) {
    case "email.delivered": {
      const res = await db
        .update(newsletterDeliveries)
        .set({
          delivered_at: sql`now()`,
          last_event_at: sql`now()`,
          // Don't downgrade an already opened/clicked delivery.
          status: sql`CASE WHEN ${newsletterDeliveries.status} IN ('queued','sent') THEN 'delivered' ELSE ${newsletterDeliveries.status} END`,
        })
        .where(and(eq(newsletterDeliveries.id, delivery.id), isNull(newsletterDeliveries.delivered_at)))
        .returning({ id: newsletterDeliveries.id })
      if (res.length) {
        await db
          .update(newsletterCampaigns)
          .set({ total_delivered: sql`COALESCE(${newsletterCampaigns.total_delivered}, 0) + 1` })
          .where(eq(newsletterCampaigns.id, delivery.campaign_id))
      }
      return { handled: true, action: "delivered" }
    }

    case "email.bounced": {
      const bounceType = event.data?.bounce?.type || event.data?.bounce?.subType || null
      const soft = isSoftBounce(bounceType)
      const res = await db
        .update(newsletterDeliveries)
        .set({
          bounced_at: sql`now()`,
          bounce_type: bounceType,
          last_event_at: sql`now()`,
          status: "bounced",
          error: event.data?.bounce?.message || "bounced",
        })
        .where(and(eq(newsletterDeliveries.id, delivery.id), isNull(newsletterDeliveries.bounced_at)))
        .returning({ id: newsletterDeliveries.id })
      if (res.length) {
        await db
          .update(newsletterCampaigns)
          .set({ total_bounced: sql`COALESCE(${newsletterCampaigns.total_bounced}, 0) + 1` })
          .where(eq(newsletterCampaigns.id, delivery.campaign_id))
        if (!soft) {
          // Permanent/undetermined bounce → suppress so we never mail a dead
          // address again (protects sender reputation).
          await db
            .update(newsletterSubscribers)
            .set({ status: "bounced", unsubscribed_at: sql`now()` })
            .where(and(eq(newsletterSubscribers.id, delivery.subscriber_id), eq(newsletterSubscribers.status, "active")))
        }
      }
      return { handled: true, action: soft ? "bounced_soft" : "bounced_suppressed" }
    }

    case "email.complained": {
      const res = await db
        .update(newsletterDeliveries)
        .set({ complained_at: sql`now()`, last_event_at: sql`now()`, status: "complained" })
        .where(and(eq(newsletterDeliveries.id, delivery.id), isNull(newsletterDeliveries.complained_at)))
        .returning({ id: newsletterDeliveries.id })
      if (res.length) {
        await db
          .update(newsletterCampaigns)
          .set({ total_complaints: sql`COALESCE(${newsletterCampaigns.total_complaints}, 0) + 1` })
          .where(eq(newsletterCampaigns.id, delivery.campaign_id))
        // A spam complaint MUST always suppress — never mail a complainer
        // again. Guarded so a repeat complaint (e.g. on a second campaign)
        // doesn't re-stamp an already-complained subscriber.
        await db
          .update(newsletterSubscribers)
          .set({ status: "complained", unsubscribed_at: sql`now()` })
          .where(and(
            eq(newsletterSubscribers.id, delivery.subscriber_id),
            ne(newsletterSubscribers.status, "complained"),
          ))
      }
      return { handled: true, action: "complained_suppressed" }
    }

    case "email.delivery_delayed": {
      await db
        .update(newsletterDeliveries)
        .set({ last_event_at: sql`now()` })
        .where(eq(newsletterDeliveries.id, delivery.id))
      return { handled: true, action: "delayed" }
    }

    // Opens/clicks are tracked by our own pixel + link redirects; ignore here.
    default:
      return { handled: false, action: `ignored:${type || "unknown"}` }
  }
}
