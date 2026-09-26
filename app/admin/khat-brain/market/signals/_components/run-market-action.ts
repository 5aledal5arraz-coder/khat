"use server"

/**
 * «تشغيل الآن» — start one market-intelligence run on demand.
 *
 * OWNER/ADMIN only (Khaled, 2026-09-26): the automatic daily run is off, and
 * a run costs AI spend. Delegates to `enqueueMarketRunNow` — the job worker
 * does the work; nothing runs inside this request. Operator-language only:
 * the internal job names never reach the UI.
 */

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import { enqueueMarketRunNow } from "@/lib/market-intelligence/run-now"

export interface RunMarketNowResult {
  ok: boolean
  status: "enqueued" | "already_in_flight" | "forbidden" | "error"
  message: string
}

export async function runMarketNowAction(): Promise<RunMarketNowResult> {
  const gate = await requireActionRole("ADMIN")
  if (!gate.ok) return { ok: false, status: "forbidden", message: gate.error }
  try {
    const r = await enqueueMarketRunNow()
    revalidatePath("/admin/khat-brain/market/signals")
    return r.status === "enqueued"
      ? {
          ok: true,
          status: "enqueued",
          message: "أُضيف التشغيل إلى قائمة الانتظار — ستظهر الإشارات الجديدة خلال دقائق.",
        }
      : {
          ok: true,
          status: "already_in_flight",
          message: "هناك تشغيل بانتظار دوره أو قيد التنفيذ الآن — لم يُضَف تشغيل ثانٍ.",
        }
  } catch (e) {
    console.error("[market run-now] enqueue failed:", e)
    return { ok: false, status: "error", message: "تعذّر بدء التشغيل. حاول مرة أخرى." }
  }
}
