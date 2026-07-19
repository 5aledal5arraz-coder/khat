/**
 * POST /api/admin/guest-candidates/:id/promote-to-production
 *
 * The EXPLICIT "نقل للإنتاج" action — creates a production EIR from an
 * accepted, canonically-linked candidate.
 *
 * Operator constraints (Phase-1 lesson — NEVER create an EIR silently; the
 * studio-on-open bug is not to be reintroduced):
 *   • Requires an explicit POST. No GET/preview path creates anything.
 *   • Gates on candidate.status === "accepted".
 *   • Requires an existing canonical-guest link (guest_candidate_links) —
 *     the admin links the guest first (that's where phone/email fixates).
 *   • Idempotent: re-invocation returns the existing EIR, never a second one.
 *
 * The soft-link lives in the EIR's editorial_intent.source_id — no FK; the
 * guest_candidates table stays standalone by design.
 *
 * Minimum admin role: EDITOR.
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
import { guestCandidates } from "@/lib/db/schema/guest-candidates"
import {
  getEirForCandidate,
  getCandidateGuestId,
  bridgeCandidateToProduction,
} from "@/lib/guest-candidates"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params
  if (!db) return errorResponse("قاعدة البيانات غير مهيأة", 500)

  try {
    const [cand] = await db
      .select({ id: guestCandidates.id, status: guestCandidates.status })
      .from(guestCandidates)
      .where(eq(guestCandidates.id, id))
      .limit(1)
    if (!cand) return errorResponse("المرشح غير موجود", 404)

    // Gate 1 — only accepted candidates enter production.
    if (cand.status !== "accepted") {
      return errorResponse(
        "لا يمكن النقل للإنتاج قبل موافقة الضيف (الحالة يجب أن تكون «وافق»)",
        409,
      )
    }

    // Gate 2 — the candidate must already be linked to a canonical guest.
    const guestId = await getCandidateGuestId(id)
    if (!guestId) {
      return errorResponse("اربط المرشّح بضيف قانوني أولاً ثم انقله للإنتاج", 409)
    }

    // Idempotency — if already bridged, return the existing EIR (never a second).
    const existing = await getEirForCandidate(id)
    if (existing) {
      return successResponse({
        status: "already_in_production",
        eir_id: existing.id,
        working_title: existing.working_title,
        phase: existing.phase,
        created: false,
      })
    }

    const result = await bridgeCandidateToProduction({
      candidateId: id,
      guestId,
      actorId: `admin:${auth.user.id}`,
    })
    if (!result) return errorResponse("تعذّر نقل المرشّح للإنتاج", 500)

    const eir = await getEirForCandidate(id)

    revalidatePath(`/admin/guest-candidates/${id}`)
    revalidatePath("/admin/khat-brain/episodes")

    return successResponse({
      status: "promoted",
      eir_id: result.eir_id,
      working_title: eir?.working_title ?? null,
      phase: eir?.phase ?? "guest_assigned",
      created: result.created,
    })
  } catch (err) {
    console.error("[guest-candidates/promote-to-production] failed:", err)
    return errorResponse("فشل نقل المرشّح للإنتاج", 500)
  }
}
