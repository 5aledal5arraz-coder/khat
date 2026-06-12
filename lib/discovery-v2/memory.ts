/**
 * v2 cross-run memory — the discovery pipeline's "who we already know".
 *
 * Before proposing names, load:
 *   - every existing guest (already interviewed / in the CRM)
 *   - candidates the OPERATOR explicitly rejected (not pipeline rejects —
 *     a person who scored weakly for topic A may still fit topic B)
 *   - candidates already promoted to guests
 *   - names surfaced recently for the SAME season (soft "avoid repeating")
 *
 * Names feed the propose prompt as exclusions; QIDs are a hard
 * post-resolution filter (the LLM can spell a name differently, but the
 * Wikidata QID is stable).
 *
 * All queries degrade gracefully — discovery must keep working even if
 * one source errors.
 */

import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { guests } from "@/lib/db/schema/guests"
import { guestDiscoveryCandidates } from "@/lib/db/schema/discovery"

export interface DiscoveryMemory {
  /** Hard exclusions: already a guest, promoted, or operator-rejected. */
  excludeNames: string[]
  /** Same set keyed by Wikidata QID — post-resolution hard filter. */
  excludeQids: Set<string>
  /** Soft: surfaced in this season's recent runs — avoid unless uniquely strong. */
  recentlySurfacedNames: string[]
}

/** Operator rejections carry this reason (set by the v2 reject action). */
const OPERATOR_REJECTION_REASON = "رفض المشغّل"

const RECENT_WINDOW_DAYS = 45
const NAME_CAP = 80
const SOFT_CAP = 40

function v2Qid(platformSignals: unknown): string | null {
  const v2 = (platformSignals as { v2?: { qid?: unknown } } | null)?.v2
  return typeof v2?.qid === "string" ? v2.qid : null
}

export async function loadDiscoveryMemory(opts: {
  seasonId?: string | null
}): Promise<DiscoveryMemory> {
  const empty: DiscoveryMemory = {
    excludeNames: [],
    excludeQids: new Set(),
    recentlySurfacedNames: [],
  }
  if (!db) return empty

  const [guestRows, actedRows, recentRows] = await Promise.all([
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

  return {
    excludeNames: [...hardNames].slice(0, NAME_CAP),
    excludeQids: qids,
    recentlySurfacedNames: [...soft].slice(0, SOFT_CAP),
  }
}

// Re-export so callers (actions, handlers) share one literal.
export { OPERATOR_REJECTION_REASON }
