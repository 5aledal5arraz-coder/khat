import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { validateEmail } from "@/lib/validation"
import { sendNewsletterWelcome } from "@/lib/email/send"
import { APP_URL } from "@/lib/email/resend"

export async function POST(request: NextRequest) {
  try {
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

    let unsubscribeToken: string | null = null
    try {
      const rows = await db!.execute(sql`
        INSERT INTO newsletter_subscribers (email, unsubscribe_token)
        VALUES (${normalizedEmail}, encode(gen_random_bytes(16), 'hex'))
        RETURNING unsubscribe_token
      `)
      unsubscribeToken = (rows as unknown as { unsubscribe_token: string }[])[0]?.unsubscribe_token
    } catch (dbError: any) {
      if (dbError?.code === "23505") {
        return NextResponse.json(
          { error: "البريد الإلكتروني مسجل بالفعل" },
          { status: 400 }
        )
      }
      console.error("Newsletter subscription error:", dbError)
      return NextResponse.json(
        { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
        { status: 500 }
      )
    }

    // Send welcome email (fire-and-forget — don't block the response)
    if (unsubscribeToken) {
      const unsubscribeUrl = `${APP_URL}/api/unsubscribe/newsletter?token=${unsubscribeToken}`
      sendNewsletterWelcome(normalizedEmail, unsubscribeUrl).catch((err) => {
        console.error("Failed to send newsletter welcome email:", err)
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
      { status: 500 }
    )
  }
}
