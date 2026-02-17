"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/api-utils"
import {
  createTeaser,
  updateTeaser,
  deleteTeaser,
  activateTeaser,
  deactivateTeaser,
  updateQuestionStatus,
  deleteQuestion,
  getAllQuestions,
} from "@/lib/teaser"

function revalidateAll() {
  revalidatePath("/")
  revalidatePath("/admin/home-content")
}

export async function createTeaserAction(formData: FormData) {
  await requireAdmin()

  const guestName = formData.get("guestName") as string
  const title = (formData.get("title") as string) || "اسأل الضيف"
  const prompt = (formData.get("prompt") as string) || "اكتب سؤالك للضيف"
  const videoFilename = formData.get("videoFilename") as string
  const posterImage = (formData.get("posterImage") as string) || null
  const publishAt = (formData.get("publishAt") as string) || null
  const expireAt = (formData.get("expireAt") as string) || null

  if (!guestName || !videoFilename) {
    return { success: false, error: "اسم الضيف والفيديو مطلوبان" }
  }

  await createTeaser({ guestName, title, prompt, videoFilename, posterImage, publishAt, expireAt })
  revalidateAll()
  return { success: true }
}

export async function updateTeaserAction(id: string, formData: FormData) {
  await requireAdmin()

  const guestName = formData.get("guestName") as string
  const title = formData.get("title") as string
  const prompt = formData.get("prompt") as string
  const posterImage = (formData.get("posterImage") as string) || null
  const publishAt = (formData.get("publishAt") as string) || null
  const expireAt = (formData.get("expireAt") as string) || null

  const updated = await updateTeaser(id, { guestName, title, prompt, posterImage, publishAt, expireAt })
  if (!updated) return { success: false, error: "التيزر غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function deleteTeaserAction(id: string) {
  await requireAdmin()
  const deleted = await deleteTeaser(id)
  if (!deleted) return { success: false, error: "التيزر غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function activateTeaserAction(id: string) {
  await requireAdmin()
  const activated = await activateTeaser(id)
  if (!activated) return { success: false, error: "التيزر غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function deactivateTeaserAction(id: string) {
  await requireAdmin()
  const deactivated = await deactivateTeaser(id)
  if (!deactivated) return { success: false, error: "التيزر غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function approveQuestionAction(questionId: string) {
  await requireAdmin()
  const updated = await updateQuestionStatus(questionId, "approved")
  if (!updated) return { success: false, error: "السؤال غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function rejectQuestionAction(questionId: string) {
  await requireAdmin()
  const updated = await updateQuestionStatus(questionId, "rejected")
  if (!updated) return { success: false, error: "السؤال غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function deleteQuestionAction(questionId: string) {
  await requireAdmin()
  const deleted = await deleteQuestion(questionId)
  if (!deleted) return { success: false, error: "السؤال غير موجود" }

  revalidateAll()
  return { success: true }
}

export async function approveAllPendingAction(teaserId: string) {
  await requireAdmin()
  const questions = await getAllQuestions(teaserId)
  const pending = questions.filter((q) => q.status === "pending")

  for (const q of pending) {
    await updateQuestionStatus(q.id, "approved")
  }

  revalidateAll()
  return { success: true, count: pending.length }
}
