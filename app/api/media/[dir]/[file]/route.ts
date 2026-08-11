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
])

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
}

// Upload filenames are `crypto.randomBytes(8).toString("hex")` + a verified
// extension. Anything outside that alphabet is not a file we wrote.
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/

export async function GET(
  _request: Request,
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

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(info.size),
        // Filenames are random per upload — replacing a guest photo mints a new
        // name — so a served URL never changes content and can be cached hard.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    // ENOENT is the ordinary case: a photo_url pointing at a file that is no
    // longer on disk. 404 lets next/image fall back instead of erroring.
    return new NextResponse(null, { status: 404 })
  }
}
