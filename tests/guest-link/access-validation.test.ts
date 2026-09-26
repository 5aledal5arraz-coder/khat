/**
 * «نسخة الضيف» — token/expiry rules, questionnaire + suggestion parsers,
 * sanitizer, map allowlist, staleness, .ics, Kuwait appointment formatting.
 */

import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import {
  effectiveExpiry,
  EXPIRY_AFTER_RECORDING_MS,
  EXPIRY_WITHOUT_DATE_MS,
  fallbackExpiry,
  generateGuestLinkToken,
  guestStage,
  hashGuestLinkToken,
  isPlausibleToken,
  linkAccess,
} from "@/lib/guest-link/access"
import {
  GUEST_FIELD_MAX,
  guestQuestionnaireDraftSchema,
  guestQuestionnaireSubmitSchema,
  LEGACY_QUESTIONNAIRE_KEYS,
  QUESTIONNAIRE_STEPS,
  guestSuggestionSchema,
  sanitizeGuestText,
  validateMapUrl,
} from "@/lib/validation/guest-link"
import { publishStaleness } from "@/lib/guest-link/admin"
import { buildRecordingIcs } from "@/lib/guest-link/ics"
import { formatKuwaitAppointment } from "@/lib/shared/formatters"
import { ownSuggestionTag, resolveSuggestionTarget } from "@/lib/guest-link/service"

describe("token", () => {
  it("32 random bytes base64url, sha256-hex stored", () => {
    const { token, hash } = generateGuestLinkToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"))
    expect(hashGuestLinkToken(token)).toBe(hash)
    expect(generateGuestLinkToken().token).not.toBe(token)
  })
  it("rejects implausible tokens before any lookup", () => {
    expect(isPlausibleToken("live")).toBe(false)
    expect(isPlausibleToken("../../etc/passwd")).toBe(false)
    expect(isPlausibleToken(generateGuestLinkToken().token)).toBe(true)
  })
})

describe("expiry", () => {
  const issued = new Date("2026-09-01T00:00:00Z")
  const fallback = fallbackExpiry(issued)
  it("no date: 14 days from issue", () => {
    expect(fallback.getTime() - issued.getTime()).toBe(EXPIRY_WITHOUT_DATE_MS)
    expect(effectiveExpiry(null, fallback)).toEqual(fallback)
  })
  it("with a date: recording + 3 days, even when set after issue", () => {
    const rec = new Date("2026-10-10T16:00:00Z")
    expect(effectiveExpiry(rec, fallback).getTime()).toBe(rec.getTime() + EXPIRY_AFTER_RECORDING_MS)
  })
  it("linkAccess: ok / expired / revoked", () => {
    const row = { status: "active", revoked_at: null, expires_at: fallback }
    expect(linkAccess(row, null, new Date("2026-09-10T00:00:00Z"))).toBe("ok")
    expect(linkAccess(row, null, new Date("2026-09-16T00:00:00Z"))).toBe("expired")
    // A recording date later than the fallback keeps it alive.
    expect(linkAccess(row, new Date("2026-09-20T00:00:00Z"), new Date("2026-09-16T00:00:00Z"))).toBe("ok")
    expect(linkAccess({ ...row, status: "revoked" }, null, new Date("2026-09-02T00:00:00Z"))).toBe("revoked")
    expect(linkAccess({ ...row, revoked_at: new Date() }, null, new Date("2026-09-02T00:00:00Z"))).toBe("revoked")
  })
  it("stage is gated on questionnaire_submitted_at", () => {
    expect(guestStage({ questionnaire_submitted_at: null, welcome_seen_at: new Date() })).toBe("questionnaire")
    expect(guestStage({ questionnaire_submitted_at: new Date(), welcome_seen_at: null })).toBe("welcome")
    expect(guestStage({ questionnaire_submitted_at: new Date(), welcome_seen_at: new Date() })).toBe("prep")
  })
})

const VALID = {
  honorific: "خبير إداري",
  kunya: "بو فهد",
  pronunciation_notes: "",
  phone_whatsapp: "+965 9999 0000",
  preferred_drink: "قهوة",
  technical_needs: null,
  social_accounts: { instagram: "@x" },
  team_notes: "",
  arrival_confirmation: true,
  clothing_acknowledgment: false,
}

