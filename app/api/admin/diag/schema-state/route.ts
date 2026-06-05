/**
 * TEMPORARY DIAGNOSTIC — Phase 1.6 verify.
 *
 * GET /api/admin/diag/schema-state
 *
 * Read-only. Returns a JSON snapshot of which tables and key columns
 * actually exist in the connected database vs which ones the application
 * code expects. Used once to confirm `db:push` + `post-schema.sql`
 * brought the local DB up to date.
 *
 * Will be deleted at the close of Phase 1.
 */

import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const EXPECTED_TABLES = [
  "admin_users",
  "admin_sessions",
  "admin_audit_logs",
  "guests",
  "guest_identity_profiles",
  "episodes",
  "episode_intelligence_records",
  "eir_phase_transitions",
  "khat_map_seasons",
  "khat_map_episode_candidates",
  "episode_preparations",
  "studio_sessions",
  "jobs",
  "system_events",
  "ai_runs",
  "ai_runs_summary",
  "ai_rate_limit_events",
  "jsonb_validation_events",
] as const

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "disabled_in_production" }, { status: 404 })
  }
  if (!db) {
    return NextResponse.json({ ok: false, error: "db_not_configured" }, { status: 200 })
  }

  // Tables present in DB
  const tablesRes = (await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)) as unknown as { rows: Array<{ table_name: string }> }
  const tablesPresent = new Set(tablesRes.rows.map((r) => r.table_name))

  // Columns for episode_intelligence_records (most-referenced)
  const eirColsRes = (await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'episode_intelligence_records'
    ORDER BY ordinal_position
  `)) as unknown as { rows: Array<{ column_name: string; data_type: string; is_nullable: string }> }

  // Columns for system_events
  const sysColsRes = (await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'system_events'
    ORDER BY ordinal_position
  `)) as unknown as { rows: Array<{ column_name: string; data_type: string }> }

  // Columns for jobs
  const jobsColsRes = (await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'jobs'
    ORDER BY ordinal_position
  `)) as unknown as { rows: Array<{ column_name: string; data_type: string }> }

  // Columns for ai_runs
  const aiColsRes = (await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'ai_runs'
    ORDER BY ordinal_position
  `)) as unknown as { rows: Array<{ column_name: string; data_type: string }> }

  // Row counts for the failing queries' target tables
  const counts: Record<string, number | string> = {}
  for (const t of ["episode_intelligence_records", "system_events", "jobs", "ai_runs", "guests", "khat_map_seasons"]) {
    if (!tablesPresent.has(t)) {
      counts[t] = "(table missing)"
      continue
    }
    try {
      const r = (await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${t}`))) as unknown as {
        rows: Array<{ n: number }>
      }
      counts[t] = r.rows[0]?.n ?? 0
    } catch (err) {
      counts[t] = `(count error: ${err instanceof Error ? err.message : String(err)})`
    }
  }

  const expectedPresent = EXPECTED_TABLES.filter((t) => tablesPresent.has(t))
  const expectedMissing = EXPECTED_TABLES.filter((t) => !tablesPresent.has(t))

  // Phase 11 — pending-jobs inspector. Operator hit "Fetch Market
  // Data", the page reports "update running in background", and
  // nothing finishes. The likeliest cause is that `khat-worker`
  // (npm run worker) is not running alongside `npm run dev`. Surface
  // every pending / running job so the operator can confirm.
  let jobsByStatus: unknown = null
  let recentJobs: unknown = null
  if (tablesPresent.has("jobs")) {
    try {
      const grouped = (await db.execute(sql`
        SELECT status, count(*)::int AS n
        FROM jobs
        GROUP BY status
        ORDER BY status
      `)) as unknown as { rows: Array<{ status: string; n: number }> }
      jobsByStatus = grouped.rows

      const recent = (await db.execute(sql`
        SELECT id, type, status, attempts, max_attempts, run_after, created_at,
               locked_by, locked_at, started_at, completed_at, error_message
        FROM jobs
        WHERE status IN ('pending', 'running')
           OR completed_at > now() - interval '1 hour'
        ORDER BY created_at DESC
        LIMIT 20
      `)) as unknown as {
        rows: Array<Record<string, unknown>>
      }
      recentJobs = recent.rows
    } catch (err) {
      jobsByStatus = `error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return NextResponse.json({
    ok: true,
    summary: {
      total_tables_in_db: tablesPresent.size,
      expected_tables_present: expectedPresent.length,
      expected_tables_missing: expectedMissing.length,
    },
    expected_tables_present: expectedPresent,
    expected_tables_missing: expectedMissing,
    columns: {
      episode_intelligence_records: eirColsRes.rows,
      system_events: sysColsRes.rows,
      jobs: jobsColsRes.rows,
      ai_runs: aiColsRes.rows,
    },
    row_counts: counts,
    jobs_by_status: jobsByStatus,
    recent_jobs: recentJobs,
    note: "If a table appears in expected_tables_missing, db:push did not create it. If a query in ops still fails despite the table being present, a column may be missing — compare columns[] against the SELECT list in the failing query. If jobs_by_status shows pending rows but worker isn't running, run `npm run worker` in a separate terminal.",
  })
}
