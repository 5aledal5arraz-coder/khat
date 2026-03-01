import { NextRequest, NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { validateAudioFile } from "@/lib/audio-validation"
import { probeAudioDuration } from "@/lib/whisper"
import { createStudioSession } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 300

const AUDIO_DIR = path.join(process.cwd(), "data", "studio-audio")

/**
 * POST /api/admin/studio/upload — upload audio file and create studio session
 * Body: FormData with `file` (audio) and optional `title` (string)
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = (formData.get("title") as string) || null

    if (!file) {
      return NextResponse.json(
        { error: "يرجى اختيار ملف صوتي" },
        { status: 400 }
      )
    }

    // Read header bytes for magic byte check
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const headerBytes = buffer.subarray(0, 12)

    const validation = validateAudioFile(file.name, file.size, headerBytes)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    // Create session directory
    const sessionId = crypto.randomUUID()
    const sessionDir = path.join(AUDIO_DIR, sessionId)
    await fs.mkdir(sessionDir, { recursive: true })

    // Sanitize filename to prevent path traversal
    const ext = path.extname(file.name).toLowerCase()
    const safeName = `audio-${sessionId}${ext}`
    const filePath = path.join(sessionDir, safeName)
    // Final safety check: ensure resolved path is inside sessionDir
    if (!path.resolve(filePath).startsWith(path.resolve(sessionDir))) {
      return NextResponse.json({ error: "اسم ملف غير صالح" }, { status: 400 })
    }
    await fs.writeFile(filePath, buffer)

    // Probe duration with ffprobe
    const duration = await probeAudioDuration(filePath)

    // Create studio session
    const result = await createStudioSession({
      youtube_url: null,
      video_id: null,
      source: "audio",
      status: "fetched",
      video_title: title || file.name.replace(/\.[^.]+$/, ""),
      channel_title: null,
      published_at: null,
      duration_seconds: duration,
      thumbnail_url: null,
      raw_youtube_response: null,
      audio_filename: file.name,
      audio_file_size: file.size,
      audio_start_seconds: null,
      audio_end_seconds: null,
      audio_best_intro: null,
      audio_edit_suggestions: null,
    })

    if (!result.success) {
      // Clean up file on failure
      await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
      return NextResponse.json(
        { error: result.error || "فشل في إنشاء الجلسة" },
        { status: 500 }
      )
    }

    // If session ID from DB differs from our directory name, rename
    if (result.data && result.data.id !== sessionId) {
      const newDir = path.join(AUDIO_DIR, result.data.id)
      await fs.rename(sessionDir, newDir).catch(() => {})
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("Audio upload error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء رفع الملف الصوتي" },
      { status: 500 }
    )
  }
}
