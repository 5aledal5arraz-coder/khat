/**
 * Phase 2.2 — read-only job-queue inspection CLI.
 *
 *   npm run jobs:inspect
 *
 * Operator-facing diagnostic. Counts by status, oldest pending, oldest
 * running, scheduled-by-type, and the last 5 dead jobs with truncated
 * error messages. No mutations. No `--confirm` option. Inspection only.
 *
 * Mutating CLIs (`requeue-dead`, `drain-pending`) are intentionally
 * deferred per the P2.2 plan. Build them when a real operator need
 * arises, not before.
 *
 * Hostname-guarded like every other Phase-1+ script. Refuses
 * managed-DB hostnames unless SMOKE_ALLOW_REMOTE=1.
 *
 * Exit code:
 *   0 — query succeeded (regardless of queue state)
 *   2 — guard refused or DB error
 */

import { Client } from "pg"

const SCRIPT_VERSION = "jobs-inspect-v1.0"

// ─── Hostname guard (mirrors prior P1+ scripts) ───────────────────────

const PRODUCTION_HOSTNAME_PATTERNS: RegExp[] = [
  /\.ondigitalocean\.com/i,
  /\.rds\.amazonaws\.com/i,
  /\.supabase\.co/i,
  /\.neon\.tech/i,
  /\.railway\.app/i,
  /\.heroku\.com/i,
  /\.azure\.com/i,
]

