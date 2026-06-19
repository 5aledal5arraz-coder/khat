/**
 * Episode candidate → preparation-record conversion.
 *
 * Creates a new row in `episode_preparations` pre-filled from the Khat Map
 * candidate (title, goal, axes, questions, risk, type, guest identity), and
 * writes the back-link onto `khat_map_episode_candidates.converted_preparation_id`.
 *
 * Idempotency: if `converted_preparation_id` is already set AND the linked
 * preparation still exists, return that existing link instead of creating
 * a second preparation. This lets the UI safely show "Convert to preparation"
 * as a button that's also an idempotent no-op on repeat clicks.
 *
 * Guest identity: we REQUIRE a linked + season-scoped guest candidate to
 * build a valid `PreparationGuestIdentity`. Without one, the downstream
 * preparation research pipeline refuses to run (research is gated on a
 * confirmed identity). So we fail loudly with a clear message rather than
 * ship half-configured preparation rows.
 */

import { db } from "@/lib/db"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { eq } from "drizzle-orm"
import { ensureEirForCandidate, walkEirToPhase } from "@/lib/khat-brain"
import type {
  PreparationContentFocus,
  PreparationGuestIdentity,
  PreparationInputs,
  PreparationToneType,
} from "@/types/preparation"
import type {
  KhatMapEpisodeCandidate,
  KhatMapGuestCandidate,
  KhatMapEpisodeType,
  KhatMapRiskLevel,
} from "@/types/khat-map"
import {
  getEpisodeCandidateById,
  getGuestCandidateById,
  getSeasonById,
  bumpAcceptedPattern,
  logFeedback,
  getTopicByAngleCode,
  markTopicUsed,
} from "@/lib/khat-map/core/queries"
import type { ConversionResult } from "./types"

// ─── Input ───────────────────────────────────────────────────────────────────

