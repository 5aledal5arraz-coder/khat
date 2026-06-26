import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { guestApplications } from "@/lib/db/schema/guests"
import {
  deleteGuestApplication,
  updateGuestApplicationStatus,
} from "@/lib/admin/queries"
import type { GuestApplicationStatus } from "@/types/database"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { logActivity, deleteCrmForSubject } from "@/lib/crm"
import { getGuestApplicationById } from "@/lib/admin/queries"
import { bridgeApplicationToProduction } from "@/lib/guest-crm/production-bridge"
import {
  ensureGuest,
  updateGuestIdentityProfile,
  type IdentityHints,
} from "@/lib/guests/canonical"
import type {
  GuestApplicationSummary,
  GuestSocialAccounts,
  GuestSourceSummary,
} from "@/lib/db/schema/guest-identity"

const VALID_STATUSES: GuestApplicationStatus[] = [
  "new",
  "under_review",
  "accepted",
  "rejected",
  "consider_later",
]

const STATUS_LABEL: Record<GuestApplicationStatus, string> = {
  new: "جديد",
  under_review: "قيد المراجعة",
  accepted: "مقبول",
  rejected: "معتذر",
  consider_later: "للاحتفاظ",
}

/**
 * Best-effort parse of the free-form social_links text on guest_applications
 * into a structured GuestSocialAccounts blob. Recognizes platform domains
 * + Twitter/X @handles. Anything else is dropped (the bio still has the
 * full text for human reading).
 */
function parseSocialLinks(text: string | null): GuestSocialAccounts {
  const out: GuestSocialAccounts = {}
  if (!text) return out
  const tokens = text.split(/[\s,;|]+/).filter(Boolean)
  for (const t of tokens) {
    const lower = t.toLowerCase()
    if (lower.includes("twitter.com") || lower.includes("x.com")) out.twitter = t
    else if (lower.includes("instagram.com")) out.instagram = t
    else if (lower.includes("youtube.com") || lower.includes("youtu.be")) out.youtube = t
    else if (lower.includes("linkedin.com")) out.linkedin = t
    else if (lower.includes("tiktok.com")) out.tiktok = t
    else if (lower.includes("facebook.com")) out.facebook = t
    else if (t.startsWith("@")) out.twitter = out.twitter ?? t
  }
  return out
}

/**
 * Khat Brain Phase 7 — when an application transitions to `accepted`, we
 * route it through the canonical guest service so the platform has one
 * authoritative record per real human, with the full application
 * captured on the identity profile.
 */
async function consolidateAcceptedApplication(applicationId: string, actorId?: string | null): Promise<void> {
  const rows = await db!
    .select()
    .from(guestApplications)
    .where(eq(guestApplications.id, applicationId))
    .limit(1)
  const app = rows[0]
  if (!app) return

  const social = parseSocialLinks(app.social_links ?? null)
  const hints: IdentityHints = {
    name: app.name,
    country: app.country,
    bio: app.story_idea,
    social_accounts: social,
  }
  const ensure = await ensureGuest(hints, { acceptance: "auto" })
  if (ensure.requires_review || !ensure.guest_id) {
    console.warn(
      `[guest-application] application ${applicationId} (${app.name}) requires review: ${ensure.reasons.join(" · ")}`,
    )
    return
  }

  const summary: GuestApplicationSummary = {
    application_id: app.id,
    story_idea: app.story_idea,
    beyond_job_title: app.beyond_job_title,
    life_changing_moment: app.life_changing_moment,
    why_khat: app.why_khat,
    topics_to_avoid: app.topics_to_avoid,
  }
  const sourceSummary: GuestSourceSummary = {
    application: {
      id: app.id,
      received_at: app.created_at instanceof Date ? app.created_at.toISOString() : null,
    },
  }

  await updateGuestIdentityProfile(ensure.guest_id, {
    application_summary: summary,
    source_summary: sourceSummary,
    social_accounts: Object.keys(social).length > 0 ? social : undefined,
    last_analyzed_at: new Date(),
  })

  // Production bridge — put the accepted story into the pipeline as an EIR so
  // Khat Brain actually picks the guest up. Idempotent; best-effort.
  try {
    await bridgeApplicationToProduction({ applicationId, guestId: ensure.guest_id, actorId })
  } catch (err) {
    console.error("[guest-application] production bridge failed:", err)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const { id } = await params
    const body = await request.json()
    const { status } = body

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 })
    }

    const prev = await getGuestApplicationById(id)
    const result = await updateGuestApplicationStatus(id, status)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    if (!prev || prev.status !== status) {
      const user = await getAdminAuthUser()
      const fromLabel = prev ? STATUS_LABEL[prev.status] : "—"
      await logActivity("guest", id, {
        type: "status_changed",
        summary: `تغيّرت الحالة: ${fromLabel} ← ${STATUS_LABEL[status as GuestApplicationStatus]}`,
        actor: user ? `admin:${user.email}` : "admin",
        metadata: { from: prev?.status ?? null, to: status },
      })
    }

    // Phase 7 — on acceptance, consolidate into the canonical guest.
    // Non-blocking: if consolidation fails we still acknowledge the
    // status change (the admin can re-trigger via backfill).
    if (status === "accepted") {
      try {
        const user = await getAdminAuthUser()
        await consolidateAcceptedApplication(id, user ? `admin:${user.email}` : null)
      } catch (err) {
        console.error("[guest-application] consolidation failed:", err)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating application status:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث الحالة" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const { id } = await params

    const result = await deleteGuestApplication(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // CRM rows are polymorphic (no FK cascade) — clean them up explicitly.
    await deleteCrmForSubject("guest", id).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting guest application:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء حذف الطلب" },
      { status: 500 }
    )
  }
}
