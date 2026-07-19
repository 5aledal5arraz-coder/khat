"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { requireAdmin } from "@/lib/api-utils"
import {
  createTeaser,
  updateTeaser,
  deleteTeaser,
  activateTeaser,
  deactivateTeaser,
  resolveTeaserEirSnapshot,
  TEASER_CACHE_TAG,
} from "@/lib/teaser"

type ActionResult = { success: boolean; error?: string }

/**
 * Invalidate everything that depends on the active teaser: the homepage cache
 * tag (unstable_cache) + the admin page. The public episode/guest pages read
 * live (force-dynamic), so no tag is needed there.
 */
function revalidateTeaser() {
  // Next.js 16 requires a cache-life profile as the 2nd arg; { expire: 0 }
  // expires the tagged entry immediately (matches lib/cache.ts).
  revalidateTag(TEASER_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/home-content")
}

// ─── Create ──────────────────────────────────────────────────────
// v1 fields only: linked episode (EIR, required), title (required), video
// (required), poster (optional), publish/expire window (optional). The guest
// is derived server-side from the EIR — never free-typed (Sara note 7/15).
export async function createTeaserAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin()

  const eirId = (formData.get("eirId") as string)?.trim() || ""
  const title = (formData.get("title") as string)?.trim() || ""
  const videoFilename = (formData.get("videoFilename") as string)?.trim() || ""
  const posterImage = (formData.get("posterImage") as string)?.trim() || null
  const publishAt = (formData.get("publishAt") as string)?.trim() || null
  const expireAt = (formData.get("expireAt") as string)?.trim() || null

  if (!eirId) return { success: false, error: "اختر حلقة مرتبطة قبل الحفظ" }
  if (!title) return { success: false, error: "عنوان التيزر مطلوب" }
  if (!videoFilename) return { success: false, error: "ارفع فيديو التيزر قبل الحفظ" }
  // Defence in depth: videoFilename comes from the client (upload response).
  // It must match exactly what the upload route mints — 16 hex chars +
  // .mp4/.webm (randomBytes(8).hex + magic-byte-detected type).
  if (!/^[a-f0-9]{16}\.(mp4|webm)$/.test(videoFilename)) {
    return { success: false, error: "ملف الفيديو غير صالح" }
  }

  // Lock the guest to the EIR (source of truth) and reject a stale/invalid EIR.
  const snapshot = await resolveTeaserEirSnapshot(eirId)
  if (!snapshot) {
    return { success: false, error: "الحلقة المختارة غير صالحة أو نُشرت بالفعل" }
  }

  await createTeaser({
    eirId,
    guestId: snapshot.guestId,
    guestName: snapshot.guestName,
    title,
    videoFilename,
    posterImage,
    publishAt,
    expireAt,
  })
  revalidateTeaser()
  return { success: true }
}

// ─── Update ──────────────────────────────────────────────────────
// The linked episode/guest are fixed at creation; editing covers title, poster
// and the publish/expire window.
export async function updateTeaserAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin()

  const title = (formData.get("title") as string)?.trim() || ""
  const posterImage = (formData.get("posterImage") as string)?.trim() || null
  const publishAt = (formData.get("publishAt") as string)?.trim() || null
  const expireAt = (formData.get("expireAt") as string)?.trim() || null

  if (!title) return { success: false, error: "عنوان التيزر مطلوب" }

  const updated = await updateTeaser(id, { title, posterImage, publishAt, expireAt })
  if (!updated) return { success: false, error: "التيزر غير موجود" }

  revalidateTeaser()
  return { success: true }
}

// ─── Delete ──────────────────────────────────────────────────────
export async function deleteTeaserAction(id: string): Promise<ActionResult> {
  await requireAdmin()
  const deleted = await deleteTeaser(id)
  if (!deleted) return { success: false, error: "التيزر غير موجود" }

  revalidateTeaser()
  return { success: true }
}

// ─── Activate / deactivate (single active enforced in lib) ───────
export async function activateTeaserAction(id: string): Promise<ActionResult> {
  await requireAdmin()
  const activated = await activateTeaser(id)
  if (!activated) return { success: false, error: "التيزر غير موجود" }

  revalidateTeaser()
  return { success: true }
}

export async function deactivateTeaserAction(id: string): Promise<ActionResult> {
  await requireAdmin()
  const deactivated = await deactivateTeaser(id)
  if (!deactivated) return { success: false, error: "التيزر غير موجود" }

  revalidateTeaser()
  return { success: true }
}
