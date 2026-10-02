/**
 * The contact_message notification: sent to the site's published contact
 * address, Reply-To the sender, and the outcome recorded on the row — a
 * Resend refusal ({ data: null, error }) included.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  send: vi.fn(),
  getContactMessage: vi.fn(),
  setContactEmailStatus: vi.fn().mockResolvedValue(undefined),
  getSiteSettings: vi.fn(),
}))

vi.mock("@/lib/email/resend", () => ({
  getResend: () => ({ emails: { send: m.send } }),
  FROM_DISPLAY: "خط <noreply@khatpodcast.com>",
  REPLY_TO: "hello@khatpodcast.com",
  APP_URL: "https://khatpodcast.com",
}))
vi.mock("@/lib/email/social", () => ({ getEmailSocialLinks: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/contact/messages", () => ({
  getContactMessage: m.getContactMessage,
  setContactEmailStatus: m.setContactEmailStatus,
}))
vi.mock("@/lib/site-settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/site-settings")>("@/lib/site-settings")
  return { ...actual, getSiteSettings: m.getSiteSettings }
})

import { getHandler, type JobContext } from "@/lib/jobs"
import "@/lib/jobs/handlers/submission-notify"

const CTX: JobContext = {
  jobId: "job-1",
  jobType: "email.notify_submission",
  attempt: 0,
  maxAttempts: 5,
  workerId: "test",
  reportProgress: vi.fn(async () => undefined),
}
const MSG = {
  id: "msg-1",
  name: "خالد",
  email: "sender@example.com",
  message: "<b>سؤال</b> عن الحلقة",
  email_status: "queued",
  email_error: null,
  emailed_at: null,
  read_at: null,
  created_at: "2026-10-02T00:00:00Z",
}
const run = () =>
  getHandler("email.notify_submission")!({ kind: "contact_message", reference: "msg-1" }, CTX)

beforeEach(() => {
  vi.clearAllMocks()
  m.getContactMessage.mockResolvedValue(MSG)
  m.getSiteSettings.mockResolvedValue({ metadata: { contactEmail: "team@khatpodcast.com" } })
})

describe("contact_message notification", () => {
  it("sends to the configured contact address, Reply-To the sender, then marks sent", async () => {
    m.send.mockResolvedValue({ data: { id: "re_1" }, error: null })
    await run()
    const [payload, opts] = m.send.mock.calls[0]
    expect(payload.to).toBe("team@khatpodcast.com")
    expect(payload.replyTo).toBe("sender@example.com")
    expect(payload.html).toContain("&lt;b&gt;سؤال&lt;/b&gt;") // escaped, never raw HTML
    expect(opts).toEqual({ idempotencyKey: "contact-admin-msg-1" })
    expect(m.setContactEmailStatus).toHaveBeenCalledWith("msg-1", "sent")
  })

  it("raw «a<b & c» is escaped exactly ONCE in the email HTML", async () => {
    m.getContactMessage.mockResolvedValue({ ...MSG, name: "a<b & c", message: "a<b & c" })
    m.send.mockResolvedValue({ data: { id: "re_1" }, error: null })
    await run()
    const html: string = m.send.mock.calls[0][0].html
    expect(html).toContain("a&lt;b &amp; c")
    expect(html).not.toContain("a<b & c")
    expect(html).not.toContain("&amp;lt;") // not double-escaped
    expect(html).not.toContain("&amp;amp;")
  })

  it("falls back to hello@khatpodcast.com when settings are unreadable", async () => {
    m.getSiteSettings.mockRejectedValue(new Error("db"))
    m.send.mockResolvedValue({ data: { id: "re_1" }, error: null })
    await run()
    expect(m.send.mock.calls[0][0].to).toBe("hello@khatpodcast.com")
  })

  it("a Resend REFUSAL (resolved {error}) ⇒ row marked failed with the reason, job throws to retry", async () => {
    m.send.mockResolvedValue({ data: null, error: { name: "daily_quota_exceeded", message: "quota" } })
    await expect(run()).rejects.toThrow(/quota/)
    expect(m.setContactEmailStatus).toHaveBeenCalledWith("msg-1", "failed", expect.stringContaining("quota"))
    expect(m.setContactEmailStatus).not.toHaveBeenCalledWith("msg-1", "sent")
  })

  it("a missing row fails the job (nothing to send)", async () => {
    m.getContactMessage.mockResolvedValue(null)
    await expect(run()).rejects.toThrow(/not found/)
    expect(m.send).not.toHaveBeenCalled()
  })
})
