/**
 * Performance sync — the bridge between the production pipeline and
 * Khat Map's editorial intelligence.
 *
 * For each converted episode candidate (status `converted_to_preparation`
 * or `converted_to_episode`), this resolves the chain
 *   khat_map_episode_candidate
 *     → episode_preparations.linked_episode_id
 *     → episodes.id
 * and snapshots whatever performance signals are available right now into
 * `khat_map_episode_performance`. Idempotent — re-running on the same
 * candidate updates the existing row.
 *
 * The sync runs on demand (admin click) and writes nothing if the
 * candidate hasn't reached a published episode yet.
 */

import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapEpisodeCandidates,
  khatMapEpisodePerformance,
} from "@/lib/db/schema/khat-map"
import { episodePreparations } from "@/lib/db/schema/preparation"
import {
  episodes,
  episodeQuotesConfig,
  episodeEnrichments,
} from "@/lib/db/schema/episodes"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import { composePerformanceScore } from "./composite"
import type {
  KhatMapEpisodePerformance,
  KhatMapDomainPerformance,
  KhatMapTopicDomain,
} from "@/types/khat-map"

type PerfRow = typeof khatMapEpisodePerformance.$inferSelect

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : v
}
function toIsoReq(v: Date | string | null | undefined): string {
  return toIso(v) ?? new Date().toISOString()
}

function mapPerf(row: PerfRow): KhatMapEpisodePerformance {
  return {
    id: row.id,
    candidate_id: row.candidate_id,
    episode_id: row.episode_id,
    preparation_id: row.preparation_id,
    episode_title: row.episode_title,
    youtube_url: row.youtube_url,
    release_date: row.release_date,
    duration_minutes: row.duration_minutes,
    view_count: row.view_count,
    quote_count: row.quote_count,
    has_enrichment: row.has_enrichment,
    has_chapters: row.has_chapters,
    has_clips: row.has_clips,
    like_count: row.like_count,
    comment_count: row.comment_count,
    retention_pct: row.retention_pct,
    performance_score: row.performance_score,
    topic_domain: row.topic_domain,
    episode_type: row.episode_type,
    topic_angle_code: row.topic_angle_code,
    guest_candidate_id: row.guest_candidate_id,
    synced_at: toIsoReq(row.synced_at),
  }
}

export interface SyncSeasonResult {
  /** How many candidates we walked. */
  walked: number
  /** Snapshots written (insert + update combined). */
  upserted: number
  /** Walked but skipped because the chain didn't resolve to a published episode. */
  not_yet_published: number
}

/**
 * Walk every converted candidate in a season and upsert performance rows.
 * Returns counters so the UI can show "synced X / Y".
 *
 * Idempotent — calling twice in a row produces no DB churn beyond
 * `synced_at` and any signals that changed (view_count, quote_count, etc).
 */
