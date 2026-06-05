/**
 * Stale EIR detection — production-readiness fix sprint #2.8.
 *
 * Surfaces EIRs that have been idle in the same phase for longer than
 * a threshold (default 48h). Operators see them on the Command Center
 * with the phase, the age, and the recommended next action so the
 * pipeline doesn't quietly stall.
 *
 * The query is cheap — one indexed scan on `episode_intelligence_records.updated_at`
 * filtered by phase. Terminal phases (`published`, `learned`, `archived`)
 * are intentionally excluded; idle there is normal.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import type { EpisodePhase } from "@/lib/db/schema/eir"
import { nextActionFor, type NextActionTone } from "./next-action"

export interface StaleEir {
  id: string
  working_title: string
  phase: EpisodePhase
  /** ISO timestamp of the last update. */
  updated_at: string
  /** Hours idle since the last update. */
  age_hours: number
  /** Operator-facing copy describing the recommended next action. */
  recommended_action: string
  recommended_href: string
  recommended_tone: NextActionTone
}

const STALE_THRESHOLD_HOURS = 48
const TERMINAL_PHASES: ReadonlyArray<EpisodePhase> = [
  "published",
  "learned",
  "archived",
]

export async function getStaleEirs(): Promise<StaleEir[]> {
  if (!db) return []

  const rows = await db.execute(sql`
    SELECT
      id,
      working_title,
      phase,
      updated_at,
      EXTRACT(EPOCH FROM (NOW() - updated_at)) / 3600.0 AS age_hours
    FROM episode_intelligence_records
    WHERE phase NOT IN (${sql.join(
      TERMINAL_PHASES.map((p) => sql`${p}`),
      sql`, `,
    )})
      AND updated_at < NOW() - (${STALE_THRESHOLD_HOURS}::int * INTERVAL '1 hour')
    ORDER BY updated_at ASC
    LIMIT 12
  `)

  return rows.rows.map((r) => {
    const row = r as {
      id: string
      working_title: string
      phase: EpisodePhase
      // `db.execute(sql)` returns timestamps as either Date or string
      // depending on the pg driver path. Normalize both shapes.
      updated_at: Date | string
      age_hours: string | number
    }
    const action = nextActionFor(row.phase)
    const ts =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString()
    return {
      id: row.id,
      working_title: row.working_title,
      phase: row.phase,
      updated_at: ts,
      age_hours: Math.round(Number(row.age_hours) * 10) / 10,
      recommended_action: action.label,
      recommended_href: action.href(row.id),
      recommended_tone: action.tone,
    }
  })
}