function isLocalConnection(s: string): { ok: boolean; reason?: string } {
  try {
    const url = new URL(s.replace(/^postgres(ql)?:\/\//, "http://"))
    const host = url.hostname.toLowerCase()
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return { ok: true }
    for (const pat of PRODUCTION_HOSTNAME_PATTERNS) {
      if (pat.test(host)) return { ok: false, reason: `hostname ${host} matches production pattern ${pat}.` }
    }
    return { ok: false, reason: `hostname ${host} is not localhost.` }
  } catch (err) {
    return { ok: false, reason: `could not parse DATABASE_URL: ${(err as Error).message}` }
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}
function padLeft(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s
}
function fmtNumber(n: number): string {
  return n.toLocaleString()
}
function ageBetween(now: Date, past: Date): string {
  const ms = now.getTime() - past.getTime()
  if (ms < 0) return "in the future"
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}
function truncate(s: string | null, n: number): string {
  if (!s) return "(no message)"
  return s.length > n ? s.slice(0, n) + "…" : s
}
function section(title: string) {
  console.log("")
  console.log(`══ ${title} ${"═".repeat(Math.max(0, 56 - title.length))}`)
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${SCRIPT_VERSION}]`)
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error(`[${SCRIPT_VERSION}] DATABASE_URL is not set — refusing`)
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[${SCRIPT_VERSION}] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
  } else {
    console.log(`[${SCRIPT_VERSION}] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed`)
  }

  const now = new Date()
  const c = new Client({ connectionString: databaseUrl })
  await c.connect()
  try {
    // ─── Counts by status ──────────────────────────────────────────────
    section("Counts by status")
    const counts = await c.query<{ status: string; n: number }>(
      `SELECT status, COUNT(*)::int AS n
       FROM jobs
       GROUP BY status
       ORDER BY status`,
    )
    const byStatus: Record<string, number> = {}
    for (const r of counts.rows) byStatus[r.status] = Number(r.n)
    const expectedStatuses = [
      "pending",
      "running",
      "succeeded",
      "failed",
      "dead",
      "cancelled",
    ] as const
    console.log(`  ${pad("Status", 14)}${padLeft("Count", 10)}`)
    console.log(`  ${"-".repeat(24)}`)
    for (const s of expectedStatuses) {
      console.log(`  ${pad(s, 14)}${padLeft(fmtNumber(byStatus[s] ?? 0), 10)}`)
    }

    // ─── 7d window for completed buckets ───────────────────────────────
    section("Last 7 days (by status)")
    const last7 = await c.query<{ status: string; n: number }>(
      `SELECT status, COUNT(*)::int AS n
       FROM jobs
       WHERE completed_at > NOW() - interval '7 days'
         AND status IN ('succeeded', 'failed', 'dead', 'cancelled')
       GROUP BY status
       ORDER BY status`,
    )
    if (last7.rows.length === 0) {
      console.log("  (no completed jobs in the last 7 days)")
    } else {
      console.log(`  ${pad("Status", 14)}${padLeft("Count (7d)", 12)}`)
      console.log(`  ${"-".repeat(26)}`)
      for (const r of last7.rows) {
        console.log(`  ${pad(r.status, 14)}${padLeft(fmtNumber(Number(r.n)), 12)}`)
      }
    }

    // ─── Oldest pending ────────────────────────────────────────────────
    section("Oldest pending job")
    const oldestPending = await c.query<{
      id: string
      type: string
      run_after: Date
      priority: number
      attempts: number
      max_attempts: number
    }>(
      `SELECT id, type, run_after, priority, attempts, max_attempts
       FROM jobs
       WHERE status = 'pending'
       ORDER BY run_after ASC
       LIMIT 1`,
    )
    if (oldestPending.rows.length === 0) {
      console.log("  (no pending jobs)")
    } else {
      const r = oldestPending.rows[0]
      console.log(`  Type:                  ${r.type}`)
      console.log(`  ID:                    ${r.id}`)
      console.log(`  run_after:             ${new Date(r.run_after).toISOString()}`)
      console.log(`  Age vs now:            ${ageBetween(now, new Date(r.run_after))}`)
      console.log(`  Priority:              ${r.priority}`)
      console.log(`  Attempts:              ${r.attempts}/${r.max_attempts}`)
    }

    // ─── Oldest running ────────────────────────────────────────────────
    section("Oldest running job (potential lease leak)")
    const oldestRunning = await c.query<{
      id: string
      type: string
      started_at: Date | null
      locked_at: Date | null
      locked_by: string | null
    }>(
      `SELECT id, type, started_at, locked_at, locked_by
       FROM jobs
       WHERE status = 'running'
       ORDER BY started_at ASC NULLS LAST
       LIMIT 1`,
    )
    if (oldestRunning.rows.length === 0) {
      console.log("  (no running jobs)")
    } else {
      const r = oldestRunning.rows[0]
      console.log(`  Type:                  ${r.type}`)
      console.log(`  ID:                    ${r.id}`)
      console.log(
        `  started_at:            ${r.started_at ? new Date(r.started_at).toISOString() : "(null)"}`,
      )
      console.log(
        `  locked_at:             ${r.locked_at ? new Date(r.locked_at).toISOString() : "(null)"}`,
      )
      console.log(`  locked_by:             ${r.locked_by ?? "(null)"}`)
      if (r.started_at) {
        console.log(`  Age vs now:            ${ageBetween(now, new Date(r.started_at))}`)
      }
    }

    // ─── Stale-lease count (lease window default 5 min) ────────────────
    section("Stale-lease running jobs (locked_at < NOW - 5 min)")
    const stale = await c.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM jobs
       WHERE status = 'running'
         AND locked_at IS NOT NULL
         AND locked_at < NOW() - interval '5 minutes'`,
    )
    const staleN = Number(stale.rows[0]?.n ?? 0)
    console.log(`  Count:                 ${staleN}`)
    if (staleN > 0) {
      console.log("  Action: the reaper inside the worker loop will pick these up")
      console.log("          on its next pass; expect this to drop to 0 within 5 min.")
    }

    // ─── Scheduled (pending) by type ───────────────────────────────────
    section("Pending jobs by type")
    const byType = await c.query<{ type: string; n: number; next_run: Date }>(
      `SELECT type, COUNT(*)::int AS n, MIN(run_after) AS next_run
       FROM jobs
       WHERE status = 'pending'
       GROUP BY type
       ORDER BY 2 DESC`,
    )
    if (byType.rows.length === 0) {
      console.log("  (no pending jobs)")
    } else {
      console.log(`  ${pad("Type", 30)}${padLeft("Count", 8)}  Next run_after`)
      console.log(`  ${"-".repeat(72)}`)
      for (const r of byType.rows) {
        console.log(
          `  ${pad(r.type, 30)}${padLeft(fmtNumber(Number(r.n)), 8)}  ${new Date(r.next_run).toISOString()}`,
        )
      }
    }

    // ─── Recent dead jobs ──────────────────────────────────────────────
    section("Recent dead jobs (last 5)")
    const dead = await c.query<{
      id: string
      type: string
      attempts: number
      max_attempts: number
      completed_at: Date | null
      error_message: string | null
    }>(
      `SELECT id, type, attempts, max_attempts, completed_at, error_message
       FROM jobs
       WHERE status = 'dead'
       ORDER BY COALESCE(completed_at, updated_at) DESC
       LIMIT 5`,
    )
    if (dead.rows.length === 0) {
      console.log("  (no dead jobs)")
    } else {
      for (const r of dead.rows) {
        console.log(
          `  ${r.completed_at ? new Date(r.completed_at).toISOString() : "(no completion ts)"}  ${pad(r.type, 30)}  attempts=${r.attempts}/${r.max_attempts}`,
        )
        console.log(`    error: ${truncate(r.error_message, 200)}`)
      }
    }

    section("Done")
    console.log(`  Snapshot at: ${now.toISOString()}`)
    console.log("")
  } finally {
    await c.end().catch(() => {})
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(`[${SCRIPT_VERSION}] fatal:`, err)
  process.exit(2)
})
