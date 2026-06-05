import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { requireAdminAPI } from "@/lib/api-utils"
import { assignGuestToEpisode } from "@/lib/episodes/guests"
import { invalidate } from "@/lib/cache"
import { invalidateEpisodeCache } from "@/lib/cache/episode-cache"

interface RouteContext {
  params: Promise<{ id: string }>
}

/** Link an episode to this guest (set episodes.guest_id = guest.id) */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  try {
    const { id: guestId } = await params
    const { episodeId } = await request.json()

    if (!episodeId || typeof episodeId !== "string") {
      return NextResponse.json({ error: "معرّف الحلقة مطلوب" }, { status: 400 })
    }

    await assignGuestToEpisode(episodeId, guestId)

    invalidate("guests")
    invalidate("episodes")
    await invalidateEpisodeCache()
    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/guests")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error linking episode to guest:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء ربط الحلقة" }, { status: 500 })
  }
}

/** Unlink an episode from this guest (set episodes.guest_id = null) */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  try {
    const { id: guestId } = await params
    const { episodeId } = await request.json()

    if (!episodeId || typeof episodeId !== "string") {
      return NextResponse.json({ error: "معرّف الحلقة مطلوب" }, { status: 400 })
    }

    // Safety: only unlink if the episode is currently linked to this guest.
    // Prevents accidentally clearing another guest's link via a stale request.
    const { db } = await import("@/lib/db")
    const { episodes } = await import("@/lib/db/schema")
    const { eq, and } = await import("drizzle-orm")
    const [current] = await db!
      .select({ guest_id: episodes.guest_id })
      .from(episodes)
      .where(and(eq(episodes.id, episodeId), eq(episodes.guest_id, guestId)))
      .limit(1)

    if (!current) {
      return NextResponse.json(
        { error: "الحلقة غير مرتبطة بهذا الضيف" },
        { status: 409 },
      )
    }

    await assignGuestToEpisode(episodeId, null)

    invalidate("guests")
    invalidate("episodes")
    await invalidateEpisodeCache()
    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/guests")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error unlinking episode from guest:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء إلغاء ربط الحلقة" }, { status: 500 })
  }
}
