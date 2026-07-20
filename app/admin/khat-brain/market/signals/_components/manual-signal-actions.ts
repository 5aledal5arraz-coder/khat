"use server"

/**
 * Phase 4 — Manual Signal server action.
 *
 * Thin wrapper. requireActionRole("EDITOR") → stamp actor → call mutation →
 * revalidate the review queue path. Never auto-fires.
 */

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import {
  createManualSignal,
  type ManualSignalInput,
  type ManualSignalResult,
} from "@/lib/market-intelligence/manual-signals"
import { enqueueJob } from "@/lib/jobs/queue"

export async function createManualSignalAction(
  input: ManualSignalInput,
): Promise<ManualSignalResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) {
    return { ok: false, error: "actor_required", message: gate.error }
  }
  const user = gate.user
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
