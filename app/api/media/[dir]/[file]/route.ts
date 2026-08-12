import { NextResponse } from "next/server"
import { readFile, stat } from "fs/promises"
import path from "path"

/**
 * UPLOADS ARE INVISIBLE UNTIL THE SERVER RESTARTS — this route is why they are not.
 *
 * `next start` indexes `public/` ONCE, at boot. Every admin upload route writes
 * into that directory at runtime (`public/guests`, `public/content`, …), so a
 * file that lands after boot is not in the index and Next does not serve it.
 * It does something worse than 404: the request falls through to whatever route
 * matches next. On 2026-08-08 sixteen guest photos uploaded at 12:46 against a
 * server booted at 08:51 came back as `/guests/[slug]` — an HTML page, status
 * 200 — and `next/image` then rejected the HTML with 400 "not a valid image".
 * Nothing in the admin reported a failure, because nothing had failed: the
 * upload wrote the file, the DB stored the path, and the page printed the
 * correct <img>. Only the bytes were missing.
 *
 * An nginx static rule does NOT fix this. next/image resolves a local `url`
 * inside the Next process — measured, not assumed: an optimizer request for a
 * post-boot file produced no entry in the nginx access log. Every guest photo
 * on the site renders through <Image>, so a fix nginx can see is a fix nobody
 * uses. It has to live where the optimizer looks, which is the route table.
 *
 * A `afterFiles` rewrite in next.config.ts sends extension-suffixed requests
 * under these directories here (see the rewrite for the exact pattern).
 * `afterFiles` means the boot index still wins when it has the file, so nothing
 * that works today gets slower — this route only ever runs for files Next does
 * not know about, and it reads the disk on every request, which is precisely
 * the property the boot index lacks.
 */

// Must stay in step with the upload routes that write into public/:
// app/api/admin/{guests,content/upload-image,home/upload-image,partnerships,
// about-team,teaser}/… — each writes into one of these directories.
const ALLOWED_DIRS = new Set([
  "guests",
  "content",
  "home",
  "partners",
  "team",
  "teasers",
  // Guest voice notes. Written at runtime like every directory above, so it
  // hits the same boot-index problem and needs the same escape hatch.
  "testimonials",
])

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  // AAC-in-MP4 — the only thing the upload route stores, because it is the
  // one audio format every current browser plays, iOS Safari included.
  ".m4a": "audio/mp4",
}

// Upload filenames are `crypto.randomBytes(8).toString("hex")` + a verified
// extension. Anything outside that alphabet is not a file we wrote.
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/

/**
 * iOS Safari REFUSES to play media from a server that does not answer byte
 * ranges. It opens with `Range: bytes=0-1`, and a 200 carrying the whole file
 * instead of a 206 carrying two bytes is treated as a broken source: the
 * `<audio>` element errors and never starts. Chrome and Firefox tolerate the
 * 200, so this fails on exactly the devices most of this audience uses and
 * nowhere a desktop test would catch it.
 *
 * Images never triggered it, which is why the route shipped without ranges.
 */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null

  const [, rawStart, rawEnd] = match

  // `bytes=-500` means the LAST 500 bytes, not "up to 500".
  if (rawStart === "") {
    if (rawEnd === "") return null
    const suffix = parseInt(rawEnd, 10)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = parseInt(rawStart, 10)
  if (!Number.isFinite(start) || start >= size) return null

  const end = rawEnd === "" ? size - 1 : Math.min(parseInt(rawEnd, 10), size - 1)
  if (!Number.isFinite(end) || end < start) return null

  return { start, end }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dir: string; file: string }> }
) {
  const { dir, file } = await params

  if (!ALLOWED_DIRS.has(dir)) {
    return new NextResponse(null, { status: 404 })
  }

  // Reject traversal before touching the filesystem. `path.basename` alone
  // would silently rewrite "../../.env" into ".env" and serve it from the
  // media directory if it happened to be there; refusing outright is the
  // behaviour we can reason about.
  if (!SAFE_FILENAME.test(file) || file.includes("..")) {
    return new NextResponse(null, { status: 404 })
  }

  const ext = path.extname(file).toLowerCase()
  const contentType = CONTENT_TYPES[ext]
  if (!contentType) {
    return new NextResponse(null, { status: 404 })
  }

  const baseDir = path.join(process.cwd(), "public", dir)
  const filePath = path.join(baseDir, file)

  // Belt and braces: the regex above already excludes separators, but the
  // containment check is what makes that a guarantee rather than a claim.
  if (path.dirname(path.resolve(filePath)) !== path.resolve(baseDir)) {
    return new NextResponse(null, { status: 404 })
  }

  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return new NextResponse(null, { status: 404 })
    }

    const bytes = await readFile(filePath)

    // Filenames are random per upload — replacing a guest photo mints a new
    // name — so a served URL never changes content and can be cached hard.
    const baseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      // Advertised unconditionally: a client that sees no `Accept-Ranges` may
      // not bother asking, and the whole point is that it asks.
      "Accept-Ranges": "bytes",
    }

    const range = parseRange(request.headers.get("range"), info.size)
    if (range) {
      const slice = bytes.subarray(range.start, range.end + 1)
      return new NextResponse(new Uint8Array(slice), {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(slice.byteLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        },
      })
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(info.size) },
    })
  } catch {
    // ENOENT is the ordinary case: a photo_url pointing at a file that is no
    // longer on disk. 404 lets next/image fall back instead of erroring.
    return new NextResponse(null, { status: 404 })
  }
}
