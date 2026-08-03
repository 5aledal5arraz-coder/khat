/**
 * The facts the AI generators need about ONE episode before they do anything:
 * which programme it belongs to, and which Episode Intelligence Record its
 * cost should be charged to.
 *
 * Both come from the same row, so they are read together — and they are read
 * HERE rather than at each generator, so a future bulk run inherits the same
 * gate and the same attribution instead of re-deriving either.
 *
 * `laneOfEpisode()` in ./programs.ts remains the single decision point for
 * lanes and is deliberately PURE — it takes an `Episode` that already carries
 * its category, which every caller so far got from a list fetched with
 * `withCategories: true`. The generators work from an episode id and no list,
 * so this is the db-touching adapter that hands it what it needs. It adds NO
 * classification of its own: change what a lane means in programs.ts and this
 * follows.
 *
 * Why not `getEpisodes({ withCategories: true })` and a find: that materialises
 * the whole archive (plus a possible YouTube call) to answer one question about
 * one row.
 */

import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getCategoryById } from "@/lib/queries/categories"
import { laneOfEpisode, DEFAULT_LANE, type ProgramLane } from "./programs"
import type { Episode } from "@/types/database"

export interface EpisodeGenerationContext {
  /**
   * Which programme this episode belongs to, or `null` when the episode row
   * does not exist. `null` is "I could not tell" — NOT خط — and callers must
   * not conflate them.
   *
   * An episode that EXISTS with no category resolves to خط, which is
   * `laneOfEpisode`'s deliberate default and is preserved here on purpose: a
   * freshly synced episode has `category_id = null` until an admin assigns
   * one, and refusing to work on a real episode because its paperwork is
   * incomplete would be hiding it behind a classification gap.
   */
  lane: ProgramLane | null
  /**
   * The episode's Episode Intelligence Record, for `ai_runs.eir_id`.
   *
   * Null for an episode never pushed through Khat Brain — that is a real
   * answer, not a failure. What matters is that it is READ AT RUN TIME: cost
   * rows are written the instant a call completes, and a row written with no
   * attribution can never be attributed afterwards. An unattributed batch is
   * telemetry lost for good, which is why this is resolved before the call
   * rather than reconciled after it.
   */
  eirId: string | null
}

export async function episodeGenerationContext(
  episodeId: string,
): Promise<EpisodeGenerationContext> {
  if (!db) return { lane: null, eirId: null }

  const rows = await db
    .select({ category_id: episodes.category_id, eir_id: episodes.eir_id })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1)
  if (!rows[0]) return { lane: null, eirId: null }

  const { category_id: categoryId, eir_id: eirId } = rows[0]
  if (!categoryId) return { lane: DEFAULT_LANE, eirId: eirId ?? null }

  const category = await getCategoryById(categoryId)
  return { lane: laneOfEpisode({ category } as Episode), eirId: eirId ?? null }
}
