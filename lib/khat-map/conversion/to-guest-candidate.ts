/**
 * Khat Map guest candidate → global `guest_candidates` pipeline conversion.
 *
 * Creates one `guestCandidates` row (with AI-analysis scores mirrored into
 * the `ai_*` columns) and N `guestCandidateSocialLinks` rows. Links back
 * via `khat_map_guest_candidates.converted_to_guest_candidate_id` and
 * marks the Khat Map row status `converted_to_guest_candidate`.
 *
 * Idempotency: if the back-link already points at an existing row, return
 * the existing link.
 */

import { db } from "@/lib/db"
import {
  guestCandidates,
  guestCandidateSocialLinks,
} from "@/lib/db/schema/guest-candidates"
import { khatMapGuestCandidates } from "@/lib/db/schema/khat-map"
import { eq } from "drizzle-orm"
import type { KhatMapGuestCandidate } from "@/types/khat-map"
import {
  getGuestCandidateById,
  getSeasonById,
  logFeedback,
  bumpAcceptedPattern,
} from "@/lib/khat-map/core/queries"
import {
  ensureGuest,
  updateGuestIdentityProfile,
  type IdentityHints,
} from "@/lib/guests/canonical"
import type { ConversionResult } from "./types"

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ConvertGuestToCandidateInput {
  /** The Khat Map guest candidate id (season-scoped). */
  khat_map_guest_id: string
  admin_id: string
}

export async function convertGuestToGlobalCandidate(
  input: ConvertGuestToCandidateInput,
): Promise<ConversionResult> {
  const source = await getGuestCandidateById(input.khat_map_guest_id)
  if (!source) {
    return {
      ok: false,
      reason: "not_found",
      message: "لم يتم العثور على المرشح",
    }
  }

  // ── Idempotency ────────────────────────────────────────────────────────
  if (source.converted_to_guest_candidate_id) {
    const existing = await db!
      .select({ id: guestCandidates.id, slug: guestCandidates.slug, created_at: guestCandidates.created_at })
      .from(guestCandidates)
      .where(eq(guestCandidates.id, source.converted_to_guest_candidate_id))
      .limit(1)
    if (existing[0]) {
      return {
        ok: true,
        created: false,
        was_existing: true,
        link: {
          kind: "guest_to_candidate",
          target_id: existing[0].id,
          href: `/admin/guest-candidates/${existing[0].id}`,
          label: "مرشح رسمي مرتبط",
          converted_at:
            source.converted_at ??
            (existing[0].created_at instanceof Date
              ? existing[0].created_at.toISOString()
              : String(existing[0].created_at ?? new Date().toISOString())),
        },
      }
    }
    // Back-link dangling — fall through and re-create.
  }

  const season = await getSeasonById(source.season_id)
  const seasonLabel = season ? season.name : "خريطة خط"

  // ── Insert the global candidate ────────────────────────────────────────
  const priority = priorityFromScore(source.relevance_score)
  const riskNotes = source.risk_flags.length
    ? source.risk_flags.join(" · ")
    : null

  const [row] = await db!
    .insert(guestCandidates)
    .values({
      full_name: source.full_name,
      display_name: source.display_name,
      slug: null, // admin's module generates slugs on its own flow
      primary_language: "ar",
      category: source.category,
      city: source.city,
      country: source.country,
      bio: source.bio,
      notes_internal: `من خريطة خط — ${seasonLabel}`,
      status: "new",
      source_type: "ai_search",
      source_note: `Khat Map season: ${seasonLabel}`,
      priority_level: priority,

      // AI analysis mirror — preserves the Khat Map editorial judgment so the
      // guest-candidates admin can see it without re-running analysis.
      ai_score_overall: source.relevance_score,
      ai_fit_score: source.relevance_score,
      ai_depth_score: source.depth_score,
      ai_reach_score: source.reach_score,
      ai_risk_score: inverseRiskScoreFromFlags(source.risk_flags.length),
      ai_summary: source.evidence_summary ?? source.why_fit,
      ai_strengths: deriveStrengths(source),
      ai_weaknesses: source.risk_flags,
      ai_risk_notes: riskNotes,
      ai_reason_to_invite: source.why_fit,
      ai_topics_json: [],
      ai_conversation_angles_json: [],
      ai_suggested_questions_json: {},
      ai_model_used: "khat-map:season-generation",
      ai_generated_at: new Date(),
    })
    .returning()

  if (!row) {
    return {
      ok: false,
      reason: "db_error",
      message: "فشل إنشاء المرشح الرسمي",
    }
  }

  // ── Insert social links ────────────────────────────────────────────────
  const linksToInsert = collectLinks(source)
  if (linksToInsert.length > 0) {
    await db!.insert(guestCandidateSocialLinks).values(
      linksToInsert.map((l, idx) => ({
        candidate_id: row.id,
        platform: l.platform,
        url: l.url,
        label: l.label ?? null,
        is_primary: idx === 0,
        source: "ai_suggested" as const,
        verified_by_admin: false,
      })),
    )
  }

  // ── Back-link + status on the Khat Map row ────────────────────────────
  await db!
    .update(khatMapGuestCandidates)
    .set({
      converted_to_guest_candidate_id: row.id,
      converted_at: new Date(),
      status: "converted_to_guest_candidate",
      updated_at: new Date(),
    })
    .where(eq(khatMapGuestCandidates.id, source.id))

  // ── Khat Brain — also ensure a canonical guest + profile ──────────
  // Phase 7: this conversion now produces both a vetting-stage candidate
  // AND attempts to consolidate into the canonical guest record. If the
  // match is uncertain, we leave the candidate as-is (admin review path)
  // and log the fact so the dashboard can surface it.
  try {
    const hints: IdentityHints = {
      name: source.full_name,
      country: source.country,
      website: source.social_accounts?.website ?? null,
      bio: source.bio ?? null,
      social_accounts: source.social_accounts ?? undefined,
    }
    const ensure = await ensureGuest(hints, { acceptance: "auto" })
    if (!ensure.requires_review && ensure.guest_id) {
      await updateGuestIdentityProfile(ensure.guest_id, {
        application_summary: undefined, // not from application
        source_summary: {
          manual: { last_seen: new Date().toISOString() },
        },
        social_accounts: source.social_accounts ?? undefined,
        last_analyzed_at: new Date(),
      })
    } else {
      console.warn(
        `[khat-map → canonical] guest "${source.full_name}" requires review: ${ensure.reasons.join(" · ")}`,
      )
    }
  } catch (err) {
    console.error("[khat-map → canonical] ensureGuest failed:", err)
  }

  // ── Learning-layer reinforcement ──────────────────────────────────────
  await logFeedback({
    season_id: source.season_id,
    target_type: "guest_candidate",
    target_id: source.id,
    action: "accepted",
    reason_category: "other",
    reason_text: "converted_to_guest_candidate",
    admin_id: input.admin_id,
  })
  if (source.category) {
    await bumpAcceptedPattern({
      pattern_type: "guest_type",
      pattern_text: source.category,
      notes: "converted_to_global_candidate",
    })
  }

  return {
    ok: true,
    created: true,
    was_existing: false,
    link: {
      kind: "guest_to_candidate",
      target_id: row.id,
      href: `/admin/guest-candidates/${row.id}`,
      label: "مرشح رسمي جديد",
      converted_at: new Date().toISOString(),
    },
  }
}

