import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import {
  runStudioPushToEpisode,
  StudioPushError,
  type StudioPushFields,
} from "@/lib/studio/push-to-episode"

/**
 * POST /api/admin/studio/[id]/push — push website package data to episode.
 *
 * UX-4 — body extracted into `lib/studio/push-to-episode.ts` so the
 * Episode Workspace's `pushPackageToEpisodeAction` server action can
 * reuse the exact same flow without duplicating push_episode_data
 * logic.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id: sessionId } = await params

  let body: { fields: StudioPushFields }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
  }
  const { fields } = body
  if (!fields || typeof fields !== "object") {
    return NextResponse.json(
      { error: "يجب تحديد الحقول المراد نشرها" },
      { status: 400 },
    )
  }

  try {
    const result = await runStudioPushToEpisode({ sessionId, fields })
    return NextResponse.json({
      success: true,
      episodeId: result.episodeId,
      pushedFields: result.pushedFields,
      guestLink: result.guestLink,
    })
  } catch (err) {
    if (err instanceof StudioPushError) {
      const status =
        err.code === "package_missing" ||
        err.code === "package_not_ready" ||
        err.code === "package_unlinked"
          ? 400
          : 500
      // Preserve the legacy error copy for `package_missing` /
      // `package_not_ready` so existing UI tests don't break.
      const message =
        err.code === "package_missing" || err.code === "package_not_ready"
          ? "لا توجد حزمة جاهزة للنشر"
          : err.code === "package_unlinked"
            ? "لم يتم ربط الحزمة بحلقة — حدد الحلقة أولاً"
            : err.message
      return NextResponse.json({ error: message }, { status })
    }
    console.error("Push to episode error:", err)
    return NextResponse.json(
      { error: "حدث خطأ أثناء النشر" },
      { status: 500 },
    )
  }
}
