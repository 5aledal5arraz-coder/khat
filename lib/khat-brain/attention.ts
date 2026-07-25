/**
 * The `/admin/ops` attention queue — ONE row per episode.
 *
 * WHY THIS EXISTS
 * ---------------
 * The home page used to render two independently-sourced lists over the same
 * table: «ما الذي يحتاج انتباهك الآن؟» from `getRecentActiveEirs()` (the 10
 * most recently touched EIRs — which INCLUDES stalled ones) and «حلقات
 * متوقفة» from `getStaleEirs()` (a subset of exactly those). Any episode that
 * was both active and stalled appeared twice on one screen, with two
 * different call-to-action buttons pointing at the same place. An operator
 * counting their workload counted it twice.
 *
 * The merge lives here, as a pure function, so "no episode appears twice" is
 * a unit-tested property rather than something the JSX happens to get right.
 *
 * The stalled flag is carried ON the item instead of splitting the list
 * again: being stalled is an ATTRIBUTE of an episode that needs attention,
 * not a separate kind of work.
 */

import type { EpisodePhase } from "@/lib/db/schema/eir"
import type { StaleEir } from "./staleness"
import { nextActionFor, type NextAction } from "./next-action"

/** The minimum an episode must expose to be placed in the queue. */
export interface AttentionEir {
  id: string
  working_title: string
  phase: EpisodePhase
  updated_at: string
}

export interface AttentionItem<T extends AttentionEir = AttentionEir> {
  eir: T
  action: NextAction
  href: string
  /**
   * Non-null when this episode is ALSO stalled (>48h in the same phase).
   * The row renders a badge; it does not get a second card.
   */
  stalled: { ageHours: number } | null
}

/** Default cap. Matches what the home page rendered before the merge. */
export const ATTENTION_QUEUE_LIMIT = 8

/**
 * Order:
 *   1. action priority   — phase urgency, the existing contract.
 *   2. stalled first     — between two episodes needing the same action, the
 *                          neglected one is the one the operator should see.
 *   3. within stalled    — longest idle first (most neglected on top).
 *      within the rest   — most recently touched first (today's work surfaces).
 */
function compareAttention(a: AttentionItem, b: AttentionItem): number {
  if (a.action.priority !== b.action.priority) {
    return a.action.priority - b.action.priority
  }
  const aStalled = a.stalled !== null
  const bStalled = b.stalled !== null
  if (aStalled !== bStalled) return aStalled ? -1 : 1
  const at = Date.parse(a.eir.updated_at)
  const bt = Date.parse(b.eir.updated_at)
  return aStalled ? at - bt : bt - at
}

/**
 * Merge the recent-active list and the stale list into one deduped queue.
 *
 * Keyed by `eir.id`, so an episode present in BOTH sources yields exactly one
 * item — carrying the stalled badge.
 *
 * A stale episode that is NOT in `recent` is still included. `recent` is the
 * top-10 by recency while `stale` is ordered oldest-first, so the two lists
 * genuinely diverge; dropping the difference would have made deleting the
 * separate «حلقات متوقفة» section a loss of information rather than a fix.
 *
 * `limit` is a cap on the CALM items only — stalled episodes are never
 * truncated away. The section this replaced always showed every stalled
 * episode it found, and that guarantee survives the merge; without it a busy
 * queue could silently push a month-old stall off the page.
 */
export function buildAttentionQueue<T extends AttentionEir>({
  recent,
  stale,
  limit = ATTENTION_QUEUE_LIMIT,
}: {
  recent: T[]
  stale: StaleEir[]
  limit?: number
}): Array<AttentionItem<T>> {
  const staleById = new Map(stale.map((s) => [s.id, s]))
  const byId = new Map<string, AttentionItem<T>>()

  const add = (eir: T) => {
    // First writer wins: `recent` carries the canonical row, and a duplicate
    // id must never overwrite it with a second card.
    if (byId.has(eir.id)) return
    const action = nextActionFor(eir.phase)
    const s = staleById.get(eir.id)
    byId.set(eir.id, {
      eir,
      action,
      href: action.href(eir.id),
      stalled: s ? { ageHours: s.age_hours } : null,
    })
  }

  for (const eir of recent) add(eir)
  // Stale rows expose the same four fields, so an episode missing from
  // `recent` can still be represented faithfully.
  for (const s of stale) {
    add({
      id: s.id,
      working_title: s.working_title,
      phase: s.phase,
      updated_at: s.updated_at,
    } as unknown as T)
  }

  const sorted = Array.from(byId.values()).sort(compareAttention)
  const stalled = sorted.filter((i) => i.stalled !== null)
  const calm = sorted.filter((i) => i.stalled === null)
  return [...stalled, ...calm.slice(0, Math.max(0, limit - stalled.length))].sort(
    compareAttention,
  )
}