export async function syncSeasonPerformance(
  seasonId: string,
): Promise<SyncSeasonResult> {
  // 1. Pull every candidate that's reached the conversion gate. We
  //    intentionally include `approved` candidates in case the admin
  //    converted directly to an episode without going through prep.
  const cands = await db!
    .select()
    .from(khatMapEpisodeCandidates)
    .where(
      and(
        eq(khatMapEpisodeCandidates.season_id, seasonId),
        inArray(khatMapEpisodeCandidates.status, [
          "approved",
          "converted_to_preparation",
          "converted_to_episode",
        ]),
      ),
    )

  if (cands.length === 0) {
    return { walked: 0, upserted: 0, not_yet_published: 0 }
  }

  // 2. Resolve preparations + episodes for the candidates that have them.
  const prepIds = cands
    .map((c) => c.converted_preparation_id)
    .filter((x): x is string => !!x)
  const prepRows = prepIds.length
    ? await db!
        .select({
          id: episodePreparations.id,
          linked_episode_id: episodePreparations.linked_episode_id,
        })
        .from(episodePreparations)
        .where(inArray(episodePreparations.id, prepIds))
    : []
  const prepLinkedEpisode = new Map(
    prepRows.map((r) => [r.id, r.linked_episode_id]),
  )

  // 3. Pull every directly linked episode plus those reached via prep.
  const directEpisodeIds = cands
    .map((c) => c.converted_episode_id)
    .filter((x): x is string => !!x)
  const indirectEpisodeIds = prepRows
    .map((r) => r.linked_episode_id)
    .filter((x): x is string => !!x)
  const episodeIds = Array.from(
    new Set([...directEpisodeIds, ...indirectEpisodeIds]),
  )

  const episodeRows = episodeIds.length
    ? await db!
        .select({
          id: episodes.id,
          title: episodes.title,
          youtube_url: episodes.youtube_url,
          release_date: episodes.release_date,
          duration_minutes: episodes.duration_minutes,
          view_count: episodes.view_count,
        })
        .from(episodes)
        .where(inArray(episodes.id, episodeIds))
    : []
  const episodeById = new Map(episodeRows.map((r) => [r.id, r]))

  // 4. AI Studio surfaces — bulk-load to avoid N+1.
  const quoteRows = episodeIds.length
    ? await db!
        .select({
          episode_id: episodeQuotesConfig.episode_id,
          quotes: episodeQuotesConfig.quotes,
        })
        .from(episodeQuotesConfig)
        .where(inArray(episodeQuotesConfig.episode_id, episodeIds))
    : []
  const quoteCountByEpisode = new Map<string, number>()
  for (const r of quoteRows) {
    const arr = Array.isArray(r.quotes) ? r.quotes : []
    quoteCountByEpisode.set(r.episode_id, arr.length)
  }

  const enrichmentRows = episodeIds.length
    ? await db!
        .select({ episode_id: episodeEnrichments.episode_id })
        .from(episodeEnrichments)
        .where(inArray(episodeEnrichments.episode_id, episodeIds))
    : []
  const enrichmentSet = new Set(enrichmentRows.map((r) => r.episode_id))

  // Studio chapters + clips link to studioSessions, not episodes — for
  // now we use a soft heuristic: did ANY studio session for this episode
  // produce chapters/clips? We look up via studioSessions.episode_id.
  // Skip if the studio schema doesn't expose this directly — flags
  // remain false. This is the honest fallback.
  const chaptersByEpisode = new Set<string>()
  const clipsByEpisode = new Set<string>()
  if (episodeIds.length) {
    try {
      const { studioSessions } = await import("@/lib/db/schema/studio")
      const sessionRows = await db!
        .select({
          id: studioSessions.id,
          episode_id: studioSessions.episode_id,
        })
        .from(studioSessions)
        .where(inArray(studioSessions.episode_id, episodeIds))
      const sessionToEpisode = new Map<string, string>()
      for (const s of sessionRows) {
        if (s.episode_id) sessionToEpisode.set(s.id, s.episode_id)
      }
      const sessionIds = Array.from(sessionToEpisode.keys())
      if (sessionIds.length) {
        // Phase 5 — chapters/clips live on studio_analysis_records keyed by
        // (studio_session_id, kind). One query per kind, then map back.
        const ch = await db!
          .select({ session_id: studioAnalysisRecords.studio_session_id })
          .from(studioAnalysisRecords)
          .where(
            and(
              inArray(studioAnalysisRecords.studio_session_id, sessionIds),
              eq(studioAnalysisRecords.kind, "chapters"),
              eq(studioAnalysisRecords.status, "ready"),
            ),
          )
        for (const r of ch) {
          if (!r.session_id) continue
          const ep = sessionToEpisode.get(r.session_id)
          if (ep) chaptersByEpisode.add(ep)
        }
        const cl = await db!
          .select({ session_id: studioAnalysisRecords.studio_session_id })
          .from(studioAnalysisRecords)
          .where(
            and(
              inArray(studioAnalysisRecords.studio_session_id, sessionIds),
              eq(studioAnalysisRecords.kind, "clips"),
              eq(studioAnalysisRecords.status, "ready"),
            ),
          )
        for (const r of cl) {
          if (!r.session_id) continue
          const ep = sessionToEpisode.get(r.session_id)
          if (ep) clipsByEpisode.add(ep)
        }
      }
    } catch {
      // Studio schema unavailable in this environment — leave flags false.
    }
  }

  // 5. Snapshot rows.
  let upserted = 0
  let notYetPublished = 0
  for (const c of cands) {
    const episodeId =
      c.converted_episode_id ??
      (c.converted_preparation_id
        ? prepLinkedEpisode.get(c.converted_preparation_id) ?? null
        : null)

    if (!episodeId) {
      notYetPublished++
      continue
    }
    const ep = episodeById.get(episodeId)
    if (!ep) {
      notYetPublished++
      continue
    }

    const quote_count = quoteCountByEpisode.get(episodeId) ?? 0
    const has_enrichment = enrichmentSet.has(episodeId)
    const has_chapters = chaptersByEpisode.has(episodeId)
    const has_clips = clipsByEpisode.has(episodeId)
    const view_count = ep.view_count ?? null

    const performance_score = composePerformanceScore({
      view_count,
      quote_count,
      has_enrichment,
      has_chapters,
      has_clips,
      like_count: null,
      comment_count: null,
      retention_pct: null,
    })

    // Upsert keyed on candidate_id (UNIQUE INDEX guards against duplicates).
    await db!
      .insert(khatMapEpisodePerformance)
      .values({
        candidate_id: c.id,
        episode_id: episodeId,
        preparation_id: c.converted_preparation_id ?? null,
        episode_title: ep.title,
        youtube_url: ep.youtube_url,
        release_date: ep.release_date ? String(ep.release_date) : null,
        duration_minutes: ep.duration_minutes,
        view_count,
        quote_count,
        has_enrichment,
        has_chapters,
        has_clips,
        performance_score,
        topic_domain: c.topic_domain,
        episode_type: c.episode_type,
        topic_angle_code: c.topic_angle_code,
        guest_candidate_id: c.suggested_guest_candidate_id,
      })
      .onConflictDoUpdate({
        target: khatMapEpisodePerformance.candidate_id,
        set: {
          episode_id: episodeId,
          preparation_id: c.converted_preparation_id ?? null,
          episode_title: ep.title,
          youtube_url: ep.youtube_url,
          release_date: ep.release_date ? String(ep.release_date) : null,
          duration_minutes: ep.duration_minutes,
          view_count,
          quote_count,
          has_enrichment,
          has_chapters,
          has_clips,
          performance_score,
          topic_domain: c.topic_domain,
          episode_type: c.episode_type,
          topic_angle_code: c.topic_angle_code,
          guest_candidate_id: c.suggested_guest_candidate_id,
          synced_at: new Date(),
        },
      })
    upserted++

    // Khat Brain — when we have performance for an episode, walk the
    // linked EIR forward to "analyzing". Monotonic; no-op when the EIR
    // is already at analyzing/learned/archived.
    if (c.eir_id) {
      try {
        const { syncEirOnPerformanceWrite } = await import("@/lib/khat-brain")
        await syncEirOnPerformanceWrite({ eirId: c.eir_id })
      } catch (err) {
        console.error("[khat-brain] performance EIR sync failed:", err)
      }
    }
  }

  return { walked: cands.length, upserted, not_yet_published: notYetPublished }
}

