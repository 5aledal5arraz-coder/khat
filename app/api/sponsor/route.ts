import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stripHtml } from "@/lib/sanitize"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      company_name,
      industry,
      contact_name,
      job_title,
      email,
      phone,
      collaboration_types,
      collaboration_other,
      main_goal,
      target_audience,
      preferred_timeline,
      budget_range,
      additional_info,
    } = body

    // Validate required fields
    if (!company_name || typeof company_name !== "string" || company_name.trim().length === 0) {
      return NextResponse.json({ error: "اسم الشركة مطلوب" }, { status: 400 })
    }
    if (!industry || typeof industry !== "string" || industry.trim().length === 0) {
      return NextResponse.json({ error: "المجال مطلوب" }, { status: 400 })
    }
    if (!contact_name || typeof contact_name !== "string" || contact_name.trim().length === 0) {
      return NextResponse.json({ error: "اسم المسؤول مطلوب" }, { status: 400 })
    }
    if (!job_title || typeof job_title !== "string" || job_title.trim().length === 0) {
      return NextResponse.json({ error: "المسمى الوظيفي مطلوب" }, { status: 400 })
    }
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "البريد الإلكتروني مطلوب" }, { status: 400 })
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "البريد الإلكتروني غير صالح" }, { status: 400 })
    }
    if (!phone || typeof phone !== "string" || phone.trim().length === 0) {
      return NextResponse.json({ error: "رقم الهاتف مطلوب" }, { status: 400 })
    }
    if (!main_goal || typeof main_goal !== "string") {
      return NextResponse.json({ error: "الهدف الرئيسي مطلوب" }, { status: 400 })
    }
    if (!target_audience || typeof target_audience !== "string" || target_audience.trim().length === 0) {
      return NextResponse.json({ error: "الجمهور المستهدف مطلوب" }, { status: 400 })
    }
    if (!budget_range || typeof budget_range !== "string") {
      return NextResponse.json({ error: "نطاق الميزانية مطلوب" }, { status: 400 })
    }
    if (!Array.isArray(collaboration_types)) {
      return NextResponse.json({ error: "أنواع التعاون غير صالحة" }, { status: 400 })
    }

    // Sanitize collaboration_types array entries
    const sanitizedCollabTypes = collaboration_types
      .filter((t: unknown): t is string => typeof t === 'string')
      .map((t: string) => stripHtml(t))
      .slice(0, 10)

    const supabase = await createClient()

    const { error } = await supabase.from("sponsorship_leads").insert({
      company_name: stripHtml(company_name),
      industry: stripHtml(industry),
      contact_name: stripHtml(contact_name),
      job_title: stripHtml(job_title),
      email: email.toLowerCase().trim(),
      phone: stripHtml(phone),
      collaboration_types: sanitizedCollabTypes,
      collaboration_other: collaboration_other ? stripHtml(collaboration_other) : null,
      main_goal: stripHtml(main_goal),
      target_audience: stripHtml(target_audience),
      preferred_timeline: preferred_timeline ? stripHtml(preferred_timeline) : null,
      budget_range: stripHtml(budget_range),
      additional_info: additional_info ? stripHtml(additional_info) : null,
      status: "new",
    })

    if (error) {
      console.error("Sponsorship lead error:", error)
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