describe("questionnaire parser", () => {
  it("accepts اللقب أو المسمى and الكنية; optional empties → null", () => {
    const r = guestQuestionnaireSubmitSchema.safeParse(VALID)
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.honorific).toBe("خبير إداري")
    expect(r.data.kunya).toBe("بو فهد")
    expect(r.data.pronunciation_notes).toBeNull()
    expect(r.data.team_notes).toBeNull()
  })
  it("اللقب أو المسمى and الكنية are required", () => {
    for (const bad of [null, undefined, "", " "]) {
      const r = guestQuestionnaireSubmitSchema.safeParse({ ...VALID, kunya: bad, honorific: bad })
      expect(r.success).toBe(false)
      const paths = r.success ? [] : r.error.issues.map((i) => String(i.path[0]))
      expect(paths).toEqual(expect.arrayContaining(["honorific", "kunya"]))
    }
  })
  it("required fields report per field", () => {
    const r = guestQuestionnaireSubmitSchema.safeParse({
      ...VALID,
      honorific: " ",
      phone_whatsapp: "abc",
      arrival_confirmation: false,
    })
    expect(r.success).toBe(false)
    const paths = r.success ? [] : r.error.issues.map((i) => String(i.path[0]))
    expect(paths).toEqual(expect.arrayContaining(["honorific", "phone_whatsapp", "arrival_confirmation"]))
  })
  it("removed fields are neither required nor kept: absent is fine, present is dropped", () => {
    const r = guestQuestionnaireSubmitSchema.safeParse({
      ...VALID,
      full_name: "بدر الطريجي",
      preferred_filming_days: ["sunday"],
      preferred_filming_time: "evening",
      scheduling_restrictions: "سفر",
      topics_excited_about: "القيادة",
      sensitivities_to_avoid: "موضوع",
    })
    expect(r.success).toBe(true)
    if (!r.success) return
    for (const k of LEGACY_QUESTIONNAIRE_KEYS) expect(r.data).not.toHaveProperty(k)
    const d = guestQuestionnaireDraftSchema.safeParse({ step: 0, draft: { full_name: "ب", kunya: "بو" } })
    expect(d.success).toBe(true)
    if (!d.success) return
    expect(d.data.draft.kunya).toBe("بو")
    expect(d.data.draft).not.toHaveProperty("full_name")
  })
  it("strict: unknown keys and over-long values are rejected", () => {
    expect(guestQuestionnaireSubmitSchema.safeParse({ ...VALID, is_admin: true }).success).toBe(false)
    expect(guestQuestionnaireSubmitSchema.safeParse({ ...VALID, kunya: "ب".repeat(61) }).success).toBe(false)
    expect(
      guestQuestionnaireSubmitSchema.safeParse({ ...VALID, honorific: "ب".repeat(GUEST_FIELD_MAX.honorific + 1) }).success,
    ).toBe(false)
    expect(
      guestQuestionnaireSubmitSchema.safeParse({ ...VALID, social_accounts: { myspace: "x" } }).success,
    ).toBe(false)
  })
  it("draft accepts partial input but still caps and is strict", () => {
    expect(guestQuestionnaireDraftSchema.safeParse({ step: 1, draft: { honorific: "خ" } }).success).toBe(true)
    expect(guestQuestionnaireDraftSchema.safeParse({ step: QUESTIONNAIRE_STEPS, draft: {} }).success).toBe(false)
    expect(guestQuestionnaireDraftSchema.safeParse({ step: 0, draft: { x: 1 } }).success).toBe(false)
  })
})

describe("sanitizer + suggestion schema", () => {
  it("NFC, strips control and bidi-override chars, trims", () => {
    const dirty = "  a‮evil‬\u0007b\r\n\n\n\nc  "
    expect(sanitizeGuestText(dirty)).toBe("aevilb\n\nc")
    expect(sanitizeGuestText("é")).toBe("é")
  })
  it("body 1–1000 after sanitising; axis needs a ref, general must not have one", () => {
    const ok = guestSuggestionSchema.safeParse({
      target_kind: "axis",
      target_ref: "a2",
      suggestion_type: "edit",
      body: " اقتراح ",
    })
    expect(ok.success && ok.data.body).toBe("اقتراح")
    expect(
      guestSuggestionSchema.safeParse({ target_kind: "general", suggestion_type: "comment", body: "‮ " })
        .success,
    ).toBe(false)
    expect(
      guestSuggestionSchema.safeParse({ target_kind: "general", suggestion_type: "comment", body: "x".repeat(1001) })
        .success,
    ).toBe(false)
    expect(
      guestSuggestionSchema.safeParse({ target_kind: "axis", target_ref: null, suggestion_type: "edit", body: "x" })
        .success,
    ).toBe(false)
    expect(
      guestSuggestionSchema.safeParse({ target_kind: "question", target_ref: "s1", suggestion_type: "edit", body: "x" })
        .success,
    ).toBe(false)
  })
  it("target is resolved against the published ref map, text copied server-side", () => {
    const refs = { axes: { a1: { section: "opening", label: "البداية والتعارف" } }, samples: {} }
    expect(resolveSuggestionTarget({ target_kind: "axis", target_ref: "a1" }, refs)).toEqual({
      ok: true,
      original_text: "البداية والتعارف",
    })
    expect(resolveSuggestionTarget({ target_kind: "axis", target_ref: "a9" }, refs)).toEqual({ ok: false })
    expect(resolveSuggestionTarget({ target_kind: "general", target_ref: null }, null)).toEqual({
      ok: true,
      original_text: null,
    })
  })
  it("rejection is invisible; acceptance shows once", () => {
    expect(ownSuggestionTag({ status: "new", guest_notified_at: null })).toBe("received")
    expect(ownSuggestionTag({ status: "rejected", guest_notified_at: null })).toBeNull()
    expect(ownSuggestionTag({ status: "accepted", guest_notified_at: null })).toBe("taken")
    expect(ownSuggestionTag({ status: "accepted", guest_notified_at: new Date() })).toBeNull()
  })
})

