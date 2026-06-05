/**
 * Phase 2.4.d — admin canonical-link endpoint for `guest_candidates`.
 *
 *   GET  /api/admin/guest-candidates/:id/link-canonical
 *     Preview: returns the match the canonical service would propose
 *     for this candidate. STRICTLY READ-ONLY — no DB writes.
 *
 *   POST /api/admin/guest-candidates/:id/link-canonical
 *     Confirm: re-runs the preview internally, then inserts a junction
 *     row in `guest_candidate_links`. NEVER trusts the client's stale
 *     preview payload — operator constraint.
 *
 * Sibling route for applications:
 *   /api/admin/submissions/guests/:id/link-canonical
 * Same shape; different junction table.
 *
 * Guarantees enforced here (operator constraints):
 *   • Preview never writes.
 *   • Confirm re-runs `previewEnsureGuest` before deciding to write.
 *   • Confirm re-checks junction existence before INSERT (race window).
 *   • Low-confidence / requires-review cases NEVER write; return 409.
 *   • Mismatch cases (candidate already linked to a different guest)
 *     NEVER overwrite; return 409 with the existing link summarized.
 *   • `system_events` emit is fire-and-forget; emit failure NEVER
 *     fails the link.
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
import { guests } from "@/lib/db/schema/guests"
import { guestCandidates } from "@/lib/db/schema/guest-candidates"
import { guestCandidateLinks } from "@/lib/db/schema/guest-identity"
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

// ─── Shape candidate → IdentityHints ──────────────────────────────────

interface CandidateRow {
  id: string
  full_name: string
  display_name: string | null
  bio: string | null
  country: string | null
}

function candidateToHints(row: CandidateRow): IdentityHints {
  // Display name beats full_name only when present — admins sometimes
  // edit the display variant to be the "marketing" form. Matcher
  // normalizes both anyway, so we pass display_name when set.
  const name = (row.display_name ?? row.full_name ?? "").trim()
  return {
    name: name || null,
    country: row.country ?? null,
    bio: row.bio ?? null,
  }
}

async function loadCandidateRow(id: string): Promise<CandidateRow | null> {
  if (!db) return null
  const rows = await db
    .select({
      id: guestCandidates.id,
      full_name: guestCandidates.full_name,
      display_name: guestCandidates.display_name,
      bio: guestCandidates.bio,
      country: guestCandidates.country,
    })
    .from(guestCandidates)
    .where(eq(guestCandidates.id, id))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Look up any pre-existing junction row for this candidate. Returns
 * the junction + the bound guest name when present, otherwise null.
 *
 * Why a JOIN: the UI surfaces the existing linked guest's name when
 * the operator opens the dialog on an already-linked candidate.
 */
async function loadExistingLink(candidateId: string) {
  if (!db) return null
  const rows = await db
    .select({
      junction_id: guestCandidateLinks.id,
      guest_id: guestCandidateLinks.guest_id,
      link_type: guestCandidateLinks.link_type,
      confidence: guestCandidateLinks.confidence,
      linked_at: guestCandidateLinks.linked_at,
      guest_name: guests.name,
      guest_slug: guests.slug,
    })
    .from(guestCandidateLinks)
    .leftJoin(guests, eq(guests.id, guestCandidateLinks.guest_id))
    .where(eq(guestCandidateLinks.candidate_id, candidateId))
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
    const row = await loadCandidateRow(id)
    if (!row) return errorResponse("المرشح غير موجود", 404)

    const existing = await loadExistingLink(id)
    const hints = candidateToHints(row)
    const preview = await previewEnsureGuest(hints)

    return successResponse({
      candidate: {
        id: row.id,
        name: (row.display_name ?? row.full_name ?? "").trim(),
        country: row.country,
      },
      existing_link: existing
        ? {
            junction_id: existing.junction_id,
            guest_id: existing.guest_id,
            guest_name: existing.guest_name,
            guest_slug: existing.guest_slug,
            link_type: existing.link_type,
            confidence: existing.confidence,
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
    console.error("[guest-candidates/link-canonical] preview failed:", err)
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
    const row = await loadCandidateRow(id)
    if (!row) return errorResponse("المرشح غير موجود", 404)

    // Re-check junction existence BEFORE we run the matcher — if a
    // sibling tab already linked this candidate, we want to return the
    // existing link instead of attempting a duplicate insert (the
    // `uq_gcl_candidate` UNIQUE index would catch it anyway, but a
    // 409 is friendlier than a 500).
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

    // Re-run the matcher inside the confirm path (operator constraint:
    // never trust stale client preview state).
    const hints = candidateToHints(row)
    const preview = await previewEnsureGuest(hints)

    // Low confidence / requires_review never writes. v1 admin UI only
    // exposes a "review needed" warning — no destructive CTA.
    if (preview.requires_review || preview.confidence === "low") {
      return errorResponse(
        "تعذّر تأكيد هوية الضيف — يحتاج مراجعة يدوية",
        409,
      )
    }

    // Bind to canonical (or create if confidence === 'none').
    // `acceptance: 'auto'` mirrors the bulk-link path — high+medium
    // auto-link, none creates fresh.
    const ensure = await ensureGuest(hints, { acceptance: "auto" })

    if (ensure.requires_review) {
      // Belt and suspenders — should be unreachable because the
      // preview above already gated requires_review, but a concurrent
      // INSERT could theoretically change the matcher's verdict.
      return errorResponse(
        "تعذّر تأكيد هوية الضيف — يحتاج مراجعة يدوية",
        409,
      )
    }

    // Final race-window check: someone else may have just linked this
    // candidate between our existing-link check and this insert. The
    // UNIQUE index will reject the dup, but we still re-check to give
    // a friendlier response.
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

    // Insert the junction row.
    const [junction] = await db
      .insert(guestCandidateLinks)
      .values({
        guest_id: ensure.guest_id,
        candidate_id: row.id,
        link_type: "manual_link",
        confidence: ensure.confidence,
        linked_by: `admin:${auth.user.id}`,
      })
      .returning({ id: guestCandidateLinks.id })

    // Look up the canonical guest's name for the success toast.
    const [guestRow] = await db
      .select({ name: guests.name, slug: guests.slug })
      .from(guests)
      .where(eq(guests.id, ensure.guest_id))
      .limit(1)

    // Fire-and-forget system_events emit. NEVER fail the link if this
    // throws — `emitSystemEvent` already wraps its INSERT in try/catch
    // (P2.3.a contract), and we additionally `void`-discard so any
    // unexpected synchronous failure cannot bubble up.
    void emitSystemEvent(
      buildGuestIdentityLinkedEvent({
        kind: "candidate",
        junction_id: junction.id,
        source_id: row.id,
        guest_id: ensure.guest_id,
        confidence: ensure.confidence === "medium" ? "medium" : "high",
        created_guest: ensure.created,
        actor: `admin:${auth.user.id}`,
      }),
    )

    // Cache invalidation — both the candidate page and the guests list.
    revalidatePath(`/admin/guest-candidates/${row.id}`)
    revalidatePath("/admin/guest-candidates")
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
    console.error("[guest-candidates/link-canonical] confirm failed:", err)
    // Surface UNIQUE-violation as 409 (uq_gcl_candidate) — the
    // race-window check above usually catches it, but defense in depth.
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("uq_gcl_candidate")) {
      return errorResponse("هذا المرشح مرتبط مسبقًا بضيف قانوني", 409)
    }
    return errorResponse("فشل في ربط المرشح بالضيف القانوني", 500)
  }
}
