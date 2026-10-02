import { NextRequest, NextResponse } from "next/server"
import { validateMutation, rateLimitResponse } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import {
  CONTACT_LIMITS,
  isContactHoneypotFilled,
  validateContactMessage,
} from "@/lib/validation/contact"
import {
  countContactMessagesSince,
  createContactMessage,
  setContactEmailStatus,
} from "@/lib/contact/messages"
import { enqueueJob } from "@/lib/jobs/queue"
import {
  SUBMISSION_NOTIFY_JOB,
  NOTIFY_ENQUEUE_OPTIONS,
  type ContactMessagePayload,
} from "@/lib/jobs/submission-notify-jobs"

/**
 * «تواصل معنا» — store the message, then queue the team notification.
 *
 * Until 2026-10-02 /contact had no form at all, only a `mailto:` link: nothing
 * reached the admin, and a visitor without a configured mail client could not
 * write to us. Now: CSRF (`validateMutation`), per-IP rate limit, a honeypot,
 * server-side validation, the row FIRST (the inbox never depends on Resend),
 * then the notification on the job queue — a public route never sends mail
 * inline (tests/email/reply-to-on-every-send.test.ts).
 */
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateMutation(request)
    if (csrfError) return csrfError

    // Two limits: a loose one on EVERY attempt (abuse), and the strict 5/h
    // only on ACCEPTED messages — so a person fixing a typo'd email address
    // is not locked out by their own validation errors.
    if (
      !checkIpRateLimit(request, "contact_attempt", CONTACT_LIMITS.ATTEMPTS_PER_HOUR, CONTACT_LIMITS.WINDOW_MS)
        .allowed
    ) {
      return rateLimitResponse()
    }

    const body = await request.json().catch(() => ({}))

    // A filled honeypot is a bot. Answer exactly like a success so it learns
    // nothing, and store nothing.
    if (isContactHoneypotFilled(body)) return NextResponse.json({ success: true })

    const v = validateContactMessage(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    if (
      !checkIpRateLimit(request, "contact_message", CONTACT_LIMITS.PER_HOUR, CONTACT_LIMITS.WINDOW_MS)
        .allowed
    ) {
      return rateLimitResponse()
    }

    // Stored RAW. React escapes on render and the email template escapes with
    // escapeHtml — stripping here only mangled honest text like «a<b & c».
    const id = await createContactMessage(v.data)

    // Global hourly cap on team emails (a flood across many IPs passes every
    // per-IP limit). Over it, the message is still stored — the inbox has it —
    // but nothing is mailed, and the row says why.
    const lastHour = await countContactMessagesSince(new Date(Date.now() - CONTACT_LIMITS.WINDOW_MS))
    if (lastHour > CONTACT_LIMITS.EMAILS_PER_HOUR) {
      await setContactEmailStatus(
        id,
        "failed",
        `تجاوز سقف الإيميلات بالساعة (${CONTACT_LIMITS.EMAILS_PER_HOUR})`,
      ).catch(() => {})
      return NextResponse.json({ success: true })
    }

    try {
      await enqueueJob(
        SUBMISSION_NOTIFY_JOB,
        { kind: "contact_message", reference: id } satisfies ContactMessagePayload,
        NOTIFY_ENQUEUE_OPTIONS,
      )
    } catch (e) {
      // The message is safe in the inbox; the row says the team was NOT told.
      console.error("[contact] could not enqueue the notification job:", e)
      await setContactEmailStatus(id, "failed", "تعذّرت جدولة إشعار البريد").catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[contact] failed:", e)
    return NextResponse.json({ error: "حدث خطأ. يرجى المحاولة مرة أخرى." }, { status: 500 })
  }
}
