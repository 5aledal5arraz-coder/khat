"use server"

/**
 * Operator action: "تحديث الآن" for market intelligence.
 *
 * Wraps the same internal job mechanism that the daily scheduler
 * uses — no separate code path. Idempotent: if a market.collect /
 * extract / cluster is already pending or running, the action is a
 * no-op and the UI shows "refresh in progress" instead of stacking
 * duplicate jobs.
 */

import { revalidatePath } from "next/cache"
import { sql } from "drizzle-orm"
import { requireActionRole } from "@/lib/api-utils"
import { db } from "@/lib/db"
import { enqueueJob } from "@/lib/jobs"

export type RefreshMarketResult =
  | { ok: true; jobId: string; status: "enqueued" }
  | { ok: true; status: "already_in_flight" }
  | { ok: false; code: "server_error"; message: string }

export async function refreshMarketIntelligenceAction(input: {
  seasonId: string | null
}): Promise<RefreshMarketResult> {
  try {
    const gate = await requireActionRole("EDITOR")
    if (!gate.ok) {
      return { ok: false, code: "server_error", message: gate.error }
    }
    if (!db) {
      return { ok: false, code: "server_error", message: "DB unavailable" }
    }
    // Dedup against any pipeline stage already pending/running.
    const inflight = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM jobs
      WHERE type IN (
        'market.collect',
        'market.extract',
        'market.cluster_signals'
      )
        AND status IN ('pending', 'running')
    `)
    const n = Number(
      (inflight.rows[0] as { n?: number } | undefined)?.n ?? 0,
    )
    if (n > 0) {
      if (input.seasonId) {
        revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
      }
      return { ok: true, status: "already_in_flight" }
    }
    const job = await enqueueJob(
      "market.collect",
      { scheduled: true },
      { priority: 8, maxAttempts: 1 },
    )
    if (input.seasonId) {
      revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    }
    return { ok: true, jobId: job.id, status: "enqueued" }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}
