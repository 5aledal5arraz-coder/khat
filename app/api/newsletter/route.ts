import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { validateEmail } from "@/lib/validation"

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

    try {
      await pool!.query(
        `INSERT INTO newsletter_subscribers (email) VALUES ($1)`,
        [email.toLowerCase().trim()]
      )
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

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
      { status: 500 }
    )
  }
}
