/**
 * UX-11 — Worker-status warning.
 *
 * Server component. Probes the `jobs` table for discovery jobs that
 * are pending or running and OLDER than ~30 seconds. If any exist,
 * the worker is almost certainly not running (or is stuck). Surfaces
 * a clear actionable message instead of letting the discovery page
 * sit silent.
 */

import { AlertTriangle } from "lucide-react"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { jobs } from "@/lib/db/schema/jobs"
import { serviceOfflineHint } from "@/lib/operator-language"

const DISCOVERY_TYPES = [
  "discovery.seed_archetypes",
  "discovery.search_archetype",
  "discovery.verify_candidate",
  "discovery.rank_candidates",
]
const STALE_AFTER_MS = 30_000

export async function WorkerStatusWarning() {
  if (!db) return null
  const cutoff = new Date(Date.now() - STALE_AFTER_MS)
  try {
    const result = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM ${jobs}
      WHERE type = ANY(${DISCOVERY_TYPES})
        AND status IN ('pending', 'running')
        AND created_at < ${cutoff}
    `)
    const stuck =
      Number((result.rows[0] as { n?: number } | undefined)?.n ?? 0)
    if (stuck === 0) return null
    const hint = serviceOfflineHint("background_worker")!
    const isDev = process.env.NODE_ENV !== "production"
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
        <div className="mb-1 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-rose-200">
          <AlertTriangle className="h-3 w-3" />
          {hint.title}
        </div>
        <p className="text-[11.5px] leading-relaxed text-foreground/85">
          هناك {stuck} عملية اكتشاف في الانتظار. {hint.action}
        </p>
        {isDev && (
          <div className="mt-2 rounded-lg border border-rose-500/20 bg-background/40 p-2 text-[11px]">
            <div className="mb-1 text-muted-foreground">
              للمطوّرين — شغّل العامل في طرفيّة جديدة:
            </div>
            <code
              className="block select-all rounded bg-background/70 px-2 py-1 text-foreground"
              dir="ltr"
            >
              npm run worker
            </code>
          </div>
        )}
      </div>
    )
  } catch {
    return null
  }
}