export interface ConvertEpisodeToPreparationInput {
  /** The Khat Map episode candidate to convert. */
  episode_candidate_id: string
  /** Admin user id (feedback + preparation.created_by). */
  admin_id: string
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function convertEpisodeToPreparation(
  input: ConvertEpisodeToPreparationInput,
): Promise<ConversionResult> {
  const candidate = await getEpisodeCandidateById(input.episode_candidate_id)
  if (!candidate) {
    return {
      ok: false,
      reason: "not_found",
      message: "لم يتم العثور على المرشح",
    }
  }

  // ── Idempotency ────────────────────────────────────────────────────────
  if (candidate.converted_preparation_id) {
    const existing = await db!
      .select({ id: episodePreparations.id, created_at: episodePreparations.created_at })
      .from(episodePreparations)
      .where(eq(episodePreparations.id, candidate.converted_preparation_id))
      .limit(1)
    if (existing[0]) {
      return {
        ok: true,
        created: false,
        was_existing: true,
        link: {
          kind: "episode_to_preparation",
          target_id: existing[0].id,
          href: `/admin/preparation/${existing[0].id}`,
          label: "إعداد مرتبط",
          converted_at:
            candidate.converted_at ??
            (existing[0].created_at instanceof Date
              ? existing[0].created_at.toISOString()
              : String(existing[0].created_at)),
        },
      }
    }
    // FK points at a preparation that no longer exists — fall through and
    // re-convert. The admin probably deleted the downstream record.
  }

  // ── Guest identity resolution ──────────────────────────────────────────
  let guest: KhatMapGuestCandidate | null = null
  if (candidate.suggested_guest_candidate_id) {
    guest = await getGuestCandidateById(candidate.suggested_guest_candidate_id)
  }
  if (!guest) {
    return {
      ok: false,
      reason: "missing_linked_guest",
      message:
        "اختر ضيفًا مقترحًا للحلقة قبل التحويل — الإعداد يحتاج هوية ضيف مؤكدة.",
    }
  }

  const season = await getSeasonById(candidate.season_id)
  const seasonLabel = season ? season.name : "خريطة خط"

  const identity = buildGuestIdentity(guest, input.admin_id, seasonLabel)
  const inputs = buildPreparationInputs(candidate, guest)

  // ── Khat Brain — ensure an EIR exists and walk it to "approved" ──────
  // The acceptance flow normally creates the EIR earlier, but we
  // re-run ensureEirForCandidate defensively so legacy approved-without-
  // EIR candidates also get one when they convert.
  const { eir } = await ensureEirForCandidate({
    candidate,
    guestId: candidate.suggested_guest_candidate_id,
    adminId: input.admin_id,
  })
  await walkEirToPhase({
    eirId: eir.id,
    toPhase: "approved",
    actorId: input.admin_id,
    reason: "convert_to_preparation",
  })

  // ── Insert the preparation ─────────────────────────────────────────────
  const [prep] = await db!
    .insert(episodePreparations)
    .values({
      title: inputs.title,
      guest_name: inputs.guest_name ?? guest.full_name,
      guest_description: inputs.guest_description ?? guest.bio,
      guest_profile_link: inputs.guest_profile_link,
      guest_identity: identity,
      short_description: inputs.short_description,
      episode_goal: inputs.episode_goal,
      key_questions: inputs.key_questions,
      tone_type: inputs.tone_type,
      focus_mode: inputs.focus_mode,
      expected_duration_min: inputs.expected_duration_min,
      depth_level: inputs.depth_level,
      boldness_level: inputs.boldness_level,
      content_focus: inputs.content_focus,
      inputs_meta: inputs.meta,
      sections_status: {},
      status: "draft",
      eir_id: eir.id,
      created_by: input.admin_id,
    })
    .returning()

  if (!prep) {
    return {
      ok: false,
      reason: "db_error",
      message: "فشل إنشاء سجل الإعداد",
    }
  }

  // ── Back-link + status update on the Khat Map candidate ───────────────
  await db!
    .update(
      (await import("@/lib/db/schema/khat-map")).khatMapEpisodeCandidates,
    )
    .set({
      converted_preparation_id: prep.id,
      converted_at: new Date(),
      status: "converted_to_preparation",
      updated_at: new Date(),
    })
    .where(
      eq(
        (await import("@/lib/db/schema/khat-map")).khatMapEpisodeCandidates.id,
        candidate.id,
      ),
    )

  // ── Khat Brain — advance EIR into research phase ─────────────────────
  // We walk to "researching" because the preparation row was just
  // created in status="draft" (research not yet done). Once the prep's
  // status flips to "reviewed" or "approved", the prep status-change
  // path will walk the EIR to "prepared".
  await walkEirToPhase({
    eirId: eir.id,
    toPhase: "researching",
    actorId: input.admin_id,
    reason: "preparation_created",
  })

  // ── Learning-layer reinforcement ──────────────────────────────────────
  await logFeedback({
    season_id: candidate.season_id,
    target_type: "episode_candidate",
    target_id: candidate.id,
    action: "accepted",
    reason_category: "other",
    reason_text: "converted_to_preparation",
    admin_id: input.admin_id,
  })

  // Reinforce the topic pattern that just shipped through.
  await bumpAcceptedPattern({
    pattern_type: "topic",
    pattern_text: candidate.working_title.slice(0, 200),
    category: candidate.episode_type,
    notes: "converted_to_preparation",
  })
  // And the guest archetype.
  if (guest.category) {
    await bumpAcceptedPattern({
      pattern_type: "guest_type",
      pattern_text: guest.category,
      category: candidate.episode_type,
      notes: "converted_guest_archetype",
    })
  }

  // Promote topic-bank freshness when an angle was used. Idempotent —
  // markTopicUsed has already been called if the season-end ordering ran.
  if (candidate.topic_angle_code) {
    const topic = await getTopicByAngleCode(candidate.topic_angle_code)
    if (topic) await markTopicUsed(topic.id, candidate.season_id)
  }

  // ── Phase X Step 4 — Preparation V2 hook ──────────────────────────
  // Default-on as of Cleanup Phase A. Enabling does NOT mutate any
  // legacy column; it only writes to episode_preparations.prep_v2.
  // Failure here does NOT abort the conversion — the legacy prep still
  // exists. Set PREP_V2_ENABLED=false to opt out (ops escape hatch).
  if (process.env.PREP_V2_ENABLED !== "false") {
    try {
      const { runPrepV2Pipeline } = await import("@/lib/preparation/v2/pipeline")
      const lang =
        (candidate as { language?: string }).language === "en" ? "en" : "ar"
      await runPrepV2Pipeline({
        preparationId: prep.id,
        language: lang as "ar" | "en",
      })
    } catch (err) {
      console.error("[prep-v2] pipeline failed (non-fatal):", err)
    }
  }

  return {
    ok: true,
    created: true,
    was_existing: false,
    link: {
      kind: "episode_to_preparation",
      target_id: prep.id,
      href: `/admin/preparation/${prep.id}`,
      label: "إعداد جديد",
      converted_at: new Date().toISOString(),
    },
  }
}

/**
 * Public helper — useful from the UI to avoid re-implementing the dup-check.
 * Returns null if the candidate has no converted preparation linked.
 */
export async function getPreparationLinkForCandidate(
  episode_candidate_id: string,
): Promise<{ preparation_id: string; href: string } | null> {
  const candidate = await getEpisodeCandidateById(episode_candidate_id)
  if (!candidate?.converted_preparation_id) return null
  return {
    preparation_id: candidate.converted_preparation_id,
    href: `/admin/preparation/${candidate.converted_preparation_id}`,
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

/** Map Khat Map risk_level to the 1–5 boldness scale used by preparation. */
function mapBoldness(risk: KhatMapRiskLevel | null): number {
  switch (risk) {
    case "safe":
      return 2
    case "medium":
      return 3
    case "bold":
      return 4
    case "highly_sensitive":
      return 5
    default:
      return 3
  }
}

/**
 * Derive a reasonable tone for the preparation from the Khat Map episode
 * type. This is a best-guess mapping — admin can override inside the
 * preparation editor. We bias toward deep/intellectual for Khat's identity.
 */
function mapTone(type: KhatMapEpisodeType): PreparationToneType {
  switch (type) {
    case "intellectual":
    case "historical":
    case "economic":
      return "intellectual"
    case "psychological":
    case "personal_story":
    case "inspirational":
    case "invasion":
      return "emotional"
    case "controversial":
      return "controversial"
    case "mass_audience":
      return "light"
    case "signature_khat":
    case "social":
    case "national":
    default:
      return "deep"
  }
}

/**
 * Map Khat Map episode type + invasion-angle tag to content_focus hints.
 * Admin will see these pre-selected in the preparation; they can edit.
 */
function mapContentFocus(
  type: KhatMapEpisodeType,
  isInvasion: boolean,
): PreparationContentFocus[] {
  const out = new Set<PreparationContentFocus>()
  if (isInvasion || type === "personal_story" || type === "psychological") {
    out.add("emotions")
    out.add("stories")
  }
  if (type === "intellectual" || type === "historical" || type === "economic") {
    out.add("ideas")
  }
  if (type === "controversial") {
    out.add("conflict")
  }
  if (type === "inspirational" || type === "mass_audience") {
    out.add("surprises")
  }
  if (type === "signature_khat" || type === "social" || type === "national") {
    out.add("ideas")
    out.add("stories")
  }
  if (out.size === 0) out.add("ideas")
  return [...out]
}

function pickProfileLink(guest: KhatMapGuestCandidate): string | null {
  // Prefer website, then first non-empty social, then first public link.
  if (guest.social_accounts?.website) return guest.social_accounts.website
  const socialOrder = ["youtube", "linkedin", "twitter", "instagram", "tiktok"] as const
  for (const k of socialOrder) {
    const v = guest.social_accounts?.[k]
    if (v) return v
  }
  const first = guest.public_links.find((l) => l.url?.trim())
  return first?.url ?? null
}

function buildGuestIdentity(
  guest: KhatMapGuestCandidate,
  adminId: string,
  seasonLabel: string,
): PreparationGuestIdentity {
  const profileLink = pickProfileLink(guest)
  return {
    name: guest.full_name,
    description:
      guest.bio && guest.bio.length > 0
        ? guest.bio.slice(0, 400)
        : guest.why_fit
          ? guest.why_fit.slice(0, 400)
          : `ضيف مقترح من خريطة خط — ${seasonLabel}`,
    source_provider: "manual",
    source_url: profileLink,
    source_title: `Khat Map — ${seasonLabel}`,
    avatar_url: null,
    profile_link: profileLink,
    confirmed_at: new Date().toISOString(),
    confirmed_by: adminId,
  }
}

function buildPreparationInputs(
  candidate: KhatMapEpisodeCandidate,
  guest: KhatMapGuestCandidate,
): PreparationInputs & { meta: NonNullable<PreparationInputs["meta"]> & Record<string, unknown> } {
  const shortDescriptionParts: string[] = []
  if (candidate.hook) shortDescriptionParts.push(candidate.hook)
  if (candidate.description) shortDescriptionParts.push(candidate.description)
  if (candidate.why_matters) shortDescriptionParts.push(`لماذا تهم: ${candidate.why_matters}`)
  if (candidate.why_now) shortDescriptionParts.push(`لماذا الآن: ${candidate.why_now}`)

  const isInvasion = candidate.episode_type === "invasion"

  // inputs_meta carries traceable lineage + structured Khat Map context so
  // anything on the preparation side can reach back to the originating plan.
  const meta = {
    language: "ar" as const,
    khat_map_source: {
      season_id: candidate.season_id,
      episode_candidate_id: candidate.id,
      guest_candidate_id: guest.id,
      episode_type: candidate.episode_type,
      topic_domain: candidate.topic_domain,
      topic_angle_code: candidate.topic_angle_code,
      risk_level: candidate.risk_level,
      effort_level: candidate.effort_level,
      sponsor_appeal: candidate.sponsor_appeal,
      converted_at: new Date().toISOString(),
    },
    khat_map_production_notes: candidate.production_notes ?? null,
    khat_map_main_axes: candidate.main_axes,
  }

  return {
    title: candidate.working_title,
    guest_name: guest.full_name,
    guest_description: guest.bio,
    guest_profile_link: pickProfileLink(guest),
    short_description: shortDescriptionParts.length
      ? shortDescriptionParts.join("\n\n").slice(0, 1200)
      : null,
    episode_goal: candidate.goal,
    key_questions: candidate.suggested_questions.slice(0, 20),
    tone_type: mapTone(candidate.episode_type),
    focus_mode: guest.full_name ? "hybrid" : "topic",
    expected_duration_min: null, // admin sets in the preparation studio
    depth_level: 4, // Khat defaults to deep
    boldness_level: mapBoldness(candidate.risk_level),
    content_focus: mapContentFocus(candidate.episode_type, isInvasion),
    meta,
  }
}
