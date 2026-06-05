import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { newsletterSubscribers } from "@/lib/db/schema"
import { validateEmail } from "@/lib/validation/forms"
import { validateMutation } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { sendNewsletterWelcome } from "@/lib/email/send"
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

    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      return NextResponse.json(
        { error: emailCheck.error },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()
    const unsubToken = crypto.randomBytes(16).toString("hex")

    try {
      await db!.insert(newsletterSubscribers)
        .values({ email: normalizedEmail, unsubscribe_token: unsubToken })
    } catch (dbError: unknown) {
      const pgErr = dbError as Record<string, unknown> | undefined
      const pgCode = pgErr?.code || (pgErr?.cause as Record<string, unknown> | undefined)?.code
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

    // Send welcome email (fire-and-forget — don't block the response)
    const unsubscribeUrl = `${APP_URL}/api/unsubscribe/newsletter?token=${unsubToken}`
    sendNewsletterWelcome(normalizedEmail, unsubscribeUrl).catch((err) => {
      console.error("Failed to send newsletter welcome email:", err)
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
      { status: 500 }
    )
  }
}
