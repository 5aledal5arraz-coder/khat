import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

export const dynamic = "force-dynamic"

/**
 * Deployment fingerprint — returns the running build's BUILD_ID.
 *
 * Consumed by the admin VersionWatcher: a tab whose baseline differs from
 * the live value is running a stale client (its Server Action ids no
 * longer exist on the server → every mutation silently fails), so the
 * watcher prompts a reload. Public + contentless by design.
 */
export async function GET() {
  let buildId = "dev"
  try {
    buildId = (
      await readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8")
    ).trim()
  } catch {
    // Dev server / missing file — keep "dev" (watcher ignores it).
  }
  return NextResponse.json(
    { buildId },
    { headers: { "Cache-Control": "no-store" } },
  )
}
