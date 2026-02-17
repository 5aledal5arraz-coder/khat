import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import crypto from "crypto"
import { requireAdminAPI } from "@/lib/api-utils"

const TEASERS_DIR = path.join(process.cwd(), "public", "teasers")
const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200 MB

const ALLOWED_EXTENSIONS = new Set(["mp4", "webm"])
const ALLOWED_MIME_TYPES = new Set(["video/mp4", "video/webm"])

/** Magic byte signatures for video formats */
const VIDEO_SIGNATURES: { bytes: number[]; offset: number; ext: string }[] = [
  // MP4: ftyp at offset 4
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, ext: "mp4" },
  // WebM: 1A 45 DF A3 (EBML header)
  { bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0, ext: "webm" },
]

function detectVideoType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null
  for (const sig of VIDEO_SIGNATURES) {
    const match = sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte)
    if (match) return sig.ext
  }
  return null
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "لم يتم رفع أي ملف" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "حجم الملف يتجاوز 200 ميجابايت" }, { status: 400 })
    }

    // Extension check
    const rawExt = file.name.split(".").pop()?.toLowerCase()
    if (!rawExt || !ALLOWED_EXTENSIONS.has(rawExt)) {
      return NextResponse.json({ error: "امتداد الملف غير مدعوم. استخدم MP4 أو WebM" }, { status: 400 })
    }

    // MIME type check
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "نوع الملف غير مدعوم. استخدم MP4 أو WebM" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Magic byte verification
    const detectedType = detectVideoType(buffer)
    if (!detectedType) {
      return NextResponse.json({ error: "محتوى الملف لا يطابق فيديو صالح" }, { status: 400 })
    }

    const hash = crypto.randomBytes(8).toString("hex")
    const filename = `${hash}.${detectedType}`

    await mkdir(TEASERS_DIR, { recursive: true })
    await writeFile(path.join(TEASERS_DIR, filename), buffer)

    return NextResponse.json({ success: true, filename })
  } catch (error) {
    console.error("Error uploading teaser video:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء رفع الفيديو" }, { status: 500 })
  }
}
