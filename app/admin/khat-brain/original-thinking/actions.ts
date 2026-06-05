"use server"

import { revalidatePath } from "next/cache"
import { generateOriginalTopics } from "@/lib/original-thinking/generator"
import {
  markOriginalTopicConsumed,
  expireOldOriginalTopics,
} from "@/lib/original-thinking/bank"
import { requireAdmin } from "@/lib/api-utils"
import { generationReasonLabel } from "@/lib/operator-language"

export interface GenerateActionResult {
  ok: boolean
  accepted: number
  rejected: number
  message: string
  rejection_reasons?: Array<{ title: string; reasons: string[] }>
}

export async function generateOriginalTopicsAction(
  language: "ar" | "en" = "ar",
  count: number = 10,
): Promise<GenerateActionResult> {
  await requireAdmin()
  const r = await generateOriginalTopics({ language, count })
  revalidatePath("/admin/khat-brain/original-thinking")
  return {
    ok: r.ok,
    accepted: r.accepted.length,
    rejected: r.rejected.length,
    message: r.ok
      ? `أُنشئت ${r.accepted.length} موضوعًا (رُفض ${r.rejected.length}).`
      : generationReasonLabel("ai_failure"),
    rejection_reasons: r.rejected.slice(0, 5).map((rj) => ({
      title: rj.candidate.title,
      reasons: rj.reasons,
    })),
  }
}

export async function markConsumedAction(id: string): Promise<{ ok: boolean }> {
  await requireAdmin()
  const ok = await markOriginalTopicConsumed(id)
  revalidatePath("/admin/khat-brain/original-thinking")
  return { ok }
}

export async function expireOldAction(): Promise<{ expired: number }> {
  await requireAdmin()
  const r = await expireOldOriginalTopics()
  revalidatePath("/admin/khat-brain/original-thinking")
  return r
}
