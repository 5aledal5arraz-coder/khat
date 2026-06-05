import { NextRequest, NextResponse } from "next/server"
import { createWriteStream } from "fs"
import { mkdir } from "fs/promises"
import path from "path"
import crypto from "crypto"
import { validateVideoMeta, detectVideoType } from "@/lib/validation/video"
import { requireAdminAPI } from "@/lib/api-utils"

const CONTENT_DIR = path.join(process.cwd(), "public", "content")

/**
 * Video upload using raw binary body (no multipart/FormData).
 * File metadata is passed via headers to avoid multipart parsing limits.
 *
 * Headers:
 *   X-File-Name: encoded filename
 *   Content-Type: video MIME type
 *   Content-Length: file size in bytes
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  try {
    const fileName = decodeURIComponent(request.headers.get("x-file-name") || "")
    const mimeType = request.headers.get("content-type") || ""
    const fileSize = parseInt(request.headers.get("content-length") || "0", 10)

    console.log("[video-upload] received:", { fileName, mimeType, fileSize, sizeMB: (fileSize / 1024 / 1024).toFixed(1) + " MB" })

    if (!fileName) {
      return NextResponse.json({ error: "اسم الملف مفقود" }, { status: 400 })
    }

    // Validate metadata (size, extension, MIME) before reading any bytes
    const metaCheck = validateVideoMeta(fileName, mimeType, fileSize)
    if (!metaCheck.valid) {
      console.log("[video-upload] meta validation failed:", metaCheck.error)
      return NextResponse.json({ error: metaCheck.error }, { status: 400 })
    }

    const body = request.body
    if (!body) {
      return NextResponse.json({ error: "لم يتم إرسال محتوى الملف" }, { status: 400 })
    }

    const reader = body.getReader()

    // Read enough bytes for magic-byte detection (need 12)
    const headerChunks: Buffer[] = []
    let headerLen = 0
    while (headerLen < 12) {
      const { done, value } = await reader.read()
      if (done) break
      const buf = Buffer.from(value)
      headerChunks.push(buf)
      headerLen += buf.length
    }

    if (headerLen < 12) {
      await reader.cancel()
      return NextResponse.json({ error: "الملف صغير جداً أو فارغ" }, { status: 400 })
    }

    const headerBytes = Buffer.concat(headerChunks)
    const detected = detectVideoType(headerBytes.subarray(0, 12))

    console.log("[video-upload] header bytes:", [...headerBytes.subarray(0, 12)].map(b => b.toString(16).padStart(2, "0")).join(" "))
    console.log("[video-upload] detected type:", detected)

    if (!detected) {
      await reader.cancel()
      return NextResponse.json({ error: "محتوى الملف لا يطابق فيديو صالح" }, { status: 400 })
    }

    // Generate filename and prepare directory
    const hash = crypto.randomBytes(8).toString("hex")
    const filename = `${hash}.${detected}`
    const filePath = path.join(CONTENT_DIR, filename)
    await mkdir(CONTENT_DIR, { recursive: true })

    // Stream to disk: first the already-read header bytes, then the rest
    const ws = createWriteStream(filePath)
    ws.write(headerBytes)

    let chunk = await reader.read()
    while (!chunk.done) {
      if (chunk.value) ws.write(Buffer.from(chunk.value))
      chunk = await reader.read()
    }
    ws.end()

    await new Promise<void>((resolve, reject) => {
      ws.on("finish", resolve)
      ws.on("error", reject)
    })

    const url = `/content/${filename}`
    console.log("[video-upload] saved:", url)

    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error("[video-upload] error:", error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `حدث خطأ أثناء رفع الفيديو: ${message}` },
      { status: 500 }
    )
  }
}
