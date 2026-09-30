/**
 * v2 cross-run memory — the discovery pipeline's "who we already know".
 *
 * Before proposing names, load:
 *   - every existing guest (already interviewed / in the CRM)
 *   - candidates the OPERATOR explicitly rejected (not pipeline rejects —
 *     a person who scored weakly for topic A may still fit topic B)
 *   - candidates already promoted to guests
 *   - names surfaced recently for the SAME season (soft "avoid repeating")
 *   - every candidate of ANOTHER run in the same season (or, with no season,
 *     created in the last DEDUPE_NO_SEASON_DAYS) — `otherRuns`, the card-side
 *     «مقترح في بحث آخر» hint (2026-09-30); it never excludes anyone
 *
 * Names feed the propose prompt as exclusions. After resolution two hard
 * filters apply: the Wikidata QID (stable across spellings) and a folded
 * name key (for the people Wikidata can't resolve — without it a
 * non-Wikidata ex-guest, respelled by the LLM, came straight back).
 *
 * All queries degrade gracefully — discovery must keep working even if
 * one source errors.
 */

import { and, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { guests } from "@/lib/db/schema/guests"
import { discoveryRuns, guestDiscoveryCandidates } from "@/lib/db/schema/discovery"
import { foldVerbatim } from "@/lib/studio/verbatim"
import { displayDiscoveryTopic } from "./topic"

export interface DiscoveryMemory {
  /** Hard exclusions: already a guest, promoted, or operator-rejected. */
  excludeNames: string[]
  /** Same set keyed by Wikidata QID — post-resolution hard filter. */
  excludeQids: Set<string>
  /**
   * Same set keyed by `discoveryNameKey()` — the hard filter for people
   * Wikidata can't resolve (most story guests). Uncapped, unlike
   * `excludeNames`, which is trimmed to fit the prompt.
   */
  excludeNameKeys: Set<string>
  /** Soft: surfaced in this season's recent runs — avoid unless uniquely strong. */
  recentlySurfacedNames: string[]
  /**
   * `discoveryNameKey` → the other run he is already a candidate in (newest
   * first). A hint for the card, never a filter. Optional: absent = unknown.
   */
  otherRuns?: Map<string, SeenInOtherRun>
}

export interface SeenInOtherRun {
  runId: string
  /** That run's topic, for the card («مقترح في بحث آخر: …»). */
  topic: string | null
}

/** Operator rejections carry this reason (set by the v2 reject action). */
const OPERATOR_REJECTION_REASON = "رفض المشغّل"

/**
 * Spelling-proof identity key for a name: the verbatim fold (hamza-alef,
 * taa-marbuta, alef-maqsura, tashkeel, punctuation) with every space
 * removed, so «ناصر سالمين», «ناصر  سالمين » and «ناصرسالمين» — and
 * «عبد الله» / «عبدالله» — collapse to one key. Exact-key only: no fuzzy
 * distance, so two different people never merge on a near-miss.
 */
export function discoveryNameKey(name: string | null | undefined): string {
  return foldVerbatim(name ?? "").replace(/ /g, "")
}

const RECENT_WINDOW_DAYS = 45
/** Without a season, «another run» means one from the last week. */
export const DEDUPE_NO_SEASON_DAYS = 7
const DEDUPE_CAP = 400

/**
 * Other runs' candidates keyed by folded name, skipping `currentRunId`.
 * Rows come newest first, so the first run seen for a key is kept. Pure.
 */
export function otherRunIndex(
  rows: Array<{ name: string | null; run_id: string | null; topic: string | null }>,
  currentRunId: string | null | undefined,
): Map<string, SeenInOtherRun> {
  const out = new Map<string, SeenInOtherRun>()
  for (const r of rows) {
    if (!r.run_id || r.run_id === currentRunId) continue
    const key = discoveryNameKey(r.name)
    if (!key || out.has(key)) continue
    out.set(key, { runId: r.run_id, topic: r.topic ? displayDiscoveryTopic(r.topic).trim() || null : null })
  }
  return out
}
const NAME_CAP = 80
const SOFT_CAP = 40

function v2Qid(platformSignals: unknown): string | null {
  const v2 = (platformSignals as { v2?: { qid?: unknown } } | null)?.v2
  return typeof v2?.qid === "string" ? v2.qid : null
}

export async function loadDiscoveryMemory(opts: {
  seasonId?: string | null
  /** This run — its own candidates are never «another run». */
  runId?: string | null
}): Promise<DiscoveryMemory> {
  const empty: DiscoveryMemory = {
    excludeNames: [],
    excludeQids: new Set(),
    excludeNameKeys: new Set(),
    recentlySurfacedNames: [],
    otherRuns: new Map(),
  }
  if (!db) return empty

  const [guestRows, actedRows, recentRows, otherRunRows] = await Promise.all([
    // Existing guests — the strongest exclusion (already interviewed).
    db
      .select({ name: guests.name })
      .from(guests)
      .limit(300)
      .catch(() => [] as Array<{ name: string }>),
    // Promoted or operator-rejected discovery candidates.
    db
      .select({
        name: guestDiscoveryCandidates.proposed_name,
        platform_signals: guestDiscoveryCandidates.platform_signals,
        status: guestDiscoveryCandidates.status,
        rejection_reason: guestDiscoveryCandidates.rejection_reason,
      })
      .from(guestDiscoveryCandidates)
      .where(
        sql`(${guestDiscoveryCandidates.status} = 'promoted' OR (${guestDiscoveryCandidates.status} = 'rejected' AND ${guestDiscoveryCandidates.rejection_reason} = ${OPERATOR_REJECTION_REASON}))`,
      )
      .limit(300)
      .catch(
        () =>
          [] as Array<{
            name: string | null
            platform_signals: unknown
            status: string
            rejection_reason: string | null
          }>,
      ),
    // Recently surfaced in this season (soft de-repeat).
    opts.seasonId
      ? db
          .select({
            name: guestDiscoveryCandidates.proposed_name,
            run_id: guestDiscoveryCandidates.discovery_run_id,
          })
          .from(guestDiscoveryCandidates)
          .where(
            and(
              isNotNull(guestDiscoveryCandidates.discovery_run_id),
              gte(
                guestDiscoveryCandidates.created_at,
                new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 3600 * 1000),
              ),
              sql`${guestDiscoveryCandidates.discovery_run_id} IN (
                SELECT id FROM discovery_runs WHERE season_id = ${opts.seasonId}
              )`,
            ),
          )
          .orderBy(desc(guestDiscoveryCandidates.created_at))
          .limit(120)
          .catch(() => [] as Array<{ name: string | null; run_id: string | null }>)
      : Promise.resolve([] as Array<{ name: string | null; run_id: string | null }>),
    // Every candidate of another run of this season (no season: the last
    // week) — the «مقترح في بحث آخر» hint. Any status: a hint, not a filter.
    db
      .select({
        name: guestDiscoveryCandidates.proposed_name,
        run_id: guestDiscoveryCandidates.discovery_run_id,
        topic: discoveryRuns.seed_prompt,
      })
      .from(guestDiscoveryCandidates)
      .innerJoin(discoveryRuns, eq(discoveryRuns.id, guestDiscoveryCandidates.discovery_run_id))
      .where(
        and(
          opts.runId ? ne(guestDiscoveryCandidates.discovery_run_id, opts.runId) : undefined,
          opts.seasonId
            ? eq(discoveryRuns.season_id, opts.seasonId)
            : gte(
                guestDiscoveryCandidates.created_at,
                new Date(Date.now() - DEDUPE_NO_SEASON_DAYS * 24 * 3600 * 1000),
              ),
        ),
      )
      .orderBy(desc(guestDiscoveryCandidates.created_at))
      .limit(DEDUPE_CAP)
      .catch((err: unknown) => {
        // A lost hint, not a lost run — but say so: silence reads as «no duplicates».
        console.warn("[discovery-v2/memory] other-run dedupe query failed:", err instanceof Error ? err.message : String(err))
        return [] as Array<{ name: string | null; run_id: string | null; topic: string | null }>
      }),
  ])

  const hardNames = new Set<string>()
  const qids = new Set<string>()
  for (const g of guestRows) {
    if (g.name?.trim()) hardNames.add(g.name.trim())
  }
  for (const r of actedRows) {
    if (r.name?.trim()) hardNames.add(r.name.trim())
    const qid = v2Qid(r.platform_signals)
    if (qid) qids.add(qid)
  }

  const soft = new Set<string>()
  for (const r of recentRows) {
    const n = r.name?.trim()
    if (n && !hardNames.has(n)) soft.add(n)
  }

  const nameKeys = new Set<string>()
  for (const n of hardNames) {
    const k = discoveryNameKey(n)
    if (k) nameKeys.add(k)
  }

  return {
    excludeNames: [...hardNames].slice(0, NAME_CAP),
    excludeQids: qids,
    excludeNameKeys: nameKeys,
    recentlySurfacedNames: [...soft].slice(0, SOFT_CAP),
    otherRuns: otherRunIndex(otherRunRows, opts.runId),
  }
}

// Re-export so callers (actions, handlers) share one literal.
export { OPERATOR_REJECTION_REASON }
