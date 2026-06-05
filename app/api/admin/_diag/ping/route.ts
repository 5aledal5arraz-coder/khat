/**
 * Phase 1 diagnostic — minimal probe to confirm if 503 affects all
 * /api/admin/_diag routes or only ones touching DB. Deleted after Phase 1.
 */
import { NextResponse } from "next/server"
export const dynamic = "force-dynamic"
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() })
}
