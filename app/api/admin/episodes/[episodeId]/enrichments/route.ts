import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { deleteEpisodeEnrichment, getEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { deleteEpisodeOverride, getEpisodeOverrides } from "@/lib/episodes/overrides"
import { deleteEpisodeQuotesEntry, getQuotesConfig } from "@/lib/episodes/quotes"
import { requireAdminAPI } from "@/lib/api-utils"
import { saveVersion } from "@/lib/episodes/versions"
import { invalidate } from "@/lib/cache"

/**
 * DELETE /api/admin/episodes/[episodeId]/enrichments
 * Removes all Studio-pushed data (enrichments, overrides, quotes) for an episode.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { episodeId } = await params

  if (!episodeId) {
    return NextResponse.json({ error: "معرّف الحلقة مطلوب" }, { status: 400 })
  }

  try {
    // Save full snapshot before deletion
    const [enrichment, overrides, quotesConfig] = await Promise.all([
      getEpisodeEnrichment(episodeId),
      getEpisodeOverrides(),
      getQuotesConfig(),
    ])
    await saveVersion(episodeId, "full_snapshot", {
      enrichment,
      override: overrides.find((o) => o.id === episodeId) || null,
      quotesEntry: quotesConfig[episodeId] || null,
    }, "قبل حذف بيانات الاستوديو")

    const removed: string[] = []

    await deleteEpisodeEnrichment(episodeId)
    removed.push("enrichments")

    await deleteEpisodeOverride(episodeId)
    removed.push("overrides")

    await deleteEpisodeQuotesEntry(episodeId)
    removed.push("quotes")

    invalidate("episodes")
    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/admin/episodes")
    revalidatePath(`/admin/episodes/${episodeId}`)

    return NextResponse.json({ success: true, removed })
  } catch (error) {
    console.error("Restore episode error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء استعادة الحلقة" },
      { status: 500 }
    )
  }
}
