import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sponsorshipLeads } from "@/lib/db/schema"
import { stripHtml } from "@/lib/sanitize"
import { validateEmail } from "@/lib/validation/forms"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { validateMutation } from "@/lib/api-utils"
import { sendSponsorApplicationAdmin, sendSponsorApplicationConfirm } from "@/lib/email/send"
import { autoTriageLead } from "@/lib/partnership-triage"
import { partnershipRef } from "@/lib/partnership-ref"
import { logActivity } from "@/lib/partnership-crm"

export async function POST(request: NextRequest) {
  try {
    // CSRF protection
    const csrfError = validateMutation(request)
    if (csrfError) return csrfError

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
      company_website,
      contact_name,
      job_title,
      email,
      phone,
      collaboration_types,
      collaboration_other,
      main_goal,
      target_audience,
      brand_values,
      campaign_goals,
      expectations,
      previous_partnerships,
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

    const sanitizedCompany = stripHtml(company_name)
    const sanitizedContact = stripHtml(contact_name)
    const sanitizedEmail = email.toLowerCase().trim()

    if (!db) {
      return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 })
    }

    // Optional URL — keep only a plausibly-valid http(s) value, else null.
    const cleanWebsite = (() => {
      if (typeof company_website !== "string") return null
      const v = stripHtml(company_website).trim()
      if (!v) return null
      return /^https?:\/\//i.test(v) ? v : `https://${v}`
    })()
    const optText = (v: unknown) =>
      typeof v === "string" && v.trim().length > 0 ? stripHtml(v) : null

    const [inserted] = await db.insert(sponsorshipLeads).values({
      company_name: sanitizedCompany,
      industry: stripHtml(industry),
      company_website: cleanWebsite,
      contact_name: sanitizedContact,
      job_title: stripHtml(job_title),
      email: sanitizedEmail,
      phone: stripHtml(phone),
      collaboration_types: sanitizedCollabTypes,
      collaboration_other: collaboration_other ? stripHtml(collaboration_other) : null,
      main_goal: stripHtml(main_goal),
      target_audience: stripHtml(target_audience),
      brand_values: optText(brand_values),
      campaign_goals: optText(campaign_goals),
      expectations: optText(expectations),
      previous_partnerships: optText(previous_partnerships),
      preferred_timeline: preferred_timeline ? stripHtml(preferred_timeline) : null,
      budget_range: stripHtml(budget_range),
      additional_info: additional_info ? stripHtml(additional_info) : null,
      status: "new",
    }).returning({ id: sponsorshipLeads.id })

    const reference = partnershipRef(inserted.id)

    // Send branded notification emails (fire-and-forget)
    const emailParams = { company: sanitizedCompany, contact: sanitizedContact, email: sanitizedEmail, budget: stripHtml(budget_range), reference }
    Promise.all([
      sendSponsorApplicationAdmin(process.env.ADMIN_NOTIFY_EMAIL || "khatpodcast@hotmail.com", emailParams),
      sendSponsorApplicationConfirm(sanitizedEmail, sanitizedContact, reference),
    ]).catch(e => console.error("Sponsor notification email failed:", e))

    // Open the relationship timeline with the inbound application.
    void logActivity(inserted.id, {
      type: "lead_created",
      summary: `وصل طلب شراكة جديد من ${sanitizedCompany}`,
      actor: "public",
      metadata: { reference, budget_range: stripHtml(budget_range) },
    })

    // Auto-triage: run the full AI evaluation in the background so the operator
    // opens a PRE-EVALUATED lead. Fire-and-forget — never blocks the applicant.
    void autoTriageLead(inserted.id)

    return NextResponse.json({ success: true, reference })
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
      { status: 500 }
    )
  }
}
