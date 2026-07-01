import { env } from "@/lib/env"
import { NextRequest, NextResponse } from "next/server"
import { getYouTubeId } from "@/lib/utils"
import { createStudioSession, getStudioSessions, revalidateStudio } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

const YOUTUBE_API_KEY = env.YOUTUBE_API_KEY

/**
 * GET /api/admin/studio — list all studio sessions
 */
export async function GET() {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const sessions = await getStudioSessions()
  return NextResponse.json(sessions)
}

/**
 * POST /api/admin/studio — fetch YouTube video info and create a session
 * Body: { youtubeUrl: string }
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const body = await request.json()
    const { youtubeUrl } = body as { youtubeUrl?: string }

    if (!youtubeUrl) {
      return NextResponse.json(
        { error: "رابط يوتيوب مطلوب" },
        { status: 400 }
      )
    }

    const videoId = getYouTubeId(youtubeUrl)
    if (!videoId) {
      return NextResponse.json(
        { error: "رابط يوتيوب غير صالح — تأكد من صحة الرابط" },
        { status: 400 }
      )
    }

    // Fetch video details from YouTube Data API
    if (!YOUTUBE_API_KEY) {
      return NextResponse.json(
        { error: "مفتاح YouTube API غير مُعدّ في البيئة" },
        { status: 500 }
      )
    }

    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos")
    apiUrl.searchParams.set("id", videoId)
    apiUrl.searchParams.set("part", "snippet,contentDetails,statistics")

    const ytRes = await fetch(apiUrl.toString(), {
      headers: {
        "X-goog-api-key": YOUTUBE_API_KEY,
        Referer: "https://khatpodcast.com",
      },
    })
    if (!ytRes.ok) {
      const errBody = await ytRes.json().catch(() => null)
      const msg = errBody?.error?.message || `YouTube API returned ${ytRes.status}`
      console.error("YouTube API error:", msg)
      return NextResponse.json(
        { error: `فشل الاتصال بـ YouTube API: ${msg}` },
        { status: 502 }
      )
    }

    const ytData = await ytRes.json()
    const item = ytData.items?.[0]

    if (!item) {
      return NextResponse.json(
        { error: "لم يتم العثور على الفيديو — تأكد من أن الرابط صحيح والفيديو عام" },
        { status: 404 }
      )
    }

    // Parse ISO 8601 duration (PT1H23M45S)
    const durationMatch = item.contentDetails.duration.match(
      /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
    )
    const durationSeconds = durationMatch
      ? (parseInt(durationMatch[1] || "0", 10) * 3600) +
        (parseInt(durationMatch[2] || "0", 10) * 60) +
        parseInt(durationMatch[3] || "0", 10)
      : 0

    const thumbnailUrl =
      item.snippet.thumbnails?.maxres?.url ||
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.medium?.url ||
      null

    const result = await createStudioSession({
      youtube_url: youtubeUrl,
      video_id: videoId,
      source: "youtube",
      status: "fetched",
      video_title: item.snippet.title,
      channel_title: item.snippet.channelTitle,
      published_at: item.snippet.publishedAt,
      duration_seconds: durationSeconds,
      thumbnail_url: thumbnailUrl,
      raw_youtube_response: item,
      audio_filename: null,
      audio_file_size: null,
      audio_start_seconds: null,
      audio_end_seconds: null,
      audio_best_intro: null,
      audio_edit_suggestions: null,
      episode_id: null,
      episode_title: null,
      source_type: null,
      notes: null,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "فشل في حفظ البيانات" },
        { status: 500 }
      )
    }

    revalidateStudio()
    return NextResponse.json(result.data)
  } catch (error) {
    console.error("Studio fetch error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب بيانات الفيديو" },
      { status: 500 }
    )
  }
}
