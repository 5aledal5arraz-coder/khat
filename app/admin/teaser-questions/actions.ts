"use server"

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import { updateQuestionStatus } from "@/lib/teaser"
import type { TeaserQuestionStatus } from "@/types/teaser"

type ActionResult = { success: boolean; error?: string }

/**
 * Moderation writes for `/admin/teaser-questions`.
 *
 * THREE actions and no more: قبول · رفض · تراجع. There is no delete and no
 * edit — a visitor's words are not ours to rewrite, and «تراجع» (back to
 * `pending`) is what keeps a mis-click from being final. All three write the
 * `status` column and nothing else; the table has no audit columns and adding
 * them is out of scope.
 *
 * Same gate as every other teaser mutation: `requireActionRole("EDITOR")`, so a
 * VIEWER session is refused server-side even if it reaches the action directly
 * (the buttons are also hidden for VIEWER, but that is UI, not a gate).
 */
async function setStatus(
  questionId: string,
  status: TeaserQuestionStatus,
): Promise<ActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }

  if (!questionId) return { success: false, error: "معرّف السؤال مفقود" }

  const updated = await updateQuestionStatus(questionId, status)
  if (!updated) return { success: false, error: "السؤال غير موجود" }

  // Both the review page AND the home inbox counter read this row.
  revalidatePath("/admin/teaser-questions")
  revalidatePath("/admin/ops")
  revalidatePath("/admin/home-content")
  return { success: true }
}

export async function approveQuestionAction(questionId: string): Promise<ActionResult> {
  return setStatus(questionId, "approved")
}

export async function rejectQuestionAction(questionId: string): Promise<ActionResult> {
  return setStatus(questionId, "rejected")
}

/** «تراجع» — send a question back to the pending queue. */
export async function resetQuestionAction(questionId: string): Promise<ActionResult> {
  return setStatus(questionId, "pending")
}
