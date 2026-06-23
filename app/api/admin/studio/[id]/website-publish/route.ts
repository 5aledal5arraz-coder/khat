import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getWebsitePackageForSession, revalidateStudio } from "@/lib/studio"
import {
  getEpisodeEnrichment,
  setEnrichmentPublishStatus,
} from "@/lib/episodes/enrichments"
import { invalidate } from "@/lib/cache"
import { PUBLISH_STATUSES } from "@/lib/editorial/publish-types"

async function resolveEpisodeId(sessionId: string): Promise<string | null> {
  const pkg = await getWebsitePackageForSession(sessionId)
  return pkg?.linked_episode_id ?? null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  const episodeId = await resolveEpisodeId(id)
  if (!episodeId) return NextResponse.json({ data: null })
  const enrichment = await getEpisodeEnrichment(episodeId)
  return NextResponse.json({
    data: {
      episodeId,
      publish_status: enrichment?.publish_status ?? "published",
      scheduled_for: enrichment?.scheduled_for ?? null,
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  let body: { status?: string; scheduledFor?: string | null } = {}
  try {
    body = await request.json()
  } catch {
    // empty body tolerated
  }

  const status = body.status
  if (!status || !(PUBLISH_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "حالة نشر غير صالحة" }, { status: 400 })
  }

  const episodeId = await resolveEpisodeId(id)
  if (!episodeId) {
    return NextResponse.json({ error: "الجلسة غير مرتبطة بحلقة" }, { status: 400 })
  }

  const result = await setEnrichmentPublishStatus(episodeId, status, body.scheduledFor ?? null)
  invalidate("episodes")
  revalidateStudio(id)
  return NextResponse.json({ data: { episodeId, ...result } })
}
