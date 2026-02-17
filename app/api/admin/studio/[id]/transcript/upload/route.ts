import { NextResponse } from "next/server"
import { getStudioSession, createTranscript, parseUploadedTranscript } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

const ALLOWED_EXTENSIONS = [".txt", ".srt", ".vtt"]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

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

    const result = await createTranscript(id, "upload", rawText, "ar")

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "فشل في حفظ النص" },
        { status: 500 }
      )
    }

    return NextResponse.json({ transcript: result.data })
  } catch (error) {
    console.error("Transcript upload error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء رفع الملف" },
      { status: 500 }
    )
  }
}
