/**
 * Discovery → Khat Map bridge.
 *
 * The discovery pipeline produces rows in `guest_discovery_candidates`
 * and promotion creates canonical `guests` rows. The Khat Map editorial
 * wizard, however, drives episode-candidate conversion off
 * `khat_map_guest_candidates.suggested_guest_candidate_id`. Those two
 * worlds were not linked, so a promoted discovery guest could not be
 * used to unblock the season-level "Convert N episodes" button.
 *
 * This module is the bridge:
 *
 *   bridgeDiscoveryToKhatMap({ discoveryCandidateId, globalGuestId, eirId })
 *
 * It is idempotent. If a `khat_map_guest_candidate` already exists for
 * the same `(season_id, linked_guest_id)` pair, it is reused. Otherwise
 * a new one is created, prefilled from the global guest's identity +
 * the discovery candidate's evidence. When an `eirId` is supplied AND
 * the EIR is sourced from a Khat Map episode candidate, the bridge also
 * sets `khat_map_episode_candidates.suggested_guest_candidate_id` so the
 * convert-to-preparation flow becomes eligible.
 *
 * Audit trail is preserved at every hop:
 *   guest_discovery_candidates → guest_discovery_links → guests
 *                                                     → guest_identity_profiles
 *                                                     → khat_map_guest_candidates (via linked_guest_id)
 *                                                     → khat_map_episode_candidates.suggested_guest_candidate_id
 */

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  guestDiscoveryCandidates,
  discoveryRuns,
} from "@/lib/db/schema/discovery"
import {
  khatMapGuestCandidates,
  khatMapEpisodeCandidates,
} from "@/lib/db/schema/khat-map"
import { guests } from "@/lib/db/schema/guests"
import { guestIdentityProfiles } from "@/lib/db/schema/guest-identity"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import type { KhatMapGuestPublicLink, KhatMapGuestSocialAccounts } from "@/types/khat-map"

export interface BridgeInput {
  /**
   * Optional. When supplied, the bridge resolves season_id and may copy
   * evidence URLs from the discovery candidate.
   */
  discoveryCandidateId?: string | null
  /** Canonical guest id to bridge — REQUIRED. */
  globalGuestId: string
  /**
   * Optional EIR id. If the EIR was created from a Khat Map episode
   * candidate (editorial_intent.source_id is set), the bridge will also
   * attach the khat_map_guest_candidate to that episode candidate so
   * convert-to-preparation unblocks.
   */
  eirId?: string | null
  /**
   * When neither discoveryCandidateId nor eirId resolves a season, the
   * caller may pass season_id directly (e.g. manual assign-guest flow).
   */
  seasonId?: string | null
}

export interface BridgeResult {
  ok: boolean
  reason?:
    | "no_season"
    | "guest_not_found"
    | "khat_episode_not_linked"
    | "insert_failed"
  khat_guest_candidate_id: string | null
  khat_guest_candidate_created: boolean
  khat_episode_candidate_id: string | null
  attached_to_episode: boolean
  message?: string
}

/**
 * Run the discovery → khat-map bridge.
 *
 * Idempotent — repeat invocations with the same `(season, guest)` reuse
 * the existing row.
 */
