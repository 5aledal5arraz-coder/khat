/**
 * «نسخة الضيف» — validation for everything a guest can send.
 *
 * Every schema is STRICT (unknown keys reject) and every string is capped and
 * passed through `sanitizeGuestText` before it can reach the DB. The same
 * limits are stated to the guest by the form, so they live here once.
 */

import { z } from "zod"

/** Hard cap on any guest POST body, checked before JSON.parse. */
export const GUEST_LINK_MAX_BODY_BYTES = 16 * 1024

/** Suggestion text limits — mirrored by the DB CHECK (1–1000). */
export const GUEST_SUGGESTION_LIMITS = {
  MIN_CHARS: 1,
  MAX_CHARS: 1000,
  /** Pending (status = new) suggestions allowed per link. */
  MAX_PENDING_PER_LINK: 50,
} as const

export const GUEST_FIELD_MAX = {
  full_name: 120,
  honorific: 40,
  kunya: 60,
  pronunciation_notes: 200,
  phone_whatsapp: 32,
  preferred_drink: 120,
  scheduling_restrictions: 1000,
  technical_needs: 1000,
  topics_excited_about: 2000,
  sensitivities_to_avoid: 2000,
  team_notes: 2000,
  social: 200,
} as const

export const FILMING_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const

export const FILMING_TIMES = ["morning", "afternoon", "evening"] as const

export const QUESTIONNAIRE_STEPS = 4

// Bidi overrides/embeddings/isolates (U+202A–202E, U+2066–2069): they let a
// string render in a different order than it is stored — the classic way to
// make a filename or a sentence read as something else. Arabic text never
// needs them; the browser's own bidi algorithm handles RTL/LTR mixing.
const BIDI_CONTROL = /[‪-‮⁦-⁩]/g
// C0/C1 control characters except TAB and LF.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g

/**
 * Plain-text normaliser for anything a guest types: NFC, CR→LF, strip control
 * and bidi-override characters, collapse runs of blank lines, trim. The result
 * is rendered as TEXT (React escapes it) — never as HTML.
 */
