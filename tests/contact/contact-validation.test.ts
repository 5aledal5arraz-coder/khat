import { describe, it, expect } from "vitest"
import {
  CONTACT_LIMITS,
  isContactHoneypotFilled,
  validateContactMessage,
} from "@/lib/validation/contact"

const ok = { name: "خالد", email: "Khaled@Example.com ", message: "عندي سؤال عن الحلقة الأخيرة" }

describe("validateContactMessage", () => {
  it("accepts a valid message and normalises it", () => {
    const r = validateContactMessage(ok)
    expect(r).toEqual({ ok: true, data: { name: "خالد", email: "khaled@example.com", message: ok.message } })
  })
  it.each([
    [{ ...ok, name: " " }, "الاسم مطلوب"],
    [{ ...ok, email: "not-an-email" }, "البريد الإلكتروني غير صالح"],
    [{ ...ok, message: "قصير" }, /قصيرة/],
    [{ ...ok, message: "x".repeat(CONTACT_LIMITS.MESSAGE_MAX + 1) }, /لا تتجاوز/],
    [{ ...ok, name: "x".repeat(CONTACT_LIMITS.NAME_MAX + 1) }, /لا يتجاوز/],
    [null, "الاسم مطلوب"],
    [{ name: 5, email: [], message: {} }, "الاسم مطلوب"],
    [{ ...ok, name: "خالد\u0000" }, /رموز غير مسموحة/],
    [{ ...ok, name: "خالد\nBcc: x@y.z" }, /رموز غير مسموحة/],
    [{ ...ok, name: "خالد\u007F" }, /رموز غير مسموحة/],
  ])("rejects %#", (body, err) => {
    const r = validateContactMessage(body)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(err)
  })
})

it("keeps HTML-ish text raw (escaping is the renderer's job)", () => {
  const r = validateContactMessage({ ...ok, name: "a<b & c", message: "a<b & c ليس وسمًا" })
  expect(r.ok && r.data.name).toBe("a<b & c")
  expect(r.ok && r.data.message).toBe("a<b & c ليس وسمًا")
})

describe("honeypot", () => {
  it("empty or absent ⇒ human", () => {
    expect(isContactHoneypotFilled(ok)).toBe(false)
    expect(isContactHoneypotFilled({ ...ok, website: "  " })).toBe(false)
    expect(isContactHoneypotFilled(null)).toBe(false)
  })
  it("filled ⇒ bot", () => {
    expect(isContactHoneypotFilled({ ...ok, website: "http://spam.example" })).toBe(true)
  })
})
