import { NextResponse } from "next/server"
import { getStudioSession, createTranscript, parseUploadedTranscript, revalidateStudio } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

const ALLOWED_EXTENSIONS = [".txt", ".srt", ".vtt"]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
/** ~7× the longest real episode (120,130 chars); a 12-hour recording. */
const MAX_TRANSCRIPT_CHARS = 800_000

/**
 * POST /api/admin/studio/[id]/transcript/upload — upload a transcript file
 * Accepts: .txt, .srt, .vtt (form-data with "file" field)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const session = await getStudioSession(id)

  if (!session) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "لم يتم تحديد ملف" }, { status: 400 })
    }

    // Validate extension
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "")
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "صيغة الملف غير مدعومة. الصيغ المدعومة: TXT, SRT, VTT" },
        { status: 400 }
      )
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "حجم الملف يتجاوز 10 ميجابايت" },
        { status: 400 }
      )
    }

    // Read content
    const content = await file.text()

    if (!content.trim()) {
      return NextResponse.json(
        { error: "الملف فارغ" },
        { status: 400 }
      )
    }

    const rawText = parseUploadedTranscript(content, file.name)

    // A 10 MB file can parse to far more text than any episode contains,
    // and nothing between here and the summarizer bounded it — every
    // 20,000 chars is one more paid chunk call. Reject rather than
    // silently bill for it; the summarizer's own cap is a backstop, not
    // an entry check.
    if (rawText.length > MAX_TRANSCRIPT_CHARS) {
      return NextResponse.json(
        {
          error: `النص أطول من الحد المسموح (${rawText.length.toLocaleString("en")} حرف مقابل ${MAX_TRANSCRIPT_CHARS.toLocaleString("en")}) — تأكد أنه نص حلقة واحدة`,
        },
        { status: 400 }
      )
    }

    const result = await createTranscript(id, "upload", rawText, "ar")

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "فشل في حفظ النص" },
        { status: 500 }
      )
    }

    revalidateStudio(id)
    return NextResponse.json({ transcript: result.data })
  } catch (error) {
    console.error("Transcript upload error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء رفع الملف" },
      { status: 500 }
    )
  }
}
