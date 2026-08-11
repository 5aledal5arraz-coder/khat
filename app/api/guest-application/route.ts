import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guestApplications } from "@/lib/db/schema"
import { stripHtml } from "@/lib/sanitize"
import { validateEmail } from "@/lib/validation/forms"
import { validateMutation, rateLimitResponse } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { enqueueJob } from "@/lib/jobs/queue"
import {
  SUBMISSION_NOTIFY_JOB,
  NOTIFY_ENQUEUE_OPTIONS,
  type GuestSubmissionPayload,
} from "@/lib/jobs/submission-notify-jobs"
import { getSiteSettings } from "@/lib/site-settings"
import { autoTriageGuestApplication } from "@/lib/guest-triage"
import { logActivity } from "@/lib/crm"
import { guestRef } from "@/lib/guest-ref"

export async function POST(request: NextRequest) {
  try {
    // CSRF protection
    const csrfError = validateMutation(request)
    if (csrfError) return csrfError

    // Feature gate: refuse submissions when an admin has closed applications.
    const settings = await getSiteSettings().catch(() => null)
    if (settings && settings.featureFlags.guestApplicationsEnabled === false) {
      return NextResponse.json(
        { error: "باب الطلبات مغلق حالياً. تابعنا لتعرف متى نفتحه من جديد." },
        { status: 403 },
      )
    }

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

    const [inserted] = await db.insert(guestApplications).values({
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
    }).returning({ id: guestApplications.id })

    const reference = guestRef(inserted.id)

    // Notification mail goes on the job queue — durable, retried with backoff,
    // and visible as a failed `jobs` row carrying `last_error` when it doesn't
    // work. It used to be `Promise.all([...]).catch(console.error)`: the visitor
    // saw success, the row was saved, and if Resend was down or over its
    // 100/day cap nobody was ever told the application existed.
    //
    // The enqueue itself must not fail the submission — the application is
    // already committed, and an applicant should never be asked to resubmit
    // because a queue insert blipped. This console.error is the last resort,
    // not the design.
    void enqueueJob(SUBMISSION_NOTIFY_JOB, {
      kind: "guest_application",
      reference,
      name: sanitizedName,
      email: sanitizedEmail,
      phone: stripHtml(phone),
      country: stripHtml(country),
    } satisfies GuestSubmissionPayload, NOTIFY_ENQUEUE_OPTIONS).catch((e) =>
      console.error("[guest-application] could not enqueue the notification job:", e),
    )

    // Open the casting timeline + run the AI read in the background so the
    // operator opens a PRE-EVALUATED story. Fire-and-forget — never blocks.
    void logActivity("guest", inserted.id, {
      type: "application_created",
      summary: `وصل طلب ضيافة جديد من ${sanitizedName}`,
      actor: "public",
      metadata: { country: stripHtml(country) },
    })
    void autoTriageGuestApplication(inserted.id)

    return NextResponse.json({ success: true, reference })
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ. يرجى المحاولة مرة أخرى." },
      { status: 500 }
    )
  }
}