export function sanitizeGuestText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(BIDI_CONTROL, "")
    .replace(CONTROL, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** A sanitized string capped at `max` characters (after sanitising). */
function text(max: number) {
  return z
    .string()
    .max(max * 2)
    .transform(sanitizeGuestText)
    .pipe(z.string().max(max, { message: `النص أطول من ${max} حرف` }))
}

/** Optional text: empty → null. */
function optionalText(max: number) {
  return text(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
}

const PHONE = /^[+\d][\d\s()-]{5,30}$/

const socialSchema = z
  .object({
    instagram: text(GUEST_FIELD_MAX.social).optional(),
    twitter: text(GUEST_FIELD_MAX.social).optional(),
    linkedin: text(GUEST_FIELD_MAX.social).optional(),
    youtube: text(GUEST_FIELD_MAX.social).optional(),
    tiktok: text(GUEST_FIELD_MAX.social).optional(),
    website: text(GUEST_FIELD_MAX.social).optional(),
  })
  .strict()

/** Full submission — required fields enforced, messages next to the field. */
export const guestQuestionnaireSubmitSchema = z
  .object({
    full_name: text(GUEST_FIELD_MAX.full_name).pipe(
      z.string().min(2, { message: "اكتب اسمك الكامل" }),
    ),
    honorific: optionalText(GUEST_FIELD_MAX.honorific),
    kunya: optionalText(GUEST_FIELD_MAX.kunya),
    pronunciation_notes: optionalText(GUEST_FIELD_MAX.pronunciation_notes),
    phone_whatsapp: text(GUEST_FIELD_MAX.phone_whatsapp).pipe(
      z.string().regex(PHONE, { message: "اكتب رقم واتساب صحيح" }),
    ),
    preferred_drink: text(GUEST_FIELD_MAX.preferred_drink).pipe(
      z.string().min(1, { message: "قول لنا شنو تحب تشرب" }),
    ),
    preferred_filming_days: z
      .array(z.enum(FILMING_DAYS))
      .min(1, { message: "اختر يوماً واحداً على الأقل" })
      .max(FILMING_DAYS.length)
      .transform((d) => Array.from(new Set(d))),
    preferred_filming_time: z.enum(FILMING_TIMES, { message: "اختر الوقت اللي يناسبك" }),
    scheduling_restrictions: optionalText(GUEST_FIELD_MAX.scheduling_restrictions),
    technical_needs: optionalText(GUEST_FIELD_MAX.technical_needs),
    topics_excited_about: text(GUEST_FIELD_MAX.topics_excited_about).pipe(
      z.string().min(2, { message: "قول لنا شنو يحمّسك نتكلم فيه" }),
    ),
    sensitivities_to_avoid: optionalText(GUEST_FIELD_MAX.sensitivities_to_avoid),
    social_accounts: socialSchema.default({}),
    team_notes: optionalText(GUEST_FIELD_MAX.team_notes),
    arrival_confirmation: z.literal(true, { message: "أكّد لنا الحضور قبل الموعد" }),
    clothing_acknowledgment: z.boolean().default(false),
  })
  .strict()

export type GuestQuestionnaireSubmitInput = z.input<typeof guestQuestionnaireSubmitSchema>

/**
 * Draft autosave — same fields and caps, nothing required, and lenient on
 * shape errors a half-typed form produces (a bad phone is saved as typed).
 */
export const guestQuestionnaireDraftSchema = z
  .object({
    step: z.number().int().min(0).max(QUESTIONNAIRE_STEPS - 1),
    draft: z
      .object({
        full_name: optionalText(GUEST_FIELD_MAX.full_name),
        honorific: optionalText(GUEST_FIELD_MAX.honorific),
        kunya: optionalText(GUEST_FIELD_MAX.kunya),
        pronunciation_notes: optionalText(GUEST_FIELD_MAX.pronunciation_notes),
        phone_whatsapp: optionalText(GUEST_FIELD_MAX.phone_whatsapp),
        preferred_drink: optionalText(GUEST_FIELD_MAX.preferred_drink),
        preferred_filming_days: z.array(z.enum(FILMING_DAYS)).max(FILMING_DAYS.length).optional(),
        preferred_filming_time: z.enum(FILMING_TIMES).nullable().optional(),
        scheduling_restrictions: optionalText(GUEST_FIELD_MAX.scheduling_restrictions),
        technical_needs: optionalText(GUEST_FIELD_MAX.technical_needs),
        topics_excited_about: optionalText(GUEST_FIELD_MAX.topics_excited_about),
        sensitivities_to_avoid: optionalText(GUEST_FIELD_MAX.sensitivities_to_avoid),
        social_accounts: socialSchema.optional(),
        team_notes: optionalText(GUEST_FIELD_MAX.team_notes),
        arrival_confirmation: z.boolean().optional(),
        clothing_acknowledgment: z.boolean().optional(),
      })
      .strict(),
  })
  .strict()

/** A guest suggestion. `target_ref` is an opaque ref from the snapshot. */
export const guestSuggestionSchema = z
  .object({
    target_kind: z.enum(["axis", "general"]),
    target_ref: z
      .string()
      .regex(/^a\d{1,2}$/)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    suggestion_type: z.enum(["edit", "comment", "new_question"]),
    body: z
      .string()
      .max(GUEST_SUGGESTION_LIMITS.MAX_CHARS * 2)
      .transform(sanitizeGuestText)
      .pipe(
        z
          .string()
          .min(GUEST_SUGGESTION_LIMITS.MIN_CHARS, { message: "اكتب اقتراحك" })
          .max(GUEST_SUGGESTION_LIMITS.MAX_CHARS, {
            message: `الاقتراح أطول من ${GUEST_SUGGESTION_LIMITS.MAX_CHARS} حرف`,
          }),
      ),
  })
  .strict()
  .refine((v) => (v.target_kind === "axis") === (v.target_ref !== null), {
    message: "مرجع الاقتراح غير صالح",
    path: ["target_ref"],
  })

export type GuestSuggestionInput = z.output<typeof guestSuggestionSchema>

/** First issue per top-level field → Arabic message, for errors next to fields. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_")
    if (!out[key]) out[key] = issue.message
  }
  return out
}

// ─── Admin-side: map URL allowlist ──────────────────────────────────────

/**
 * Hosts a map link may point to. The guest taps this link, so an arbitrary
 * URL here would be a phishing hop wearing our page. https only.
 */
export const MAP_URL_HOSTS = new Set([
  "maps.google.com",
  "www.google.com",
  "google.com",
  "goo.gl",
  "maps.app.goo.gl",
  "maps.apple.com",
])

export function validateMapUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return { ok: false, error: "رابط الخريطة غير صالح" }
  }
  if (u.protocol !== "https:") return { ok: false, error: "رابط الخريطة لازم يبدأ بـ https" }
  if (u.username || u.password) return { ok: false, error: "رابط الخريطة غير صالح" }
  const host = u.hostname.toLowerCase()
  if (!MAP_URL_HOSTS.has(host)) {
    return { ok: false, error: "نقبل روابط Google Maps أو Apple Maps فقط" }
  }
  // google.com / www.google.com only under /maps; goo.gl only /maps short links.
  if ((host === "www.google.com" || host === "google.com") && !u.pathname.startsWith("/maps")) {
    return { ok: false, error: "نقبل روابط Google Maps أو Apple Maps فقط" }
  }
  if (host === "goo.gl" && !u.pathname.startsWith("/maps")) {
    return { ok: false, error: "نقبل روابط Google Maps أو Apple Maps فقط" }
  }
  return { ok: true, url: u.toString() }
}

/** Admin location form. */
export const guestLinkLocationSchema = z
  .object({
    location_label: z.string().max(120).transform(sanitizeGuestText),
    address: z.string().max(500).transform(sanitizeGuestText),
    map_url: z.string().max(1000).transform((v) => v.trim()),
    show_schedule: z.boolean(),
  })
  .strict()

/** Admin curation of one sample question. */
export const sampleOverrideSchema = z
  .object({
    hidden: z.boolean().optional(),
    pinned: z.boolean().optional(),
    text: z.string().max(300).transform(sanitizeGuestText).optional(),
  })
  .strict()
