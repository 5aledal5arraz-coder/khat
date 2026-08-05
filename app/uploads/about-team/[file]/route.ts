import { readFile, stat } from "fs/promises"
import path from "path"
import { NextResponse } from "next/server"

/**
 * Serve an uploaded TEAM photo, reading it from disk AT REQUEST TIME.
 *
 * Identical in shape to app/uploads/partners/[file]/route.ts and for the same
 * reason, which is worth stating rather than cross-referencing: Next resolves
 * what lives under `public/` when the SERVER BOOTS, so a file written while the
 * site is running is invisible until a restart. A partner logo uploaded on
 * 2026-08-05 proved it — same file, 404 before a `pm2 restart` and 200 after,
 * with no rebuild in between — and the admin reported success every time,
 * because the upload genuinely succeeded. Only the serving failed, silently.
 *
 * `next dev` serves `public/` per request, so this can never be reproduced
 * locally. Shipping team photos through `public/` would have rebuilt the same
 * bug on a new page.
 *
 * THE PATH IS THE ATTACK SURFACE. A filename arriving in a URL is untrusted:
 * `basename` strips any directory part, the pattern admits only the shape the
 * uploader produces, and the resolved path is checked to sit inside TEAM_DIR.
 * `../` cannot survive all three.
 */

const TEAM_DIR = path.join(process.cwd(), "public", "team")

/** Exactly what app/api/admin/partnerships/upload/route.ts writes. */
const FILENAME = /^[a-f0-9]{8,32}\.(png|jpg|jpeg|webp|gif|svg)$/i

const CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
}

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params

  const name = path.basename(file)
  if (!FILENAME.test(name)) {
    return new NextResponse(null, { status: 404 })
  }

  const full = path.join(TEAM_DIR, name)
  // Belt and braces: `basename` already removed any traversal, but the
  // resolved path is what actually gets read, so that is what gets checked.
  if (!path.resolve(full).startsWith(path.resolve(TEAM_DIR) + path.sep)) {
    return new NextResponse(null, { status: 404 })
  }

  try {
    const info = await stat(full)
    if (!info.isFile()) return new NextResponse(null, { status: 404 })

    const body = await readFile(full)
    const ext = name.split(".").pop()!.toLowerCase()

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": CONTENT_TYPE[ext] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        // A logo is immutable — the uploader gives every file a random name, so
        // a changed logo is a different URL and this can be cached hard.
        "Cache-Control": "public, max-age=31536000, immutable",
        // An uploaded SVG can carry script. It is only ever rendered in an
        // <img>, which already neuters it, but the header says so out loud.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
