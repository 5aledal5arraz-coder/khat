"use server"

/**
 * Phase 5 — Operator-triggered scoring refresh.
 *
 * Enqueues `market.score_signals` with `fullRescore=true`. Idempotent
 * — if a refresh is already in flight, returns the existing job id
 * instead of stacking duplicates.
 *
 * Operator-language only: never returns the internal job name. UI
 * presents this as "تحديث تقييم الإشارات".
 */

import { revalidatePath } from "next/cache"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/api-utils"
import { enqueueJob } from "@/lib/jobs/queue"

export interface RefreshScoringResult {
  ok: boolean
  status: "enqueued" | "already_in_flight" | "db_unavailable"
  message: string
}

export async function refreshScoringAction(): Promise<RefreshScoringResult> {
  await requireAdmin()
  if (!db) {
    return {
      ok: false,
      status: "db_unavailable",
      message: "قاعدة البيانات غير متاحة.",
    }
  }
  // Dedup against an in-flight scoring run.
  const inflight = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM jobs
    WHERE type = 'market.score_signals' AND status IN ('pending', 'running')
  `)
  const n = Number((inflight.rows[0] as { n?: number }).n ?? 0)
  if (n > 0) {
    return {
      ok: true,
      status: "already_in_flight",
      message: "عملية تحديث جارية بالفعل — ستظهر النتائج خلال دقائق.",
    }
  }
  await enqueueJob(
    "market.score_signals",
    { fullRescore: true },
    { priority: 5, maxAttempts: 1 },
  )
  revalidatePath("/admin/khat-brain/market/signals")
  return {
    ok: true,
    status: "enqueued",
    message: "بدأ تحديث تقييم الإشارات. ستظهر التحديثات خلال دقائق.",
  }
}
