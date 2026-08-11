import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { newsletterSubscribers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { validateEmail } from "@/lib/validation/forms"
import { validateMutation } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { enqueueJob } from "@/lib/jobs/queue"
import {
  SUBMISSION_NOTIFY_JOB,
  NOTIFY_ENQUEUE_OPTIONS,
  type NewsletterWelcomePayload,
} from "@/lib/jobs/submission-notify-jobs"
import { APP_URL } from "@/lib/email/resend"
import crypto from "crypto"

export async function POST(request: NextRequest) {
  try {
    // CSRF protection
    const csrfError = validateMutation(request)
    if (csrfError) return csrfError

    // Rate limit: 5 subscriptions per hour per IP
    const rl = checkIpRateLimit(request, "newsletter_subscribe", 5, 60 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "لقد أرسلت عدة طلبات. يرجى المحاولة لاحقًا." },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { email } = body

    // Honeypot — a filled "website" field means a bot. Pretend success so it
    // moves on, but never create a subscriber.
    if (typeof body.website === "string" && body.website.trim().length > 0) {
      return NextResponse.json({ success: true })
    }

    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      return NextResponse.json(
        { error: emailCheck.error },
        { status: 400 }
      )
    }

    if (!db) {
      return NextResponse.json(
        { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
        { status: 500 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()
    const unsubToken = crypto.randomBytes(16).toString("hex")

    try {
      // Reactivate a previously-unsubscribed address; create a fresh row
      // otherwise. A plain insert would hit the unique-email constraint and
      // wrongly reject anyone who had unsubscribed and wants back in.
      const [existing] = await db
        .select({ id: newsletterSubscribers.id, status: newsletterSubscribers.status })
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.email, normalizedEmail))
        .limit(1)

      if (existing) {
        if (existing.status === "active") {
          return NextResponse.json(
            { error: "البريد الإلكتروني مسجل بالفعل", duplicate: true },
            { status: 409 }
          )
        }
        if (existing.status === "bounced" || existing.status === "complained") {
          // Suppressed for deliverability/legal reasons (hard bounce or spam
          // complaint). Never silently re-enable — re-mailing a dead/complaining
          // address damages sender reputation. Route them to support instead.
          return NextResponse.json(
            { error: "تعذّر تفعيل الاشتراك بهذا البريد الإلكتروني. للمساعدة، يرجى التواصل معنا.", suppressed: true },
            { status: 409 }
          )
        }
        // Previously unsubscribed → a deliberate user reversal, safe to restore.
        await db
          .update(newsletterSubscribers)
          .set({ status: "active", unsubscribe_token: unsubToken, unsubscribed_at: null })
          .where(eq(newsletterSubscribers.id, existing.id))
      } else {
        await db
          .insert(newsletterSubscribers)
          .values({ email: normalizedEmail, unsubscribe_token: unsubToken, status: "active" })
      }
    } catch (dbError: unknown) {
      const pgErr = dbError as Record<string, unknown> | undefined
      const pgCode = pgErr?.code || (pgErr?.cause as Record<string, unknown> | undefined)?.code
      // Lost the race to a concurrent insert of the same email → treat as a
      // duplicate rather than a 500.
      if (pgCode === "23505") {
        return NextResponse.json(
          { error: "البريد الإلكتروني مسجل بالفعل", duplicate: true },
          { status: 409 }
        )
      }
      console.error("Newsletter subscription error:", dbError)
      return NextResponse.json(
        { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
        { status: 500 }
      )
    }

    // Queued, so a failed welcome is a retryable job row rather than a log line
    // nobody reads. The unsubscribe token is unique per subscriber, which makes
    // it a safe idempotency seed for the retry.
    const unsubscribeUrl = `${APP_URL}/api/unsubscribe/newsletter?token=${unsubToken}`
    void enqueueJob(SUBMISSION_NOTIFY_JOB, {
      kind: "newsletter_welcome",
      reference: unsubToken,
      email: normalizedEmail,
      unsubscribeUrl,
    } satisfies NewsletterWelcomePayload, NOTIFY_ENQUEUE_OPTIONS).catch((err) =>
      console.error("[newsletter] could not enqueue the welcome job:", err),
    )

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
      { status: 500 }
    )
  }
}
