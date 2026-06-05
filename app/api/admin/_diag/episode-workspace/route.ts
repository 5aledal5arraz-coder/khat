/**
 * TEMPORARY DIAGNOSTIC — Phase 1 P0 recovery.
 *
 * GET /api/admin/_diag/episode-workspace?eirId=<uuid>
 *
 * Calls the same data loader that the failing `/admin/khat-brain/episodes/[eirId]`
 * page uses, catches any thrown error, and returns the error message + stack
 * as JSON. Read-only. Returns 200 either way (success-shape OR error-shape)
 * so that the network response is inspectable.
 *
 * This file should be deleted after the schema gap is identified and patched.
 */

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { loadEpisodeWorkspace } from "@/lib/khat-brain/episode-workspace"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const eirId = url.searchParams.get("eirId") ?? ""

  // Block in production — diagnostic only.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "disabled_in_production" }, { status: 404 })
  }

  if (!db) {
    return NextResponse.json({ ok: false, error: "db_not_configured" }, { status: 200 })
  }

  // Also try a raw introspection of the table — useful when the page error
  // is "column does not exist" so we can see what the DB actually has.
  let columns: unknown = null
  try {
    const { sql } = await import("drizzle-orm")
    const res = (await db.execute(
      sql`SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = 'episode_intelligence_records'
          ORDER BY ordinal_position`,
    )) as unknown as { rows: Array<{ column_name: string; data_type: string; is_nullable: string }> }
    columns = res.rows
  } catch (introspectErr) {
    columns = { introspect_failed: String(introspectErr) }
  }

  if (!eirId) {
    return NextResponse.json({ ok: true, columns, note: "no eirId passed; returning columns only" })
  }

  try {
    const ws = await loadEpisodeWorkspace(eirId)
    return NextResponse.json({ ok: true, found: ws !== null, columns })
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string; position?: string; routine?: string }
    return NextResponse.json({
      ok: false,
      error: e.message,
      name: e.name,
      pg_code: e.code ?? null,
      pg_detail: e.detail ?? null,
      pg_position: e.position ?? null,
      pg_routine: e.routine ?? null,
      stack_head: e.stack?.split("\n").slice(0, 8).join("\n") ?? null,
      columns,
    })
  }
}
