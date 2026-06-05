/**
 * Conversion history query.
 *
 * Produces a unified, sorted list of every conversion event inside a
 * season:
 *   - episode candidates that became preparations (join to
 *     `episodePreparations` for downstream status)
 *   - guest candidates that became global guest candidates (join to
 *     `guestCandidates` for downstream status)
 *
 * Research-snapshot attachments are NOT included here because they don't
 * belong to a season in the same 1:1 way — they're cross-cutting. A
 * future enhancement can expose them via a separate view if needed.
 */

import { db } from "@/lib/db"
import { eq, desc, isNotNull, and } from "drizzle-orm"
import {
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
} from "@/lib/db/schema/khat-map"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { guestCandidates } from "@/lib/db/schema/guest-candidates"
import type { ConversionHistoryRow } from "./types"

export async function listSeasonConversions(
  seasonId: string,
): Promise<ConversionHistoryRow[]> {
  if (!db) return []

  // Episode → preparation conversions
  const episodeRows = await db
    .select({
      source_id: khatMapEpisodeCandidates.id,
      source_title: khatMapEpisodeCandidates.working_title,
      target_id: khatMapEpisodeCandidates.converted_preparation_id,
      converted_at: khatMapEpisodeCandidates.converted_at,
      prep_status: episodePreparations.status,
      prep_title: episodePreparations.title,
      prep_linked_episode: episodePreparations.linked_episode_id,
    })
    .from(khatMapEpisodeCandidates)
    .leftJoin(
      episodePreparations,
      eq(
        khatMapEpisodeCandidates.converted_preparation_id,
        episodePreparations.id,
      ),
    )
    .where(
      and(
        eq(khatMapEpisodeCandidates.season_id, seasonId),
        isNotNull(khatMapEpisodeCandidates.converted_preparation_id),
      ),
    )
    .orderBy(desc(khatMapEpisodeCandidates.converted_at))

  // Guest → global candidate conversions
  const guestRows = await db
    .select({
      source_id: khatMapGuestCandidates.id,
      source_name: khatMapGuestCandidates.full_name,
      target_id: khatMapGuestCandidates.converted_to_guest_candidate_id,
      converted_at: khatMapGuestCandidates.converted_at,
      global_status: guestCandidates.status,
      global_name: guestCandidates.full_name,
    })
    .from(khatMapGuestCandidates)
    .leftJoin(
      guestCandidates,
      eq(
        khatMapGuestCandidates.converted_to_guest_candidate_id,
        guestCandidates.id,
      ),
    )
    .where(
      and(
        eq(khatMapGuestCandidates.season_id, seasonId),
        isNotNull(khatMapGuestCandidates.converted_to_guest_candidate_id),
      ),
    )
    .orderBy(desc(khatMapGuestCandidates.converted_at))

  const out: ConversionHistoryRow[] = []

  for (const r of episodeRows) {
    if (!r.target_id) continue
    out.push({
      kind: "episode_to_preparation",
      source_id: r.source_id,
      source_title: r.source_title,
      source_type: "episode_candidate",
      target_id: r.target_id,
      target_label: r.prep_title ?? "إعداد",
      target_href: `/admin/preparation/${r.target_id}`,
      downstream_status: r.prep_status,
      // "Reached recording" signal: the preparation has a linked_episode_id.
      downstream_stage: r.prep_linked_episode ? "linked_to_episode" : null,
      converted_at: toIso(r.converted_at),
    })
  }

  for (const r of guestRows) {
    if (!r.target_id) continue
    out.push({
      kind: "guest_to_candidate",
      source_id: r.source_id,
      source_title: r.source_name,
      source_type: "guest_candidate",
      target_id: r.target_id,
      target_label: r.global_name ?? r.source_name,
      target_href: `/admin/guest-candidates/${r.target_id}`,
      downstream_status: r.global_status,
      downstream_stage: null,
      converted_at: toIso(r.converted_at),
    })
  }

  // Sort by converted_at desc
  out.sort((a, b) => b.converted_at.localeCompare(a.converted_at))
  return out
}

function toIso(v: Date | string | null | undefined): string {
  if (!v) return new Date().toISOString()
  return v instanceof Date ? v.toISOString() : String(v)
}
