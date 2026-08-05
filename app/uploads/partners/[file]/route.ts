import { readFile, stat } from "fs/promises"
import path from "path"
import { NextResponse } from "next/server"

/**
 * Serve an uploaded partner logo, reading it from disk AT REQUEST TIME.
 *
 * ── THE BUG THIS EXISTS FOR ────────────────────────────────────────────────
 * Khaled uploaded a partner logo on 2026-08-05 and it did not appear on the
 * homepage. The row was correct (`is_active`, `show_on_homepage`, a real
 * `logo_url`) and the file was on disk at the full 2 MB — and
 * `/partners/<file>.png` still returned 404.
 *
 * Measured, not guessed: a logo written BEFORE the server started served 200;
 * one written AFTER it served 404; and a plain `pm2 restart` — no rebuild —
 * turned the 404 into a 200. Next resolves what lives under `public/` when the
 * server boots, so a file that appears later is invisible to it. Uploading a
 * logo therefore worked exactly once per deploy, and the admin reported
 * success every time, because the upload genuinely succeeded. Only the serving
 * failed, and nothing anywhere said so.
 *
 * `public/` is for assets that ship with the build. Anything a user uploads
 * while the server is running has to be read when it is asked for, which is
 * what this route does.
 *
 * The old `/partners/<file>` URLs still work for logos that predate this, so
 * existing rows are not broken; new uploads are written with `/uploads/...`.
 *
 * ── THE PATH IS THE ATTACK SURFACE ─────────────────────────────────────────
 * A filename arriving in a URL is untrusted. `basename` strips any directory
 * part, the pattern below then admits only the shape the uploader produces
 * (16 hex chars + a known image extension), and the resolved path is checked
 * to be inside PARTNERS_DIR. `../` cannot survive all three.
 */

const PARTNERS_DIR = path.join(process.cwd(), "public", "partners")

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

  const full = path.join(PARTNERS_DIR, name)
  // Belt and braces: `basename` already removed any traversal, but the
  // resolved path is what actually gets read, so that is what gets checked.
  if (!path.resolve(full).startsWith(path.resolve(PARTNERS_DIR) + path.sep)) {
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
