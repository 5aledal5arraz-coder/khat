import { NextRequest, NextResponse } from "next/server"
import { validateAudioUpload } from "@/lib/validation/upload"
import { transcodeTestimonialAudio } from "@/lib/media/testimonial-audio"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * Upload a guest's voice note.
 *
 * Returns the stored path and the measured duration; it does NOT touch the
 * episode row. Saving is `updateGuestTestimonial`, the same action that owns
 * the written text and the video link — so the operator can attach a voice
 * note, change their mind, and leave without ever mutating the episode.
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "لم يتم رفع أي ملف" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const validation = validateAudioUpload(file, buffer)

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { url, durationSeconds } = await transcodeTestimonialAudio(
      buffer,
      validation.container!,
    )

    return NextResponse.json({ success: true, url, durationSeconds })
  } catch (error) {
    // The overwhelmingly likely cause is ffmpeg refusing the file, which is a
    // property of the upload, not an outage — so say something the operator
    // can act on rather than "حدث خطأ".
    console.error("[testimonial-audio] upload failed:", error)
    return NextResponse.json(
      { error: "تعذّرت معالجة الملف الصوتي — جرّب تسجيلاً آخر أو صيغة أخرى" },
      { status: 500 },
    )
  }
}