describe("map URL allowlist", () => {
  it.each([
    "https://maps.app.goo.gl/AbCd",
    "https://www.google.com/maps/place/x",
    "https://maps.google.com/?q=1",
    "https://maps.apple.com/?ll=29,47",
    "https://goo.gl/maps/xyz",
  ])("accepts %s", (u) => expect(validateMapUrl(u).ok).toBe(true))
  it.each([
    "http://maps.app.goo.gl/AbCd",
    "https://evil.com/maps",
    "https://www.google.com/search?q=x",
    "https://maps.app.goo.gl.evil.com/x",
    "javascript:alert(1)",
    "https://user:pw@maps.apple.com/",
  ])("rejects %s", (u) => expect(validateMapUrl(u).ok).toBe(false))
})

describe("staleness", () => {
  const published = new Date("2026-09-20T10:00:00Z")
  const base = {
    published_at: published,
    published_view: { v: 1, schedule_at: null, location: null, axes: [] },
    published_source_prep_id: "p1",
    published_source_prep_updated_at: new Date("2026-09-19T00:00:00Z"),
    published_schedule_at: null,
    location_updated_at: null,
  }
  const preview = { v: 1 as const, schedule_at: null, location: null, axes: [] }
  it("fresh", () => {
    expect(
      publishStaleness({ row: base, prepId: "p1", prepUpdatedAt: base.published_source_prep_updated_at, recordingAt: null, preview }),
    ).toEqual([])
  })
  it("prep, schedule, location", () => {
    expect(
      publishStaleness({
        row: { ...base, location_updated_at: new Date("2026-09-21T00:00:00Z") },
        prepId: "p1",
        prepUpdatedAt: new Date("2026-09-22T00:00:00Z"),
        recordingAt: new Date("2026-10-01T00:00:00Z"),
        preview,
      }),
    ).toEqual(["prep", "schedule", "location"])
  })
  it("never published ⇒ not stale", () => {
    expect(
      publishStaleness({ row: { ...base, published_at: null }, prepId: "x", prepUpdatedAt: new Date(), recordingAt: null, preview }),
    ).toEqual([])
  })
})

describe(".ics + Kuwait time", () => {
  it("generic summary, UTC stamps, escaped location", () => {
    const ics = buildRecordingIcs({
      uid: "link-1",
      start: new Date("2026-10-01T16:00:00Z"),
      address: "اليرموك, قطعة 1; شارع 2",
      mapUrl: "https://maps.apple.com/?q=x",
      now: new Date("2026-09-26T00:00:00Z"),
    })
    expect(ics).toContain("DTSTART:20261001T160000Z")
    expect(ics).toContain("DTEND:20261001T190000Z")
    expect(ics).toContain("SUMMARY:تصوير حلقة — بودكاست خط")
    expect(ics).toContain("LOCATION:اليرموك\\, قطعة 1\\; شارع 2")
  })
  it("formats in Asia/Kuwait regardless of server zone", () => {
    expect(formatKuwaitAppointment("2026-10-01T16:30:00Z")).toEqual({
      day: "الخميس",
      date: "1 أكتوبر 2026",
      time: "7:30 مساءً",
    })
    expect(formatKuwaitAppointment("2026-10-01T21:05:00Z")?.date).toBe("2 أكتوبر 2026")
    expect(formatKuwaitAppointment("2026-10-01T06:00:00Z")?.time).toBe("9:00 صباحاً")
    expect(formatKuwaitAppointment(null)).toBeNull()
  })
})