/**
 * Read all performance rows for one season — UI consumer.
 */
export async function listSeasonPerformance(
  seasonId: string,
): Promise<KhatMapEpisodePerformance[]> {
  const rows = await db!
    .select({ p: khatMapEpisodePerformance })
    .from(khatMapEpisodePerformance)
    .innerJoin(
      khatMapEpisodeCandidates,
      eq(khatMapEpisodePerformance.candidate_id, khatMapEpisodeCandidates.id),
    )
    .where(eq(khatMapEpisodeCandidates.season_id, seasonId))
  return rows.map((r) => mapPerf(r.p))
}

/**
 * Aggregate per-domain performance — used by the batch-engine scorer.
 * Returns one row per domain that has at least one published episode.
 */
export async function getDomainPerformanceMap(): Promise<
  Map<KhatMapTopicDomain, KhatMapDomainPerformance>
> {
  const rows = await db!
    .select({
      domain: khatMapEpisodePerformance.topic_domain,
      count: sql<number>`count(*)::int`,
      avg_perf: sql<number | null>`avg(${khatMapEpisodePerformance.performance_score})::real`,
      avg_views: sql<number | null>`avg(${khatMapEpisodePerformance.view_count})::real`,
    })
    .from(khatMapEpisodePerformance)
    .where(sql`${khatMapEpisodePerformance.topic_domain} IS NOT NULL`)
    .groupBy(khatMapEpisodePerformance.topic_domain)
  const out = new Map<KhatMapTopicDomain, KhatMapDomainPerformance>()
  for (const r of rows) {
    if (!r.domain) continue
    out.set(r.domain as KhatMapTopicDomain, {
      domain: r.domain as KhatMapTopicDomain,
      episodes_count: Number(r.count) || 0,
      avg_performance:
        r.avg_perf === null ? 0 : Math.max(0, Math.min(1, Number(r.avg_perf))),
      avg_views: r.avg_views === null ? null : Number(r.avg_views),
    })
  }
  return out
}

/**
 * Per-candidate performance lookup — used by the taste-recompute walker
 * to weight each accept decision by its eventual outcome.
 */
export async function getPerformanceByCandidateIds(
  ids: string[],
): Promise<Map<string, KhatMapEpisodePerformance>> {
  if (ids.length === 0) return new Map()
  const rows = await db!
    .select()
    .from(khatMapEpisodePerformance)
    .where(inArray(khatMapEpisodePerformance.candidate_id, ids))
  const out = new Map<string, KhatMapEpisodePerformance>()
  for (const r of rows) out.set(r.candidate_id, mapPerf(r))
  return out
}
