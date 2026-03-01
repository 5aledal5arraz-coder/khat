import { NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { db, USE_DB } from "@/lib/db"
import { studioWebsitePackages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { fetchAllEpisodes } from "@/lib/youtube/queries"
import { getGuestAssignments } from "@/lib/episode-guests"
import { autoLinkGuestForEpisode } from "@/lib/guest-linker"

interface BulkLinkPreviewItem {
  episodeId: string
  episodeTitle: string
  guestName: string
  guestBio: string | null
  alreadyLinked: boolean
}

/**
 * GET /api/admin/guests/bulk-link — preview what would be linked
 * Scans website packages for extracted guest names and shows matches.
 */
export async function GET() {
  const authError = await requireAdminAPI()
  if (authError) return authError

  if (!USE_DB) {
    return NextResponse.json({ error: "يتطلب قاعدة بيانات" }, { status: 400 })
  }

  try {
    // Fetch all website packages with guest_name in raw_openai_response
    const packages = await db!
      .select({
        linked_episode_id: studioWebsitePackages.linked_episode_id,
        raw_openai_response: studioWebsitePackages.raw_openai_response,
        status: studioWebsitePackages.status,
      })
      .from(studioWebsitePackages)
      .where(eq(studioWebsitePackages.status, "ready"))

    // Get current guest assignments
    const assignments = await getGuestAssignments()

    // Get all episodes for titles
    const episodes = await fetchAllEpisodes()
    const episodeMap = new Map(episodes.map((e) => [e.id, e]))

    const preview: BulkLinkPreviewItem[] = []

    for (const pkg of packages) {
      const raw = pkg.raw_openai_response as Record<string, unknown> | null
      const guestName = raw?.guest_name as string | undefined
      if (!guestName || !guestName.trim() || !pkg.linked_episode_id) continue

      const ep = episodeMap.get(pkg.linked_episode_id)
      const alreadyLinked = !!assignments[pkg.linked_episode_id]

      preview.push({
        episodeId: pkg.linked_episode_id,
        episodeTitle: ep?.title || pkg.linked_episode_id,
        guestName: guestName.trim(),
        guestBio: (raw?.guest_bio as string) || null,
        alreadyLinked,
      })
    }

    const unlinked = preview.filter((p) => !p.alreadyLinked)

    return NextResponse.json({
      total: preview.length,
      alreadyLinked: preview.length - unlinked.length,
      toLink: unlinked.length,
      items: preview,
    })
  } catch (error) {
    console.error("Bulk link preview error:", error)
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 })
  }
}

/**
 * POST /api/admin/guests/bulk-link — execute bulk linking
 * Links all unlinked episodes to their extracted guests.
 */
export async function POST() {
  const authError = await requireAdminAPI()
  if (authError) return authError

  if (!USE_DB) {
    return NextResponse.json({ error: "يتطلب قاعدة بيانات" }, { status: 400 })
  }

  try {
    const packages = await db!
      .select({
        linked_episode_id: studioWebsitePackages.linked_episode_id,
        raw_openai_response: studioWebsitePackages.raw_openai_response,
        status: studioWebsitePackages.status,
      })
      .from(studioWebsitePackages)
      .where(eq(studioWebsitePackages.status, "ready"))

    const assignments = await getGuestAssignments()

    const results: {
      episodeId: string
      guestName: string
      linked: boolean
      created: boolean
      error?: string
    }[] = []

    for (const pkg of packages) {
      const raw = pkg.raw_openai_response as Record<string, unknown> | null
      const guestName = raw?.guest_name as string | undefined
      if (!guestName || !guestName.trim() || !pkg.linked_episode_id) continue

      // Skip already linked
      if (assignments[pkg.linked_episode_id]) continue

      const linkResult = await autoLinkGuestForEpisode(
        pkg.linked_episode_id,
        guestName.trim(),
        (raw?.guest_bio as string) || null
      )

      results.push({
        episodeId: pkg.linked_episode_id,
        guestName: guestName.trim(),
        linked: linkResult.linked,
        created: linkResult.created || false,
        error: linkResult.error,
      })
    }

    const linked = results.filter((r) => r.linked)
    const failed = results.filter((r) => !r.linked)
    const created = results.filter((r) => r.created)

    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed: results.length,
        linked: linked.length,
        guestsCreated: created.length,
        failed: failed.length,
      },
      results,
    })
  } catch (error) {
    console.error("Bulk link error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء الربط" }, { status: 500 })
  }
}
