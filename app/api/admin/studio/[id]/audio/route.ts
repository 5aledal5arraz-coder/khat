import path from "path"
import fs from "fs"
import fsp from "fs/promises"
import { Readable } from "stream"
import { getStudioSession } from "@/lib/studio"
import { buildSessionAudioPath } from "@/lib/studio/audio-path"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * GET /api/admin/studio/[id]/audio
 *
 * Streams a session's uploaded raw audio to an <audio> element — the source for
 * the "اسمع" verify-by-ear button on the time map. The file lives OUTSIDE
 * /public (data/studio-audio/{id}/audio-{id}{ext}), so it can only be reached
 * through this admin-gated route, never a static URL.
 *
 * HTTP Range is supported (206 Partial Content). The browser needs it to SEEK:
 * setting audio.currentTime to (t − 3) issues a Range request, and without
 * Accept-Ranges/206 a 2-hour file is not reliably seekable.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const session = await getStudioSession(id)
  if (!session || !session.audio_filename) {
    return new Response("لا يوجد ملف صوتي", { status: 404 })
  }

  const ext = path.extname(session.audio_filename).toLowerCase()
  // Shared builder = one source of truth for the on-disk layout (also does the
  // in-session-dir escape guard, throwing on a crafted id/ext).
  let filePath: string
  try {
    filePath = buildSessionAudioPath(id, session.audio_filename)
  } catch {
    return new Response("مسار غير صالح", { status: 400 })
  }

  let size: number
  try {
    const stat = await fsp.stat(filePath)
    size = stat.size
  } catch {
    return new Response("الملف الصوتي غير موجود على القرص", { status: 404 })
  }

  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream"
  const rangeHeader = request.headers.get("range")

  // Full-file response.
  if (!rangeHeader) {
    const stream = Readable.toWeb(
      fs.createReadStream(filePath),
    ) as unknown as ReadableStream
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
      },
    })
  }

  // Partial (seek). Parse "bytes=start-end"; tolerate a missing end.
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) {
    return new Response("Range غير صالح", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    })
  }
  const start = match[1] ? parseInt(match[1], 10) : 0
  const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1
  if (Number.isNaN(start) || start > end || start >= size) {
    return new Response("Range خارج النطاق", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    })
  }

  const stream = Readable.toWeb(
    fs.createReadStream(filePath, { start, end }),
  ) as unknown as ReadableStream
  return new Response(stream, {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    },
  })
}
