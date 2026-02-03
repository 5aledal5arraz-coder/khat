import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "البريد الإلكتروني مطلوب" },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "البريد الإلكتروني غير صالح" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from("newsletter_subscribers")
      .insert({ email: email.toLowerCase().trim() })

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "البريد الإلكتروني مسجل بالفعل" },
          { status: 400 }
        )
      }
      console.error("Newsletter subscription error:", error)
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
