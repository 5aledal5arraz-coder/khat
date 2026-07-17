import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { unlink } from "fs/promises"
import path from "path"
import { deleteGuest, getGuestById } from "@/lib/admin/queries"
import { requireAdminAPI } from "@/lib/api-utils"
import { invalidate } from "@/lib/cache"

/** Same guard as the single-guest DELETE: only local /guests/ files. */
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

const MAX_BULK = 200

/**
 * Bulk-delete guests in one request. Mirrors the single-guest DELETE
 * (EDITOR+, per-guest image cleanup) but invalidates caches once at the
 * end instead of per row. Partial failures are reported, not fatal.
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI("EDITOR")
  if (authError) return authError

  let ids: string[]
  try {
    const body = await request.json()
    const raw: unknown = body?.ids
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: "قائمة المعرّفات مطلوبة" }, { status: 400 })
    }
    // Dedupe + keep only non-empty strings.
    const clean = (raw as unknown[]).filter(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    )
    ids = [...new Set(clean)]
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 })
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: "لم يتم تحديد أي ضيف" }, { status: 400 })
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json(
      { error: `لا يمكن حذف أكثر من ${MAX_BULK} ضيف في مرة واحدة` },
      { status: 400 },
    )
  }

  const deletedIds: string[] = []
  const failed: { id: string; error: string }[] = []
  const photoUrls: (string | null)[] = []

  // Delete sequentially so one failing row can't abort the batch; collect
  // photo URLs to clean up only after the DB + cache are settled.
  for (const id of ids) {
    try {
      const existing = await getGuestById(id)
      const result = await deleteGuest(id)
      if (result.success) {
        deletedIds.push(id)
        photoUrls.push(existing?.photo_url ?? null)
      } else {
        failed.push({ id, error: result.error ?? "فشل الحذف" })
      }
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (deletedIds.length > 0) {
    invalidate("guests")
    invalidate("episodes")
    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/episodes/[slug]", "page")
    revalidatePath("/guests")
    revalidatePath("/guests/[slug]", "page")
    revalidatePath("/admin/guests")

    // Orphaned images cleaned up after DB + cache are updated.
    for (const url of photoUrls) {
      await removeOldImage(url)
    }
  }

  return NextResponse.json({
    deleted: deletedIds.length,
    deletedIds,
    failed: failed.length,
    errors: failed,
  })
}
