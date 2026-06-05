import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guestApplications } from "@/lib/db/schema"
import { stripHtml } from "@/lib/sanitize"
import { validateEmail } from "@/lib/validation/forms"
import { validateMutation, rateLimitResponse } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { sendGuestApplicationAdmin, sendGuestApplicationConfirm } from "@/lib/email/send"

export async function POST(request: NextRequest) {
  try {
    // CSRF protection
    const csrfError = validateMutation(request)
    if (csrfError) return csrfError

    // Rate limit: 5 submissions per hour per IP
    const rateLimit = checkIpRateLimit(request, "guest_application", 5, 60 * 60 * 1000)
    if (!rateLimit.allowed) return rateLimitResponse()

    const body = await request.json()
    const {
      name,
      email,
      phone,
      country,
      can_travel_to_kuwait,
      story_idea,
      beyond_job_title,
      life_changing_moment,
      hope_people_understand,
      unasked_question,
      why_khat,
      previous_podcast,
      previous_podcast_info,
      prefer_dialogue_or_story,
      topics_to_avoid,
      filming_concern,
      agrees_to_publish,
      social_links,
    } = body

    // Step 1 validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 })
    }

    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      return NextResponse.json(
        { error: emailCheck.error },
        { status: 400 }
      )
    }

    if (!phone || typeof phone !== "string" || phone.trim().length === 0) {
      return NextResponse.json(
        { error: "رقم الهاتف مطلوب" },
        { status: 400 }
      )
    }

    if (
      !country ||
      typeof country !== "string" ||
      country.trim().length === 0
    ) {
      return NextResponse.json({ error: "الدولة مطلوبة" }, { status: 400 })
    }

    // Step 2 validation
    if (
      !story_idea ||
      typeof story_idea !== "string" ||
      story_idea.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "القصة أو الفكرة مطلوبة" },
        { status: 400 }
      )
    }

    if (
      !beyond_job_title ||
      typeof beyond_job_title !== "string" ||
      beyond_job_title.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "النبذة الشخصية مطلوبة" },
        { status: 400 }
      )
    }

    if (
      !life_changing_moment ||
      typeof life_changing_moment !== "string" ||
      life_changing_moment.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "اللحظة المؤثرة مطلوبة" },
        { status: 400 }
      )
    }

    if (
      !hope_people_understand ||
      typeof hope_people_understand !== "string" ||
      hope_people_understand.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "هذا الحقل مطلوب" },
        { status: 400 }
      )
    }

    if (
      !unasked_question ||
      typeof unasked_question !== "string" ||
      unasked_question.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "هذا الحقل مطلوب" },
        { status: 400 }
      )
    }

    if (
      !why_khat ||
      typeof why_khat !== "string" ||
      why_khat.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "سبب اختيار بودكاست خط مطلوب" },
        { status: 400 }
      )
    }

    // Step 3 validation
    if (
      !prefer_dialogue_or_story ||
      typeof prefer_dialogue_or_story !== "string" ||
      prefer_dialogue_or_story.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "هذا الحقل مطلوب" },
        { status: 400 }
      )
    }

    if (
      !filming_concern ||
      !["no", "a_little", "yes"].includes(filming_concern)
    ) {
      return NextResponse.json(
        { error: "يرجى اختيار إجابة" },
        { status: 400 }
      )
    }

    if (typeof agrees_to_publish !== "boolean") {
      return NextResponse.json(
        { error: "يرجى الموافقة على النشر" },
        { status: 400 }
      )
    }

    const sanitizedName = stripHtml(name)
    const sanitizedEmail = email.toLowerCase().trim()

    if (!db) {
      return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 })
    }

    await db.insert(guestApplications).values({
      name: sanitizedName,
      email: sanitizedEmail,
      phone: stripHtml(phone),
      country: stripHtml(country),
      can_travel_to_kuwait: can_travel_to_kuwait ? stripHtml(can_travel_to_kuwait) : null,
      story_idea: stripHtml(story_idea),
      beyond_job_title: stripHtml(beyond_job_title),
      life_changing_moment: stripHtml(life_changing_moment),
      hope_people_understand: stripHtml(hope_people_understand),
      unasked_question: stripHtml(unasked_question),
      why_khat: stripHtml(why_khat),
      previous_podcast: typeof previous_podcast === "boolean" ? previous_podcast : false,
      previous_podcast_info: previous_podcast_info ? stripHtml(previous_podcast_info) : null,
      prefer_dialogue_or_story: stripHtml(prefer_dialogue_or_story),
      topics_to_avoid: topics_to_avoid ? stripHtml(topics_to_avoid) : null,
      filming_concern: stripHtml(filming_concern),
      agrees_to_publish: agrees_to_publish,
      social_links: social_links ? stripHtml(social_links) : null,
      status: "new",
    })

    // Send branded notification emails (fire-and-forget)
    const emailParams = { name: sanitizedName, email: sanitizedEmail, phone: stripHtml(phone), country: stripHtml(country) }
    Promise.all([
      sendGuestApplicationAdmin(process.env.ADMIN_NOTIFY_EMAIL || "khatpodcast@hotmail.com", emailParams),
      sendGuestApplicationConfirm(sanitizedEmail, sanitizedName),
    ]).catch(e => console.error("Guest notification email failed:", e))

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
      { status: 500 }
    )
  }
}
