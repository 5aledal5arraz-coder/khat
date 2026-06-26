import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { guestApplications } from "@/lib/db/schema/guests"
import { validateMutation, rateLimitResponse } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { guestRef } from "@/lib/guest-ref"
import type { GuestApplicationStatus } from "@/types/database"

/**
 * Public status lookup — an applicant proves identity with their reference +
 * the email they applied with, and gets a coarse, friendly status. Returns a
 * generic "not found" when they don't match, so the endpoint can't be used to
 * enumerate who applied. Rate-limited.
 */
function coarseStatus(status: GuestApplicationStatus): { state: string; label: string; note: string } {
  switch (status) {
    case "new":
    case "under_review":
      return {
        state: "review",
        label: "طلبك قيد المراجعة",
        note: "يقرأ فريقنا التحريري قصتك بعناية. الصمت لا يعني الرفض — نحتفظ بالقصص القوية ونعود إليها حين يحين وقتها.",
      }
    case "accepted":
    case "rejected":
    case "consider_later":
    default:
      return {
        state: "decided",
        label: "اكتملت مراجعة طلبك",
        note: "وصلنا إلى قرار بشأن طلبك. راجع بريدك الإلكتروني — تواصلنا (أو سنتواصل) معك بالتفاصيل.",
      }
  }
}

export async function POST(request: NextRequest) {
  const csrfError = validateMutation(request)
  if (csrfError) return csrfError

  // Tight limit: this is an identity-gated lookup, not a browse endpoint.
  const rl = checkIpRateLimit(request, "guest_status", 20, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse()

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : ""
  const reference = typeof body.reference === "string" ? body.reference.toUpperCase().trim() : ""

  if (!email || !reference) {
    return NextResponse.json({ error: "أدخل بريدك ورقمك المرجعي" }, { status: 400 })
  }
  if (!db) return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 })

  const rows = await db
    .select({ id: guestApplications.id, status: guestApplications.status })
    .from(guestApplications)
    .where(eq(guestApplications.email, email))

  const match = rows.find((r) => guestRef(r.id) === reference)
  if (!match) {
    // Generic — never reveal whether the email or the reference was the miss.
    return NextResponse.json({ found: false })
  }

  return NextResponse.json({
    found: true,
    reference,
    ...coarseStatus((match.status as GuestApplicationStatus) ?? "under_review"),
  })
}
