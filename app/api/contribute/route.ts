import { NextRequest, NextResponse } from "next/server"
import { validateMutation, rateLimitResponse } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { stripHtml } from "@/lib/sanitize"
import { validateEmail } from "@/lib/validation/forms"
import { createCommunityContribution } from "@/lib/community/queries"
import { autoTriageCommunityContribution } from "@/lib/community/triage"
import { communityRef } from "@/lib/community-ref"
import { logActivity } from "@/lib/crm"
import { sendCommunityContributionConfirm } from "@/lib/email/send"
import type { CommunityContributionType } from "@/types/database"

const TYPES: CommunityContributionType[] = ["guest", "topic", "question", "concept", "improvement"]
const TYPE_LABEL: Record<string, string> = {
  guest: "اقتراح ضيف",
  topic: "فكرة حلقة",
  question: "سؤال للنقاش",
  concept: "فكرة محتوى",
  improvement: "اقتراح لتحسين البودكاست",
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateMutation(request)
    if (csrfError) return csrfError

    const rl = checkIpRateLimit(request, "community_contribution", 6, 60 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse()

    const body = await request.json().catch(() => ({}))
    const { type, title, content, details, contributor_name, contributor_email } = body

    if (!type || !TYPES.includes(type)) {
      return NextResponse.json({ error: "نوع المساهمة غير صالح" }, { status: 400 })
    }
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 })
    }
    if (!content || typeof content !== "string" || content.trim().length < 10) {
      return NextResponse.json({ error: "أخبرنا أكثر — اكتب بضع كلمات على الأقل" }, { status: 400 })
    }
    if (title.length > 200 || content.length > 4000) {
      return NextResponse.json({ error: "النص أطول من اللازم" }, { status: 400 })
    }

    // Email is optional; validate only when given.
    let email: string | null = null
    if (contributor_email && typeof contributor_email === "string" && contributor_email.trim()) {
      const check = validateEmail(contributor_email)
      if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 })
      email = contributor_email.toLowerCase().trim()
    }

    // Sanitize type-specific detail strings (cap each).
    const cleanDetails: Record<string, unknown> = {}
    if (details && typeof details === "object") {
      for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) cleanDetails[stripHtml(k).slice(0, 40)] = stripHtml(v).slice(0, 1000)
      }
    }

    const id = await createCommunityContribution({
      type,
      title: stripHtml(title),
      body: stripHtml(content),
      details: cleanDetails,
      contributor_name: contributor_name ? stripHtml(contributor_name).slice(0, 120) : null,
      contributor_email: email,
    })
    if (!id) return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 })

    const reference = communityRef(id)

    // Open the timeline + confirm to the contributor (fire-and-forget).
    void logActivity("community", id, {
      type: "contribution_created",
      summary: `وصلت مساهمة جديدة: ${TYPE_LABEL[type]}`,
      actor: "public",
      metadata: { type, reference },
    })
    if (email) {
      void sendCommunityContributionConfirm(email, contributor_name ? stripHtml(contributor_name) : "", TYPE_LABEL[type], reference)
        .catch((e) => console.error("Community confirm email failed:", e))
    }

    // Persist the reference, then AI-triage in the background.
    void autoTriageCommunityContribution(id)

    return NextResponse.json({ success: true, reference })
  } catch {
    return NextResponse.json({ error: "حدث خطأ. يرجى المحاولة مرة أخرى." }, { status: 500 })
  }
}
