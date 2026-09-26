import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { unlink } from "fs/promises"
import path from "path"
import { deleteGuest, findGuestLinks, getGuestById } from "@/lib/admin/queries"
import { logAuditEvent } from "@/lib/admin/auth"
import { getAdminAuthUser, requireAdminAPI } from "@/lib/api-utils"
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

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null
}

/**
 * Bulk-delete guests in one request. OWNER only: this is a hard delete of up
 * to MAX_BULK rows whose FKs cascade into guest_identity / episode_graph and
 * take the guest's photo file with them — not something an EDITOR should be
 * able to do in one click.
 *
 * A guest still linked to an episode (`episodes.guest_id` or
 * `episode_guests`) or to an EIR is SKIPPED and reported, never deleted: the
 * FKs are SET NULL, so the database would otherwise quietly unhook a
 * published episode from its guest. `deleteGuest` enforces the same rule
 * inside its own DELETE, so a link created mid-request is still safe.
 *
 * Every call that deletes anything writes one `admin_audit_logs` row.
 * Partial failures are reported, not fatal.
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI("OWNER")
  if (authError) return authError
  const actor = await getAdminAuthUser()

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
  const deletedNames: string[] = []
  const failed: { id: string; error: string }[] = []
  const skipped: { id: string; episodeIds: string[]; eirIds: string[] }[] = []
  const photoUrls: (string | null)[] = []

  let links: Awaited<ReturnType<typeof findGuestLinks>>
  try {
    links = await findGuestLinks(ids)
  } catch (err) {
    console.error("Error checking guest links:", err)
    return NextResponse.json({ error: "تعذّر التحقق من ارتباطات الضيوف" }, { status: 500 })
  }

  // Delete sequentially so one failing row can't abort the batch; collect
  // photo URLs to clean up only after the DB + cache are settled.
  for (const id of ids) {
    const linked = links.get(id)
    if (linked) {
      skipped.push({ id, ...linked })
      continue
    }
    try {
      const existing = await getGuestById(id)
      const result = await deleteGuest(id)
      if (result.success) {
        deletedIds.push(id)
        deletedNames.push(existing?.name ?? id)
        photoUrls.push(existing?.photo_url ?? null)
      } else if (result.linked) {
        // Linked after the pre-check — refused by deleteGuest's own guard.
        skipped.push({ id, ...result.linked })
      } else {
        failed.push({ id, error: result.error ?? "فشل الحذف" })
      }
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (deletedIds.length > 0 || skipped.length > 0) {
    await logAuditEvent({
      actorId: actor?.id ?? null,
      action: "GUESTS_BULK_DELETED",
      ip: clientIp(request),
      metadata: {
        requested: ids.length,
        deleted_ids: deletedIds,
        deleted_names: deletedNames,
        skipped_linked: skipped,
        failed,
      },
    })
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
    skipped: skipped.length,
    skippedLinked: skipped,
  })
}
