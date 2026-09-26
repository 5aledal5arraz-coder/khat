/**
 * «نسخة الضيف» — the public POST/GET routes: rate limits, origin, JSON-only,
 * body cap, private headers, the questionnaire gate, and the pending cap.
 * The service layer is mocked; the route logic under test is real.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const svc = vi.hoisted(() => ({
  link: null as null | Record<string, unknown>,
  recordingAt: null as Date | null,
  createResult: { ok: true, id: "sug-1" } as Record<string, unknown>,
  submitted: [] as unknown[],
}))

vi.mock("@/lib/guest-link/service", () => ({
  findGuestLinkByToken: vi.fn(async () => (svc.link ? { row: svc.link, recordingAt: svc.recordingAt } : null)),
  submitGuestQuestionnaire: vi.fn(async (_id: string, q: unknown) => {
    svc.submitted.push(q)
    return true
  }),
  saveGuestDraft: vi.fn(async () => true),
  markGuestWelcomeSeen: vi.fn(async () => true),
  createGuestSuggestion: vi.fn(async () => svc.createResult),
}))

import { POST as submitPOST } from "@/app/api/prepare/[token]/submit/route"
import { POST as suggestPOST } from "@/app/api/prepare/[token]/suggestions/route"
import { GET as calendarGET } from "@/app/api/prepare/[token]/calendar/route"
import { GUEST_RATE_LIMITS } from "@/lib/guest-link/route-helpers"
import { GUEST_LINK_MAX_BODY_BYTES } from "@/lib/validation/guest-link"

const TOKEN = "A".repeat(43)
let ipN = 0
let ip = ""

function req(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "localhost:3000",
      "x-forwarded-for": ip,
      ...(body === undefined ? {} : { "content-type": "application/json", origin: "http://localhost:3000" }),
      ...headers,
    },
  }
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body)
  return new NextRequest(`http://localhost:3000/api/prepare/${TOKEN}/${path}`, init)
}
const params = { params: Promise.resolve({ token: TOKEN }) }

const ANSWERS = {
  full_name: "بدر الطريجي",
  phone_whatsapp: "+96599990000",
  preferred_drink: "قهوة",
  preferred_filming_days: ["sunday"],
  preferred_filming_time: "evening",
  topics_excited_about: "القيادة",
  arrival_confirmation: true,
}

function activeLink(over: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    eir_id: "eir-1",
    status: "active",
    revoked_at: null,
    expires_at: new Date(Date.now() + 86_400_000),
    questionnaire_submitted_at: new Date(),
    published_view: { v: 1, schedule_at: "2026-10-01T16:00:00.000Z", location: null, axes: [] },
    published_ref_map: {},
    ...over,
  }
}

beforeEach(() => {
  ip = `10.0.0.${++ipN}`
  svc.link = activeLink()
  svc.recordingAt = null
  svc.createResult = { ok: true, id: "sug-1" }
  svc.submitted = []
})

describe("submit", () => {
  it("accepts a valid questionnaire and answers private + noindex", async () => {
    const res = await submitPOST(req("submit", ANSWERS), params)
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(res.headers.get("x-robots-tag")).toContain("noindex")
    expect(svc.submitted).toHaveLength(1)
  })

  it("field errors come back keyed by field", async () => {
    const res = await submitPOST(req("submit", { ...ANSWERS, full_name: "" }), params)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.fields.full_name).toBeTruthy()
  })

  it(`rate limit: ${GUEST_RATE_LIMITS.submit.max}/hour/IP, then 429`, async () => {
    for (let i = 0; i < GUEST_RATE_LIMITS.submit.max; i++) {
      expect((await submitPOST(req("submit", ANSWERS), params)).status).toBe(200)
    }
    expect((await submitPOST(req("submit", ANSWERS), params)).status).toBe(429)
  })

  it("cross-origin → 403; not JSON → 415; oversize → 413; bad JSON → 400", async () => {
    expect((await submitPOST(req("submit", ANSWERS, { origin: "https://evil.example" }), params)).status).toBe(403)
    expect((await submitPOST(req("submit", "x=1", { "content-type": "application/x-www-form-urlencoded" }), params)).status).toBe(415)
    const big = JSON.stringify({ ...ANSWERS, team_notes: "x".repeat(GUEST_LINK_MAX_BODY_BYTES) })
    expect((await submitPOST(req("submit", big), params)).status).toBe(413)
    expect((await submitPOST(req("submit", "{not json"), params)).status).toBe(400)
  })

  it("revoked or expired links cannot be written", async () => {
    svc.link = activeLink({ status: "revoked", revoked_at: new Date() })
    expect((await submitPOST(req("submit", ANSWERS), params)).status).toBe(410)
    svc.link = activeLink({ expires_at: new Date(Date.now() - 1000) })
    expect((await submitPOST(req("submit", ANSWERS), params)).status).toBe(410)
    svc.link = null
    expect((await submitPOST(req("submit", ANSWERS), params)).status).toBe(404)
    expect(svc.submitted).toHaveLength(0)
  })
})

describe("suggestions", () => {
  const S = { target_kind: "general", suggestion_type: "comment", body: "ملاحظة" }

  it("gated on the questionnaire", async () => {
    svc.link = activeLink({ questionnaire_submitted_at: null })
    expect((await suggestPOST(req("suggestions", S), params)).status).toBe(409)
  })

  it("201 on success", async () => {
    expect((await suggestPOST(req("suggestions", S), params)).status).toBe(201)
  })

  it("pending cap surfaces as 429", async () => {
    svc.createResult = { ok: false, reason: "too_many" }
    expect((await suggestPOST(req("suggestions", S), params)).status).toBe(429)
  })

  it(`rate limit: ${GUEST_RATE_LIMITS.suggestion.max}/hour/IP`, async () => {
    for (let i = 0; i < GUEST_RATE_LIMITS.suggestion.max; i++) {
      expect((await suggestPOST(req("suggestions", S), params)).status).toBe(201)
    }
    expect((await suggestPOST(req("suggestions", S), params)).status).toBe(429)
  })

  it("strict schema rejects client-supplied original_text", async () => {
    const res = await suggestPOST(req("suggestions", { ...S, original_text: "spoof" }), params)
    expect(res.status).toBe(422)
  })
})

describe("calendar (GET)", () => {
  it("built from the published snapshot; 404 before submit", async () => {
    const ok = await calendarGET(req("calendar"), params)
    expect(ok.status).toBe(200)
    expect(ok.headers.get("content-type")).toContain("text/calendar")
    svc.link = activeLink({ questionnaire_submitted_at: null })
    expect((await calendarGET(req("calendar"), params)).status).toBe(404)
  })

  it(`read rate limit: ${GUEST_RATE_LIMITS.read.max}/min/IP`, async () => {
    for (let i = 0; i < GUEST_RATE_LIMITS.read.max; i++) await calendarGET(req("calendar"), params)
    expect((await calendarGET(req("calendar"), params)).status).toBe(429)
  })
})
