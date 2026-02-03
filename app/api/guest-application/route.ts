import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, topic, links, bio } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "الاسم مطلوب" },
        { status: 400 }
      )
    }

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

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return NextResponse.json(
        { error: "الموضوع المقترح مطلوب" },
        { status: 400 }
      )
    }

    if (!bio || typeof bio !== "string" || bio.trim().length === 0) {
      return NextResponse.json(
        { error: "النبذة الشخصية مطلوبة" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { error } = await supabase.from("guest_applications").insert({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      topic: topic.trim(),
      links: links?.trim() || null,
      bio: bio.trim(),
    })

    if (error) {
      console.error("Guest application error:", error)
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
