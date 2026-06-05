import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { unlink } from "fs/promises"
import path from "path"
import { updateGuest, deleteGuest, getGuestById } from "@/lib/admin/queries"
import { requireAdminAPI } from "@/lib/api-utils"
import { invalidate } from "@/lib/cache"

function validateExternalLinks(links: unknown): Record<string, string> | null {
  if (!links || typeof links !== "object") return null
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(links as Record<string, unknown>)) {
    if (typeof key !== "string" || typeof value !== "string") continue
    const trimmed = value.trim()
    if (!trimmed) continue
    if (key === "email") {
      if (/^mailto:.+@.+/.test(trimmed)) result[key] = trimmed
    } else {
      if (/^https?:\/\/.+/.test(trimmed)) result[key] = trimmed
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

/**
 * Remove an old guest image from disk if it's a local /guests/ path.
 * Only called AFTER the DB is updated, to avoid race conditions with cached data.
 */
async function removeOldImage(oldUrl: string | null | undefined) {
  if (!oldUrl || !oldUrl.startsWith("/guests/")) return
  const filename = oldUrl.replace("/guests/", "")
  if (filename.includes("/") || filename.includes("..")) return
  try {
    await unlink(path.join(process.cwd(), "public", "guests", filename))
  } catch {
    // File may already be gone — ignore
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const { id } = await params
    const body = await request.json()

    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name || name.length > 200) {
      return NextResponse.json({ error: "اسم الضيف مطلوب (حتى 200 حرف)" }, { status: 400 })
    }

    const bio = typeof body.bio === "string" && body.bio.trim() ? body.bio.trim().slice(0, 1000) : null
    const photo_url = typeof body.photo_url === "string" && body.photo_url.trim() ? body.photo_url.trim() : null
    const testimonial = typeof body.testimonial === "string" && body.testimonial.trim() ? body.testimonial.trim().slice(0, 450) : null
    const external_links = validateExternalLinks(body.external_links)

    // Fetch old photo_url BEFORE updating, so we can clean up the old file after
    const oldGuest = await getGuestById(id)
    const oldPhotoUrl = oldGuest?.photo_url || null

    const result = await updateGuest(id, { name, bio, photo_url, testimonial, external_links })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Invalidate caches BEFORE deleting old image — ensures no cached response
    // points to a file that's about to be deleted
    invalidate("guests")
    invalidate("episodes")
    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/episodes/[slug]", "page")
    revalidatePath("/guests")
    revalidatePath("/guests/[slug]", "page")
    revalidatePath("/admin/guests")

    // Clean up old image only after DB + cache are updated, and only if the URL changed
    if (oldPhotoUrl && oldPhotoUrl !== photo_url) {
      await removeOldImage(oldPhotoUrl)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating guest:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث الضيف" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const { id } = await params

    // Fetch photo URL BEFORE deleting so we can clean up the file after
    const existing = await getGuestById(id)
    const photoUrl = existing?.photo_url || null

    const result = await deleteGuest(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    invalidate("guests")
    invalidate("episodes")
    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/episodes/[slug]", "page")
    revalidatePath("/guests")
    revalidatePath("/guests/[slug]", "page")
    revalidatePath("/admin/guests")

    // Clean up the orphaned image after DB + cache are updated
    await removeOldImage(photoUrl)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting guest:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء حذف الضيف" },
      { status: 500 }
    )
  }
}
