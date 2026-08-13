/**
 * A REFUSED NEWSLETTER DELIVERY MUST NOT BE FILED AS SENT.
 *
 * This was the worst of the swallowed-email family, because it did not merely
 * lose the error — it wrote a false fact and kept it. Resend resolves with
 * `{ data: null, error }` on a refusal, the send loop never looked, and the row
 * was stamped `status: "sent"`, `sent_at: now()`, `resend_message_id: NULL`.
 *
 * Three consequences, all measured against the code that reads the column:
 *   1. `finalizeCampaign` counts everything not queued/failed as sent, so the
 *      campaign report claims a subscriber was reached who was not.
 *   2. The admin delivery list (lib/newsletter/queries.ts) shows it as sent
 *      with no error, so nobody resends.
 *   3. It is PERMANENT: the Resend webhook finds a delivery by
 *      `resend_message_id` (lib/newsletter/webhook.ts), and NULL matches
 *      nothing — the row can never be corrected to delivered or bounced.
 *
 * `status = 'sent' AND resend_message_id IS NULL` is the fingerprint of a row
 * written before the fix.
 *
 * Nothing reaches api.resend.com and nothing reaches Postgres: both are spies.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

const { sendSpy, writes, selectQueue } = vi.hoisted(() => ({
  sendSpy: vi.fn(),
  writes: [] as Record<string, unknown>[],
  selectQueue: [] as unknown[][],
}))

vi.mock("@/lib/email/resend", () => ({
  getResend: () => ({ emails: { send: sendSpy } }),
  FROM_EMAIL: "noreply@khatpodcast.com",
  FROM_DISPLAY: "بودكاست خط <noreply@khatpodcast.com>",
  REPLY_TO: "hello@khatpodcast.com",
  APP_URL: "https://khatpodcast.com",
  WEBHOOK_SECRET: "",
}))

vi.mock("@/lib/email/social", async () => {
  const templates = await vi.importActual<typeof import("@/lib/email/templates")>(
    "@/lib/email/templates",
  )
  return { getEmailSocialLinks: async () => templates.EMAIL_SOCIAL_LINKS }
})

/**
 * Tracking needs NEWSLETTER_TRACKING_SECRET and THROWS without it — which, on
 * the first run of this file, blew up before the send and made every assertion
 * below pass for the wrong reason: no row was marked sent because no message
 * was ever attempted. Stubbed so the loop reaches the provider; the tests below
 * assert `sendSpy` was actually called so this cannot go quiet again.
 */
vi.mock("@/lib/newsletter/tracking", () => ({
  getPixelUrl: () => "https://khatpodcast.com/api/newsletter/track/open?d=del-1&s=sig",
  getClickUrl: () => "https://khatpodcast.com/api/newsletter/track/click?d=del-1&s=sig",
}))

vi.mock("@/lib/db", () => {
  /** Chainable, thenable stand-in for a Drizzle query builder. */
  function chain(resolve: () => unknown) {
    const c: Record<string, unknown> = {}
    for (const m of ["from", "where", "innerJoin", "limit", "orderBy", "groupBy", "returning"]) {
      c[m] = () => c
    }
    c.then = (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(ok, no)
    return c
  }
  return {
    db: {
      select: () => chain(() => selectQueue.shift() ?? []),
      update: () => {
        const c = chain(() => []) as Record<string, unknown>
        c.set = (payload: Record<string, unknown>) => {
          writes.push(payload)
          return c
        }
        return c
      },
    },
  }
})

import { processCampaignDeliveries } from "@/lib/newsletter/sender"

const ACCEPTED = { data: { id: "resend-msg-1" }, error: null }
const REFUSED = {
  data: null,
  error: { message: "domain is not verified", name: "validation_error" },
}

/** The four selects processCampaignDeliveries makes, in order. */
function primeSelects() {
  selectQueue.length = 0
  selectQueue.push(
    [{ id: "camp-1", subject: "عدد الأسبوع", content_html: "<p>مرحباً</p>", status: "sending" }],
    [{ deliveryId: "del-1", email: "reader@example.com", unsubToken: "unsub-tok" }],
    [], // link map
    [{ total: 1, sent: 0, failed: 1, queued: 0 }],
  )
}

/** Writes that carry a per-delivery outcome (the campaign-totals write does not). */
function deliveryWrites() {
  return writes.filter((w) => "status" in w && w.status !== undefined && !("total_recipients" in w))
}

beforeEach(() => {
  sendSpy.mockReset()
  writes.length = 0
  primeSelects()
})

describe("the harness is not blind (guard the guard)", () => {
  it("the send loop actually reaches the provider", async () => {
    // THE failure this file already had once: tracking threw before the send,
    // so "no row was marked sent" was true for a reason that had nothing to do
    // with error handling. Every assertion below is worthless unless a message
    // was genuinely attempted.
    sendSpy.mockResolvedValue(ACCEPTED)
    await processCampaignDeliveries("camp-1")
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it("a run produces a delivery write at all", async () => {
    // An empty list would satisfy "no row marked sent" just as well.
    sendSpy.mockResolvedValue(ACCEPTED)
    await processCampaignDeliveries("camp-1")
    expect(deliveryWrites().length).toBeGreaterThan(0)
  })
})

describe("CONTROL: an accepted send is filed as sent", () => {
  it("writes status sent WITH the provider's message id", async () => {
    sendSpy.mockResolvedValue(ACCEPTED)
    await processCampaignDeliveries("camp-1")

    const sent = deliveryWrites().filter((w) => w.status === "sent")
    expect(sent).toHaveLength(1)
    // The message id is what lets the webhook later correct this row to
    // delivered/bounced. A sent row without one is unreachable forever.
    expect(sent[0].resend_message_id).toBe("resend-msg-1")
  })
})

describe("MUTATION: a refused send is NOT filed as sent", () => {
  beforeEach(() => {
    sendSpy.mockResolvedValue(REFUSED)
  })

  it("writes no delivery row claiming sent", async () => {
    await processCampaignDeliveries("camp-1")
    // The message WAS attempted and WAS refused — this is the real branch, not
    // an early exit that never got near the provider.
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(deliveryWrites().filter((w) => w.status === "sent")).toEqual([])
  })

  it("never writes a sent row with a NULL message id (the false-record fingerprint)", async () => {
    await processCampaignDeliveries("camp-1")
    const orphans = deliveryWrites().filter(
      (w) => w.status === "sent" && (w.resend_message_id === null || w.resend_message_id === undefined),
    )
    expect(orphans).toEqual([])
  })

  it("files it as failed, carrying the provider's reason", async () => {
    await processCampaignDeliveries("camp-1")
    const failed = deliveryWrites().filter(
      (w) => w.status === "failed" && String(w.error).includes("domain is not verified"),
    )
    expect(failed).toHaveLength(1)
  })

  it("does not throw the whole campaign away over one refusal", async () => {
    // Per-recipient failure is isolated: the run completes and reports, so the
    // other subscribers in a batch still get their copy.
    await expect(processCampaignDeliveries("camp-1")).resolves.toMatchObject({
      campaignId: "camp-1",
    })
  })
})

describe("a transport rejection is filed the same way (unchanged behaviour)", () => {
  it("writes failed with the thrown reason", async () => {
    sendSpy.mockRejectedValue(new Error("ECONNRESET"))
    await processCampaignDeliveries("camp-1")

    expect(deliveryWrites().filter((w) => w.status === "sent")).toEqual([])
    expect(
      deliveryWrites().filter((w) => w.status === "failed" && String(w.error).includes("ECONNRESET")),
    ).toHaveLength(1)
  })
})