export async function getGlobalGuestLinkForKhatMapGuest(
  khat_map_guest_id: string,
): Promise<{ global_id: string; href: string } | null> {
  const source = await getGuestCandidateById(khat_map_guest_id)
  if (!source?.converted_to_guest_candidate_id) return null
  return {
    global_id: source.converted_to_guest_candidate_id,
    href: `/admin/guest-candidates/${source.converted_to_guest_candidate_id}`,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function priorityFromScore(score: number | null): "low" | "medium" | "high" {
  if (score === null || !Number.isFinite(score)) return "medium"
  if (score >= 7.5) return "high"
  if (score >= 5) return "medium"
  return "low"
}

/**
 * Heuristic: the more risk flags, the higher the risk score (0–10). Because
 * the Khat Map guest row stores risks as free-form strings, we can't map
 * them to a numeric axis precisely — this gives the admin a rough starting
 * point they can refine inside the candidate detail view.
 */
function inverseRiskScoreFromFlags(flagCount: number): number {
  if (flagCount === 0) return 2
  if (flagCount === 1) return 4
  if (flagCount === 2) return 6
  return 8
}

function deriveStrengths(source: KhatMapGuestCandidate): string[] {
  const out: string[] = []
  if (source.depth_score !== null && source.depth_score >= 7) {
    out.push(`عمق فكري مرتفع (${source.depth_score.toFixed(1)}/10)`)
  }
  if (source.reach_score !== null && source.reach_score >= 7) {
    out.push(`وصول جماهيري قوي (${source.reach_score.toFixed(1)}/10)`)
  }
  if (source.relevance_score !== null && source.relevance_score >= 7) {
    out.push(`صلة تحريرية عالية (${source.relevance_score.toFixed(1)}/10)`)
  }
  if (source.evidence_citations.length > 0) {
    out.push(`${source.evidence_citations.length} أدلة تحريرية موثّقة`)
  }
  return out
}

type CollectedLink = { platform: string; url: string; label?: string }

/**
 * Merge `public_links` + `social_accounts` into a dedup-by-URL list.
 * public_links win when both sources reference the same URL because they
 * carry richer labels.
 */
function collectLinks(source: KhatMapGuestCandidate): CollectedLink[] {
  const out: CollectedLink[] = []
  const seen = new Set<string>()
  for (const l of source.public_links) {
    if (!l.url?.trim() || !l.platform?.trim()) continue
    const key = l.url.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ platform: l.platform, url: l.url, label: l.label })
  }
  const blob = source.social_accounts ?? {}
  const pairs: Array<[string, string | undefined]> = [
    ["twitter", blob.twitter],
    ["instagram", blob.instagram],
    ["youtube", blob.youtube],
    ["linkedin", blob.linkedin],
    ["tiktok", blob.tiktok],
    ["website", blob.website],
  ]
  for (const [platform, url] of pairs) {
    if (!url) continue
    const key = url.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ platform, url })
  }
  return out
}
