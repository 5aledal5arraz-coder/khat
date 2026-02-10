import { NextRequest, NextResponse } from "next/server"
import { deleteEpisodeEnrichment } from "@/lib/episode-enrichments"
import { deleteEpisodeOverride } from "@/lib/episode-overrides"
import { deleteEpisodeQuotesEntry } from "@/lib/episode-quotes"

/**
 * DELETE /api/admin/episodes/[episodeId]/enrichments
 * Removes all Studio-pushed data (enrichments, overrides, quotes) for an episode.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params

  if (!episodeId) {
    return NextResponse.json({ error: "معرّف الحلقة مطلوب" }, { status: 400 })
  }

  try {
    const removed: string[] = []

    await deleteEpisodeEnrichment(episodeId)
    removed.push("enrichments")

    await deleteEpisodeOverride(episodeId)
    removed.push("overrides")

    await deleteEpisodeQuotesEntry(episodeId)
    removed.push("quotes")

    return NextResponse.json({ success: true, removed })
  } catch (error) {
    console.error("Restore episode error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء استعادة الحلقة" },
      { status: 500 }
    )
  }
}
