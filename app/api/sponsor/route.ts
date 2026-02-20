import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sponsorshipLeads } from "@/lib/db/schema"
import { stripHtml } from "@/lib/sanitize"
import { validateEmail } from "@/lib/validation"
import { checkIpRateLimit } from "@/lib/rate-limit"

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 submissions per hour per IP
    const rl = checkIpRateLimit(request, "sponsor_submit", 3, 60 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "لقد أرسلت عدة طلبات. يرجى المحاولة لاحقًا." },
        { status: 429 }
      )
    }

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
    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      return NextResponse.json({ error: emailCheck.error }, { status: 400 })
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
    if (!Array.isArray(collaboration_types) || collaboration_types.length === 0) {
      return NextResponse.json({ error: "يرجى اختيار نوع تعاون واحد على الأقل" }, { status: 400 })
    }
    if (phone.trim().length < 8) {
      return NextResponse.json({ error: "رقم الهاتف قصير جدًا" }, { status: 400 })
    }

    // Sanitize collaboration_types array entries
    const sanitizedCollabTypes = collaboration_types
      .filter((t: unknown): t is string => typeof t === 'string')
      .map((t: string) => stripHtml(t))
      .slice(0, 10)

    await db!.insert(sponsorshipLeads).values({
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

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
      { status: 500 }
    )
  }
}