export async function bridgeDiscoveryToKhatMap(
  input: BridgeInput,
): Promise<BridgeResult> {
  const empty: BridgeResult = {
    ok: false,
    khat_guest_candidate_id: null,
    khat_guest_candidate_created: false,
    khat_episode_candidate_id: null,
    attached_to_episode: false,
  }

  // ── Resolve season ───────────────────────────────────────────────
  let seasonId: string | null = input.seasonId ?? null
  if (!seasonId && input.discoveryCandidateId) {
    const [cand] = await db!
      .select({ run_id: guestDiscoveryCandidates.discovery_run_id })
      .from(guestDiscoveryCandidates)
      .where(eq(guestDiscoveryCandidates.id, input.discoveryCandidateId))
      .limit(1)
    if (cand?.run_id) {
      const [run] = await db!
        .select({ season_id: discoveryRuns.season_id })
        .from(discoveryRuns)
        .where(eq(discoveryRuns.id, cand.run_id))
        .limit(1)
      seasonId = run?.season_id ?? null
    }
  }
  if (!seasonId && input.eirId) {
    const [eir] = await db!
      .select({ season_id: episodeIntelligenceRecords.season_id })
      .from(episodeIntelligenceRecords)
      .where(eq(episodeIntelligenceRecords.id, input.eirId))
      .limit(1)
    seasonId = eir?.season_id ?? null
  }
  if (!seasonId) {
    return {
      ...empty,
      reason: "no_season",
      message:
        "تعذّر تحديد الموسم — لم يكن لقرار الاكتشاف أو الحلقة ارتباط بموسم خط مابا.",
    }
  }

  // ── Load the global guest (identity + bio) ────────────────────────
  const [guest] = await db!
    .select()
    .from(guests)
    .where(eq(guests.id, input.globalGuestId))
    .limit(1)
  if (!guest) {
    return {
      ...empty,
      reason: "guest_not_found",
      message: "الضيف العالمي غير موجود.",
    }
  }
  const [identity] = await db!
    .select()
    .from(guestIdentityProfiles)
    .where(eq(guestIdentityProfiles.guest_id, input.globalGuestId))
    .limit(1)

  // ── Dedup: existing khat_map_guest_candidate for (season, guest) ─
  const [existing] = await db!
    .select()
    .from(khatMapGuestCandidates)
    .where(
      and(
        eq(khatMapGuestCandidates.season_id, seasonId),
        eq(khatMapGuestCandidates.linked_guest_id, input.globalGuestId),
      ),
    )
    .limit(1)

  let khatGuestCandidateId: string
  let created = false
  if (existing) {
    khatGuestCandidateId = existing.id
  } else {
    // Build identity payload from the global guest + identity profile.
    const externalLinks = (guest.external_links ?? {}) as Record<string, string>
    const social: KhatMapGuestSocialAccounts = {}
    const publicLinks: KhatMapGuestPublicLink[] = []
    for (const [platform, url] of Object.entries(externalLinks)) {
      if (!url) continue
      // Map well-known platform keys onto the Khat Map social schema.
      // Anything outside that vocabulary becomes a public_link entry.
      if (
        platform === "twitter" ||
        platform === "instagram" ||
        platform === "youtube" ||
        platform === "linkedin" ||
        platform === "tiktok" ||
        platform === "website" ||
        platform === "podcast"
      ) {
        ;(social as Record<string, string>)[platform] = url
      } else {
        publicLinks.push({ platform, url, label: platform })
      }
    }

    // Pull evidence summary from identity profile when present.
    let evidenceSummary: string | null = null
    let officialWebsite: string | null = social.website ?? null
    if (identity) {
      const ev = (identity.discovery_evidence ?? {}) as {
        urls?: Array<{ platform?: string; url?: string }>
      }
      if (Array.isArray(ev.urls)) {
        for (const u of ev.urls) {
          if (!u.url) continue
          if (
            u.platform === "google_web" &&
            !officialWebsite &&
            /^https?:\/\//.test(u.url)
          ) {
            officialWebsite = u.url
          }
        }
      }
      if (typeof identity.story_arcs === "object" && identity.story_arcs) {
        const arcs = (identity.story_arcs as { arcs?: string[] }).arcs
        if (Array.isArray(arcs) && arcs.length > 0) {
          evidenceSummary = arcs.slice(0, 4).join(" · ")
        }
      }
    }

    // Phase B redesign — copy the per-episode rationale produced by the
    // verifier so the assigned-guest card can render "لماذا يناسب هذه
    // الحلقة". The discovery candidate row owns this; we pull it
    // through when bridging to khat_map.
    let topicFitRationale: string | null = null
    if (input.discoveryCandidateId) {
      const [discCand] = await db!
        .select({
          topic_fit_rationale: guestDiscoveryCandidates.topic_fit_rationale,
        })
        .from(guestDiscoveryCandidates)
        .where(eq(guestDiscoveryCandidates.id, input.discoveryCandidateId))
        .limit(1)
      topicFitRationale = discCand?.topic_fit_rationale ?? null
    }

    const bio = guest.bio ?? null
    const [inserted] = await db!
      .insert(khatMapGuestCandidates)
      .values({
        season_id: seasonId,
        status: "approved",
        full_name: guest.name,
        display_name: guest.name,
        bio,
        why_fit: identity?.suggested_angles?.[0] ?? null,
        topic_fit_rationale: topicFitRationale,
        gender: "unknown",
        public_links: publicLinks,
        social_accounts: social,
        official_website: officialWebsite,
        evidence_summary: evidenceSummary,
        evidence_citations: [],
        risk_flags: [],
        quality: "normal",
        linked_guest_id: input.globalGuestId,
      })
      .returning({ id: khatMapGuestCandidates.id })
    if (!inserted) {
      return {
        ...empty,
        reason: "insert_failed",
        message: "فشل إنشاء سجل المرشّح في خريطة خط.",
      }
    }
    khatGuestCandidateId = inserted.id
    created = true
  }

  // ── Attach to the EIR's source episode candidate (if any) ────────
  let episodeCandidateId: string | null = null
  let attached = false
  if (input.eirId) {
    const [eir] = await db!
      .select({
        editorial_intent: episodeIntelligenceRecords.editorial_intent,
      })
      .from(episodeIntelligenceRecords)
      .where(eq(episodeIntelligenceRecords.id, input.eirId))
      .limit(1)
    const sourceId =
      ((eir?.editorial_intent ?? {}) as { source_id?: string | null })
        .source_id ?? null
    if (sourceId) {
      // Verify the episode candidate is in the same season + not already
      // linked to a different guest_candidate (don't silently overwrite).
      const [cand] = await db!
        .select({
          id: khatMapEpisodeCandidates.id,
          season_id: khatMapEpisodeCandidates.season_id,
          suggested: khatMapEpisodeCandidates.suggested_guest_candidate_id,
        })
        .from(khatMapEpisodeCandidates)
        .where(eq(khatMapEpisodeCandidates.id, sourceId))
        .limit(1)
      if (cand && cand.season_id === seasonId) {
        episodeCandidateId = cand.id
        if (!cand.suggested || cand.suggested === khatGuestCandidateId) {
          await db!
            .update(khatMapEpisodeCandidates)
            .set({
              suggested_guest_candidate_id: khatGuestCandidateId,
              updated_at: new Date(),
            })
            .where(eq(khatMapEpisodeCandidates.id, cand.id))
          attached = true
        }
      }
    }
  }

  return {
    ok: true,
    khat_guest_candidate_id: khatGuestCandidateId,
    khat_guest_candidate_created: created,
    khat_episode_candidate_id: episodeCandidateId,
    attached_to_episode: attached,
    reason: !attached && input.eirId ? "khat_episode_not_linked" : undefined,
    message: created
      ? "تم إنشاء سجل المرشّح في خريطة خط."
      : "أُعيد استخدام سجل مرشّح موجود.",
  }
}
