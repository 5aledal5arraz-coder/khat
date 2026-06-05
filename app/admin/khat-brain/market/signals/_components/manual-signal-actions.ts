"use server"

/**
 * Phase 4 — Manual Signal server action.
 *
 * Thin wrapper. requireAdmin → stamp actor → call mutation →
 * revalidate the review queue path. Never auto-fires.
 */

import { revalidatePath } from "next/cache"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import {
  createManualSignal,
  type ManualSignalInput,
  type ManualSignalResult,
} from "@/lib/market-intelligence/manual-signals"
import { enqueueJob } from "@/lib/jobs/queue"

export async function createManualSignalAction(
  input: ManualSignalInput,
): Promise<ManualSignalResult> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user?.id) {
    return {
      ok: false,
      error: "actor_required",
      message: "يلزم تسجيل دخول مشغّل.",
    }
  }
  const r = await createManualSignal(input, { actorId: user.id })
  if (r.ok) {
    // Enqueue scoring so the new row gets a signal_score on the next
    // page refresh. Best-effort — failure to enqueue doesn't block.
    try {
      await enqueueJob(
        "market.score_signals",
        { scheduled: false },
        { priority: 5, maxAttempts: 1 },
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn("[manual-signal-action] score enqueue failed:", msg)
    }
  }
  revalidatePath("/admin/khat-brain/market/signals")
  return r
}
