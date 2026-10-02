/**
 * POST /api/contact — CSRF, rate limit, honeypot, validation, store FIRST,
 * then queue the team notification; an enqueue failure is recorded on the row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  createContactMessage: vi.fn(),
  setContactEmailStatus: vi.fn().mockResolvedValue(undefined),
  enqueueJob: vi.fn(),
  countContactMessagesSince: vi.fn(),
  /** per-action allow switch for the rate limiter */
  allowed: {} as Record<string, boolean>,
  rlCalls: [] as string[],
}))
vi.mock("@/lib/contact/messages", () => ({
  createContactMessage: m.createContactMessage,
  setContactEmailStatus: m.setContactEmailStatus,
  countContactMessagesSince: m.countContactMessagesSince,
}))
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob: m.enqueueJob }))
vi.mock("@/lib/rate-limit", () => ({
  checkIpRateLimit: vi.fn((_r: unknown, action: string) => {
    m.rlCalls.push(action)
    return { allowed: m.allowed[action] ?? true }
  }),
}))

import { POST } from "@/app/api/contact/route"

const VALID = { name: "خالد", email: "k@example.com", message: "رسالة تجريبية كافية الطول" }

function req(body: unknown, headers: Record<string, string> = { "x-requested-with": "khat" }) {
  return new NextRequest("http://localhost:3000/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", origin: "http://localhost:3000", ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.allowed = {}
  m.rlCalls = []
  m.countContactMessagesSince.mockResolvedValue(1)
  m.createContactMessage.mockResolvedValue("msg-1")
  m.enqueueJob.mockResolvedValue({ id: "job-1" })
})

describe("POST /api/contact", () => {
  it("stores the message, then queues the notification with its id", async () => {
    const res = await POST(req(VALID))
    expect(res.status).toBe(200)
    expect(m.createContactMessage).toHaveBeenCalledWith({ name: "خالد", email: "k@example.com", message: VALID.message })
    expect(m.enqueueJob).toHaveBeenCalledWith(
      "email.notify_submission",
      { kind: "contact_message", reference: "msg-1" },
      expect.anything(),
    )
    expect(m.createContactMessage.mock.invocationCallOrder[0]).toBeLessThan(m.enqueueJob.mock.invocationCallOrder[0])
  })

  it("enqueue failure ⇒ still 200 (message is in the inbox) and the row records the failure", async () => {
    m.enqueueJob.mockRejectedValue(new Error("db down"))
    const res = await POST(req(VALID))
    expect(res.status).toBe(200)
    expect(m.setContactEmailStatus).toHaveBeenCalledWith("msg-1", "failed", expect.any(String))
  })

  it("honeypot filled ⇒ looks like success, stores nothing", async () => {
    const res = await POST(req({ ...VALID, website: "http://spam" }))
    expect(res.status).toBe(200)
    expect(m.createContactMessage).not.toHaveBeenCalled()
    expect(m.enqueueJob).not.toHaveBeenCalled()
  })

  it("invalid ⇒ 400 with an Arabic error, nothing stored", async () => {
    const res = await POST(req({ ...VALID, email: "bad" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/البريد/)
    expect(m.createContactMessage).not.toHaveBeenCalled()
  })

  it("missing CSRF header ⇒ 403", async () => {
    const res = await POST(req(VALID, { "x-requested-with": "" }))
    expect(res.status).toBe(403)
    expect(m.createContactMessage).not.toHaveBeenCalled()
  })

  it("cross-origin ⇒ 403", async () => {
    const res = await POST(req(VALID, { "x-requested-with": "khat", origin: "https://evil.example" }))
    expect(res.status).toBe(403)
  })

  it("accepted-submission limit hit ⇒ 429, nothing stored", async () => {
    m.allowed = { contact_message: false }
    const res = await POST(req(VALID))
    expect(res.status).toBe(429)
    expect(m.createContactMessage).not.toHaveBeenCalled()
  })

  it("an INVALID submission does not consume the accepted-submission budget (only the loose attempts one)", async () => {
    const res = await POST(req({ ...VALID, email: "bad" }))
    expect(res.status).toBe(400)
    expect(m.rlCalls).toEqual(["contact_attempt"])
  })

  it("a valid submission is counted against BOTH limits", async () => {
    await POST(req(VALID))
    expect(m.rlCalls).toEqual(["contact_attempt", "contact_message"])
  })

  it("loose attempts limit hit ⇒ 429 before validation", async () => {
    m.allowed = { contact_attempt: false }
    const res = await POST(req({ ...VALID, email: "bad" }))
    expect(res.status).toBe(429)
    expect(m.rlCalls).toEqual(["contact_attempt"])
  })

  it("stores the visitor's text RAW — no HTML stripping («a<b & c» round-trips)", async () => {
    await POST(req({ ...VALID, name: "a<b & c", message: "a<b & c — <i>نص</i> كامل" }))
    expect(m.createContactMessage).toHaveBeenCalledWith({
      name: "a<b & c",
      email: "k@example.com",
      message: "a<b & c — <i>نص</i> كامل",
    })
  })

  it("over the global hourly email cap ⇒ row stored, marked failed with the reason, NO email queued", async () => {
    m.countContactMessagesSince.mockResolvedValue(21)
    const res = await POST(req(VALID))
    expect(res.status).toBe(200)
    expect(m.createContactMessage).toHaveBeenCalled()
    expect(m.enqueueJob).not.toHaveBeenCalled()
    expect(m.setContactEmailStatus).toHaveBeenCalledWith("msg-1", "failed", "تجاوز سقف الإيميلات بالساعة (20)")
  })

  it("at the cap exactly (20th message this hour) ⇒ still emailed", async () => {
    m.countContactMessagesSince.mockResolvedValue(20)
    await POST(req(VALID))
    expect(m.enqueueJob).toHaveBeenCalled()
  })
})
