/**
 * The public «تواصل معنا» form (/contact → POST /api/contact).
 *
 * One source for the limits: the route ENFORCES them and the form STATES them,
 * so the two cannot drift (same rule as QUESTION_LIMITS in ./forms).
 */
import { validateEmail } from "./forms"

export const CONTACT_LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 80,
  MESSAGE_MIN: 10,
  MESSAGE_MAX: 4000,
  /** ACCEPTED messages allowed per IP per window (enforced by `checkIpRateLimit`). */
  PER_HOUR: 5,
  /** All attempts per IP per window, valid or not — looser, so typos don't lock a person out. */
  ATTEMPTS_PER_HOUR: 30,
  /** Team emails per hour across ALL senders; past it the message is stored, not mailed. */
  EMAILS_PER_HOUR: 20,
  WINDOW_MS: 3_600_000,
} as const

/**
 * The honeypot field. Hidden from people (off-screen, `aria-hidden`,
 * `tabIndex={-1}`, `autoComplete="off"`), filled in by naive bots that fill
 * every input. Named like a real field so a bot wants to fill it.
 */
export const CONTACT_HONEYPOT_FIELD = "website"

export type ContactInput = { name: string; email: string; message: string }

export type ContactValidation =
  | { ok: true; data: ContactInput }
  | { ok: false; error: string }

/** True when the hidden honeypot carries anything — treat as a bot. */
export function isContactHoneypotFilled(body: unknown): boolean {
  if (!body || typeof body !== "object") return false
  const v = (body as Record<string, unknown>)[CONTACT_HONEYPOT_FIELD]
  return typeof v === "string" && v.trim().length > 0
}

export function validateContactMessage(body: unknown): ContactValidation {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const name = typeof b.name === "string" ? b.name.trim() : ""
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : ""
  const message = typeof b.message === "string" ? b.message.trim() : ""

  if (name.length < CONTACT_LIMITS.NAME_MIN) return { ok: false, error: "الاسم مطلوب" }
  // The name lands in an email subject line — a newline there is a header
  // injection attempt, and no real name contains a control character.
  if (/[\x00-\x1F\x7F]/.test(name)) return { ok: false, error: "الاسم يحتوي على رموز غير مسموحة" }
  if (name.length > CONTACT_LIMITS.NAME_MAX) {
    return { ok: false, error: `الاسم يجب ألا يتجاوز ${CONTACT_LIMITS.NAME_MAX} حرف` }
  }
  const emailCheck = validateEmail(email)
  if (!emailCheck.valid) return { ok: false, error: emailCheck.error ?? "البريد الإلكتروني غير صالح" }
  if (message.length < CONTACT_LIMITS.MESSAGE_MIN) {
    return { ok: false, error: `الرسالة قصيرة — ${CONTACT_LIMITS.MESSAGE_MIN} أحرف على الأقل` }
  }
  if (message.length > CONTACT_LIMITS.MESSAGE_MAX) {
    return { ok: false, error: `الرسالة يجب ألا تتجاوز ${CONTACT_LIMITS.MESSAGE_MAX} حرف` }
  }
  return { ok: true, data: { name, email, message } }
}
