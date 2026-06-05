/**
 * Phase 2.4.d — admin canonical-link endpoint for `guest_applications`.
 *
 * Sibling of /api/admin/guest-candidates/:id/link-canonical with the
 * same preview/confirm contract and the same operator-constraint
 * guarantees. See that route's docstring for the full design notes.
 *
 *   GET  /api/admin/submissions/guests/:id/link-canonical
 *     Preview the canonical match. STRICTLY READ-ONLY.
 *
 *   POST /api/admin/submissions/guests/:id/link-canonical
 *     Confirm: re-run preview internally, insert junction row in
 *     `guest_application_links`, emit a fire-and-forget system event.
 *
 * Same hints-extraction logic as `consolidateAcceptedApplication` in
 * the sibling PATCH /submissions/guests/:id route — both use the
 * `parseSocialLinks` helper local to this directory's other route.
 * Kept local (duplicated) instead of extracting to keep the diff small
 * and the existing PATCH path unmodified. The two parsers stay in sync
 * because they're trivial enough to read side-by-side.
 *
 * Minimum admin role: EDITOR (operator decision §4).
 */

import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import {
  errorResponse,
  requireRole,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import { db } from "@/lib/db"
import { guests, guestApplications } from "@/lib/db/schema/guests"
import {
  guestApplicationLinks,
  type GuestSocialAccounts,
} from "@/lib/db/schema/guest-identity"
import {
  ensureGuest,
  previewEnsureGuest,
  type IdentityHints,
} from "@/lib/guests/canonical"
import { emitSystemEvent } from "@/lib/system-events/emit"
import { buildGuestIdentityLinkedEvent } from "@/lib/system-events/builders"

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── Application → IdentityHints ──────────────────────────────────────

/**
 * Mirrors the parser used by the existing PATCH /submissions/guests/:id
 * acceptance path. Kept local — the parser is only 12 lines and a
 * shared module isn't worth the import cycle risk for a flow that
 * already lives in two files.
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

interface ApplicationRow {
  id: string
  name: string
  country: string | null
  story_idea: string | null
  social_links: string | null
}

function applicationToHints(row: ApplicationRow): IdentityHints {
  const social = parseSocialLinks(row.social_links ?? null)
  return {
    name: row.name,
    country: row.country,
    bio: row.story_idea ?? null,
    social_accounts: Object.keys(social).length > 0 ? social : null,
  }
}

async function loadApplicationRow(
  id: string,
): Promise<ApplicationRow | null> {
  if (!db) return null
  const rows = await db
    .select({
      id: guestApplications.id,
      name: guestApplications.name,
      country: guestApplications.country,
      story_idea: guestApplications.story_idea,
      social_links: guestApplications.social_links,
    })
    .from(guestApplications)
    .where(eq(guestApplications.id, id))
    .limit(1)
  return rows[0] ?? null
}

async function loadExistingLink(applicationId: string) {
  if (!db) return null
  const rows = await db
    .select({
      junction_id: guestApplicationLinks.id,
      guest_id: guestApplicationLinks.guest_id,
      link_type: guestApplicationLinks.link_type,
      linked_at: guestApplicationLinks.linked_at,
      guest_name: guests.name,
      guest_slug: guests.slug,
    })
    .from(guestApplicationLinks)
    .leftJoin(guests, eq(guests.id, guestApplicationLinks.guest_id))
    .where(eq(guestApplicationLinks.application_id, applicationId))
    .limit(1)
  return rows[0] ?? null
}

// ─── GET — preview ────────────────────────────────────────────────────

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error

  const { id } = await ctx.params
  if (!db) return errorResponse("قاعدة البيانات غير مهيأة", 500)

  try {
    const row = await loadApplicationRow(id)
    if (!row) return errorResponse("الطلب غير موجود", 404)

    const existing = await loadExistingLink(id)
    const hints = applicationToHints(row)
    const preview = await previewEnsureGuest(hints)

    return successResponse({
      application: {
        id: row.id,
        name: row.name,
        country: row.country,
      },
      existing_link: existing
        ? {
            junction_id: existing.junction_id,
            guest_id: existing.guest_id,
            guest_name: existing.guest_name,
            guest_slug: existing.guest_slug,
            link_type: existing.link_type,
            linked_at: existing.linked_at,
          }
        : null,
      preview: {
        guest_id: preview.guest_id,
        confidence: preview.confidence,
        reasons: preview.reasons,
        requires_review: preview.requires_review,
        would_create_slug: preview.would_create_slug,
      },
    })
  } catch (err) {
    console.error("[submissions/guests/link-canonical] preview failed:", err)
    return errorResponse("فشل في معاينة الربط", 500)
  }
}

// ─── POST — confirm ───────────────────────────────────────────────────

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params
  if (!db) return errorResponse("قاعدة البيانات غير مهيأة", 500)

  try {
    const row = await loadApplicationRow(id)
    if (!row) return errorResponse("الطلب غير موجود", 404)

    // Re-check junction first (cheaper than running the matcher when
    // the row is already linked).
    const existing = await loadExistingLink(id)
    if (existing) {
      return successResponse(
        {
          status: "already_linked",
          junction_id: existing.junction_id,
          guest_id: existing.guest_id,
          guest_name: existing.guest_name,
        },
        200,
      )
    }

    // Re-run the matcher inside confirm (operator constraint).
    const hints = applicationToHints(row)
    const preview = await previewEnsureGuest(hints)

    if (preview.requires_review || preview.confidence === "low") {
      return errorResponse(
        "تعذّر تأكيد هوية الضيف — يحتاج مراجعة يدوية",
        409,
      )
    }

    const ensure = await ensureGuest(hints, { acceptance: "auto" })
    if (ensure.requires_review) {
      return errorResponse(
        "تعذّر تأكيد هوية الضيف — يحتاج مراجعة يدوية",
        409,
      )
    }

    // Final race-window check.
    const reCheck = await loadExistingLink(id)
    if (reCheck) {
      return successResponse(
        {
          status: "already_linked",
          junction_id: reCheck.junction_id,
          guest_id: reCheck.guest_id,
          guest_name: reCheck.guest_name,
        },
        200,
      )
    }

    const [junction] = await db
      .insert(guestApplicationLinks)
      .values({
        guest_id: ensure.guest_id,
        application_id: row.id,
        link_type: "manual_link",
        linked_by: `admin:${auth.user.id}`,
      })
      .returning({ id: guestApplicationLinks.id })

    const [guestRow] = await db
      .select({ name: guests.name, slug: guests.slug })
      .from(guests)
      .where(eq(guests.id, ensure.guest_id))
      .limit(1)

    // Fire-and-forget emit — see candidate route docstring for the
    // identical contract.
    void emitSystemEvent(
      buildGuestIdentityLinkedEvent({
        kind: "application",
        junction_id: junction.id,
        source_id: row.id,
        guest_id: ensure.guest_id,
        confidence: ensure.confidence === "medium" ? "medium" : "high",
        created_guest: ensure.created,
        actor: `admin:${auth.user.id}`,
      }),
    )

    revalidatePath("/admin/submissions")
    revalidatePath("/admin/guests")

    return successResponse({
      status: "linked",
      junction_id: junction.id,
      guest_id: ensure.guest_id,
      guest_name: guestRow?.name ?? null,
      guest_slug: guestRow?.slug ?? null,
      confidence: ensure.confidence,
      created_guest: ensure.created,
    })
  } catch (err) {
    console.error("[submissions/guests/link-canonical] confirm failed:", err)
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("uq_gal_application")) {
      return errorResponse("هذا الطلب مرتبط مسبقًا بضيف قانوني", 409)
    }
    return errorResponse("فشل في ربط الطلب بالضيف القانوني", 500)
  }
}
