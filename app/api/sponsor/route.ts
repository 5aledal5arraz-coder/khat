import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
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

    await pool!.query(
      `INSERT INTO sponsorship_leads (
        company_name, industry, contact_name, job_title, email, phone,
        collaboration_types, collaboration_other, main_goal,
        target_audience, preferred_timeline, budget_range,
        additional_info, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        stripHtml(company_name),
        stripHtml(industry),
        stripHtml(contact_name),
        stripHtml(job_title),
        email.toLowerCase().trim(),
        stripHtml(phone),
        sanitizedCollabTypes,
        collaboration_other ? stripHtml(collaboration_other) : null,
        stripHtml(main_goal),
        stripHtml(target_audience),
        preferred_timeline ? stripHtml(preferred_timeline) : null,
        stripHtml(budget_range),
        additional_info ? stripHtml(additional_info) : null,
        "new",
      ]
    )

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
      { status: 500 }
    )
  }
}
