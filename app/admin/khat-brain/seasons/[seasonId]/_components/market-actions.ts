"use server"

/**
 * Operator action: "تحديث الآن" for market intelligence.
 *
 * Delegates to `enqueueMarketRunNow` — the same single entry point the
 * «تشغيل الآن» button on /admin/khat-brain/market/signals uses, so the two
 * surfaces cannot drift. Idempotent: if a run is already pending or running,
 * the action is a no-op and the UI shows "refresh in progress" instead of
 * stacking duplicate jobs.
 *
 * ADMIN+ (was EDITOR): since 2026-09-26 a run happens only when someone
 * presses a button, and Khaled scoped that to OWNER/ADMIN. Both buttons
 * enqueue the same paid run, so they carry the same gate.
 */

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import { enqueueMarketRunNow } from "@/lib/market-intelligence/run-now"

export type RefreshMarketResult =
  | { ok: true; jobId: string; status: "enqueued" }
  | { ok: true; status: "already_in_flight" }
  | { ok: false; code: "server_error"; message: string }

export async function refreshMarketIntelligenceAction(input: {
  seasonId: string | null
}): Promise<RefreshMarketResult> {
  try {
    const gate = await requireActionRole("ADMIN")
    if (!gate.ok) {
      return { ok: false, code: "server_error", message: gate.error }
    }
    const r = await enqueueMarketRunNow()
    if (input.seasonId) {
      revalidatePath(`/admin/khat-brain/seasons/${input.seasonId}`)
    }
    return r.status === "enqueued"
      ? { ok: true, jobId: r.jobId, status: "enqueued" }
      : { ok: true, status: "already_in_flight" }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}
