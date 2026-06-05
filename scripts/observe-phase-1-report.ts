/**
 * Phase 1.7 — REPORT-mode observation hook.
 *
 *   npm run observe:phase-1-report
 *
 * Read-only aggregates over the three substrate telemetry tables.
 * Designed to be eyeballed (or pasted into the closure doc) once a
 * day during the 7-day REPORT observation window before flipping any
 * mode flag to `enforce`.
 *
 *   • jsonb_validation_events   — drift rate per table+column
 *   • ai_rate_limit_events      — decision distribution + would-block volume
 *   • ai_runs                   — stale 'running' rows (concurrency leak signal)
 *   • ai_subject_locks          — stale lock rows
 *
 * No writes. No schema changes. No DB mutations of any kind.
 *
 * Hostname guard: same pattern as every other Phase-1 smoke. Refuses
 * managed-DB hostnames unless SMOKE_ALLOW_REMOTE=1.
 */

import { Client } from "pg"
// P2.3.e — eat-your-own-dog-food: the observation report uses the
// new read API in lib/system-events/queries.ts. Same module the future
// dashboard will use. The script that runs every reporting cycle is
// the integration test for the read layer.
import {
  listEvents,
  countBySource,
  countBySourceSeverity,
  topErrors,
} from "@/lib/system-events/queries"
import {
  SYSTEM_EVENT_SOURCES,
  SYSTEM_EVENT_SEVERITIES,
} from "@/lib/db/schema/system-events"

const SCRIPT_VERSION = "observe-phase-1-report-v1.1"

// ─── Hostname guard ──────────────────────────────────────────────────

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

function fmtNumber(n: number | null): string {
  if (n === null) return "—"
  return n.toLocaleString()
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s
}

function section(title: string) {
  console.log("")
  console.log(`══ ${title} ${"═".repeat(Math.max(0, 60 - title.length))}`)
}

async function main() {
  console.log(`[${SCRIPT_VERSION}] read-only Phase-1 REPORT-mode observation`)
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

  const c = new Client({ connectionString: databaseUrl })
  await c.connect()

  try {
    // ─── jsonb_validation_events ────────────────────────────────────
    section("P1.3 — jsonb_validation_events")

    const jveTotals = await c.query<{ window: string; n: number; modes: string }>(
      `SELECT
         '24h' AS window,
         COUNT(*)::int AS n,
         string_agg(DISTINCT mode, ',' ORDER BY mode) AS modes
       FROM jsonb_validation_events
       WHERE created_at > NOW() - interval '24 hours'
       UNION ALL
       SELECT
         '7d', COUNT(*)::int,
         string_agg(DISTINCT mode, ',' ORDER BY mode)
       FROM jsonb_validation_events
       WHERE created_at > NOW() - interval '7 days'
       UNION ALL
       SELECT 'all', COUNT(*)::int, string_agg(DISTINCT mode, ',' ORDER BY mode)
       FROM jsonb_validation_events`,
    )
    console.log(`  ${pad("Window", 8)}${pad("Events", 10)}Modes`)
    for (const r of jveTotals.rows) {
      console.log(`  ${pad(r.window, 8)}${pad(fmtNumber(r.n), 10)}${r.modes ?? "—"}`)
    }

    const jveByColumn = await c.query<{
      table_name: string
      column_name: string
      mode: string
      n: number
    }>(
      `SELECT table_name, column_name, mode, COUNT(*)::int AS n
       FROM jsonb_validation_events
       WHERE created_at > NOW() - interval '7 days'
       GROUP BY 1, 2, 3
       ORDER BY 4 DESC
       LIMIT 25`,
    )
    if (jveByColumn.rows.length === 0) {
      console.log("  (no drift in last 7 days)")
    } else {
      console.log("")
      console.log(`  ${pad("Table", 30)}${pad("Column", 30)}${pad("Mode", 10)}${padLeft("Events (7d)", 12)}`)
      console.log(`  ${"-".repeat(82)}`)
      for (const r of jveByColumn.rows) {
        console.log(
          `  ${pad(r.table_name, 30)}${pad(r.column_name, 30)}${pad(r.mode, 10)}${padLeft(fmtNumber(r.n), 12)}`,
        )
      }
    }

    // ─── ai_rate_limit_events ───────────────────────────────────────
    section("P1.6 — ai_rate_limit_events")

    const arleTotals = await c.query<{ window: string; n: number }>(
      `SELECT '24h' AS window, COUNT(*)::int AS n
       FROM ai_rate_limit_events WHERE created_at > NOW() - interval '24 hours'
       UNION ALL
       SELECT '7d', COUNT(*)::int
       FROM ai_rate_limit_events WHERE created_at > NOW() - interval '7 days'
       UNION ALL
       SELECT 'all', COUNT(*)::int FROM ai_rate_limit_events`,
    )
    console.log(`  ${pad("Window", 8)}${pad("Events", 10)}`)
    for (const r of arleTotals.rows) {
      console.log(`  ${pad(r.window, 8)}${pad(fmtNumber(r.n), 10)}`)
    }

    const arleByDecision = await c.query<{
      mode: string
      decision: string
      enforced: string
      n: number
    }>(
      `SELECT mode, decision, enforced, COUNT(*)::int AS n
       FROM ai_rate_limit_events
       WHERE created_at > NOW() - interval '7 days'
       GROUP BY 1, 2, 3
       ORDER BY 4 DESC`,
    )
    console.log("")
    if (arleByDecision.rows.length === 0) {
      console.log("  (no rate-limit events in last 7 days)")
    } else {
      console.log(
        `  ${pad("Mode", 10)}${pad("Decision", 24)}${pad("Enforced", 10)}${padLeft("Events (7d)", 12)}`,
      )
      console.log(`  ${"-".repeat(56)}`)
      for (const r of arleByDecision.rows) {
        console.log(
          `  ${pad(r.mode, 10)}${pad(r.decision, 24)}${pad(r.enforced, 10)}${padLeft(fmtNumber(r.n), 12)}`,
        )
      }
    }

    // What WOULD have been blocked in the last 7d (REPORT → enforce signal).
    const wouldBlock = await c.query<{ decision: string; n: number }>(
      `SELECT decision, COUNT(*)::int AS n
       FROM ai_rate_limit_events
       WHERE created_at > NOW() - interval '7 days'
         AND decision LIKE 'blocked_%'
       GROUP BY 1
       ORDER BY 2 DESC`,
    )
    console.log("")
    if (wouldBlock.rows.length === 0) {
      console.log("  Would-have-been-blocked in 7d:  0  (safe to consider enforce flip)")
    } else {
      console.log("  Would-have-been-blocked in 7d:")
      for (const r of wouldBlock.rows) {
        console.log(`    ${pad(r.decision, 24)}${padLeft(fmtNumber(r.n), 8)}`)
      }
    }

    // ─── ai_runs — stale running rows ────────────────────────────────
    section("P1.6 health — stale 'running' ai_runs (concurrency leak signal)")
    const stale = await c.query<{ n: number; oldest: Date | null }>(
      `SELECT COUNT(*)::int AS n,
              MIN(started_at) AS oldest
       FROM ai_runs
       WHERE status = 'running'
         AND started_at < NOW() - interval '10 minutes'`,
    )
    const sN = stale.rows[0]?.n ?? 0
    const sO = stale.rows[0]?.oldest ?? null
    console.log(`  Stale 'running' rows (>10 min):  ${fmtNumber(sN)}`)
    if (sO) console.log(`  Oldest started_at:               ${new Date(sO).toISOString()}`)
    if (sN > 0) {
      console.log("  Action: a generator likely crashed without UPDATE-ing ai_runs.status.")
      console.log("          Investigate; this counts against the rate-limit concurrency cap.")
    }

    // ─── ai_subject_locks ────────────────────────────────────────────
    section("P1.6 health — ai_subject_locks (orphan check)")
    const locks = await c.query<{ n: number; n_stale: number; oldest: Date | null }>(
      `SELECT COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE acquired_at < NOW() - interval '10 minutes')::int AS n_stale,
              MIN(acquired_at) AS oldest
       FROM ai_subject_locks`,
    )
    const lN = locks.rows[0]?.n ?? 0
    const lS = locks.rows[0]?.n_stale ?? 0
    const lO = locks.rows[0]?.oldest ?? null
    console.log(`  Active subject locks:            ${fmtNumber(lN)}`)
    console.log(`  Stale subject locks (>10 min):   ${fmtNumber(lS)}`)
    if (lO) console.log(`  Oldest acquired_at:              ${new Date(lO).toISOString()}`)

    // ─── ai_runs prompt_version coverage ─────────────────────────────
    section("P0 — prompt_version coverage on ai_runs")
    const pv = await c.query<{ total: number; versioned: number; pct: string }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE prompt_version IS NOT NULL)::int AS versioned,
              CASE WHEN COUNT(*) = 0 THEN '—'
                ELSE round(100.0 * COUNT(*) FILTER (WHERE prompt_version IS NOT NULL)
                          / COUNT(*), 1) || '%' END AS pct
       FROM ai_runs
       WHERE started_at > NOW() - interval '7 days'`,
    )
    const pvRow = pv.rows[0] ?? { total: 0, versioned: 0, pct: "—" }
    console.log(`  ai_runs in last 7d:              ${fmtNumber(pvRow.total)}`)
    console.log(`  With prompt_version:             ${fmtNumber(pvRow.versioned)}  (${pvRow.pct})`)
    if (pvRow.total > 0 && pvRow.versioned === 0) {
      console.log("  Note: no versioned-prompt traffic yet — expected if Phase 2 generator")
      console.log("        migration hasn't started.")
    }

    // ─── P2.1 — EIR invalid-transition audit ─────────────────────────
    section("P2.1 — EIR invalid-transition audit")

    const eitaTotals = await c.query<{ window: string; n: number; modes: string | null }>(
      `SELECT
         '24h' AS window,
         COUNT(*)::int AS n,
         string_agg(DISTINCT mode, ',' ORDER BY mode) AS modes
       FROM eir_invalid_transition_attempts
       WHERE attempted_at > NOW() - interval '24 hours'
       UNION ALL
       SELECT '7d', COUNT(*)::int, string_agg(DISTINCT mode, ',' ORDER BY mode)
       FROM eir_invalid_transition_attempts
       WHERE attempted_at > NOW() - interval '7 days'
       UNION ALL
       SELECT 'all', COUNT(*)::int, string_agg(DISTINCT mode, ',' ORDER BY mode)
       FROM eir_invalid_transition_attempts`,
    )
    console.log(`  ${pad("Window", 8)}${pad("Events", 10)}Modes`)
    for (const r of eitaTotals.rows) {
      console.log(`  ${pad(r.window, 8)}${pad(fmtNumber(r.n), 10)}${r.modes ?? "—"}`)
    }

    const eitaTopPairs = await c.query<{
      from_phase: string | null
      attempted_to_phase: string
      mode: string
      n: number
    }>(
      `SELECT from_phase, attempted_to_phase, mode, COUNT(*)::int AS n
       FROM eir_invalid_transition_attempts
       WHERE attempted_at > NOW() - interval '7 days'
       GROUP BY 1, 2, 3
       ORDER BY 4 DESC
       LIMIT 10`,
    )
    if (eitaTopPairs.rows.length === 0) {
      console.log("  (no illegal-transition attempts in last 7 days)")
    } else {
      console.log("")
      console.log(
        `  ${pad("from_phase", 22)}${pad("→ attempted_to_phase", 26)}${pad("mode", 10)}${padLeft("count (7d)", 12)}`,
      )
      console.log(`  ${"-".repeat(70)}`)
      for (const r of eitaTopPairs.rows) {
        console.log(
          `  ${pad(r.from_phase ?? "(null)", 22)}${pad("→ " + r.attempted_to_phase, 26)}${pad(r.mode, 10)}${padLeft(fmtNumber(r.n), 12)}`,
        )
      }
    }

    const eitaRecent = await c.query<{
      attempted_at: Date
      actor: string | null
      from_phase: string | null
      attempted_to_phase: string
      mode: string
    }>(
      `SELECT attempted_at, actor, from_phase, attempted_to_phase, mode
       FROM eir_invalid_transition_attempts
       ORDER BY attempted_at DESC
       LIMIT 3`,
    )
    if (eitaRecent.rows.length > 0) {
      console.log("")
      console.log("  Most recent attempts:")
      for (const r of eitaRecent.rows) {
        console.log(
          `    ${new Date(r.attempted_at).toISOString()}  actor=${r.actor ?? "(none)"}  ${r.from_phase ?? "(null)"}→${r.attempted_to_phase}  mode=${r.mode}`,
        )
      }
    }

    // ─── P2.1 — ai-runs-sweeper health ───────────────────────────────
    section("P2.1 — ai-runs-sweeper health")

    const lastSweep = await c.query<{ last_at: Date | null; total: number }>(
      `SELECT MAX(completed_at) AS last_at,
              COUNT(*)::int AS total
       FROM ai_runs
       WHERE error_class = 'stale_sweep'`,
    )
    const lastSweepRow = lastSweep.rows[0] ?? { last_at: null, total: 0 }
    console.log(
      `  Last sweeper reclaim observed:  ${lastSweepRow.last_at ? new Date(lastSweepRow.last_at).toISOString() : "(none yet)"}`,
    )
    console.log(`  Total stale-sweep reclaims:     ${fmtNumber(lastSweepRow.total)}`)

    const staleNow = await c.query<{ n: number; oldest: Date | null }>(
      `SELECT COUNT(*)::int AS n,
              MIN(started_at) AS oldest
       FROM ai_runs
       WHERE status = 'running'
         AND started_at < NOW() - interval '15 minutes'`,
    )
    const staleRow = staleNow.rows[0] ?? { n: 0, oldest: null }
    console.log(`  Current stale 'running' rows:   ${fmtNumber(staleRow.n)}`)
    if (staleRow.oldest) {
      console.log(`    Oldest started_at:            ${new Date(staleRow.oldest).toISOString()}`)
    }

    const staleLocks = await c.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM ai_subject_locks
       WHERE acquired_at < NOW() - interval '10 minutes'`,
    )
    console.log(
      `  Current stale subject locks:    ${fmtNumber(staleLocks.rows[0]?.n ?? 0)}`,
    )

    const nextSweep = await c.query<{ run_after: Date | null }>(
      `SELECT MIN(run_after) AS run_after
       FROM jobs
       WHERE type = 'ai-runs-sweeper'
         AND status = 'pending'`,
    )
    const nextSweepAt = nextSweep.rows[0]?.run_after ?? null
    console.log(
      `  Next scheduled sweep:           ${nextSweepAt ? new Date(nextSweepAt).toISOString() : "(not scheduled — worker daemon may not be running)"}`,
    )

    // ─── P2.2 — worker / queue health ────────────────────────────────
    section("P2.2 — worker / queue health")

    const jobCounts = await c.query<{ status: string; n: number }>(
      `SELECT status, COUNT(*)::int AS n FROM jobs GROUP BY status`,
    )
    const byStatus: Record<string, number> = {}
    for (const r of jobCounts.rows) byStatus[r.status] = Number(r.n)
    console.log("  Counts (by status):")
    for (const s of ["pending", "running", "succeeded", "failed", "dead", "cancelled"]) {
      console.log(`    ${pad(s + ":", 12)}${padLeft(fmtNumber(byStatus[s] ?? 0), 10)}`)
    }

    const oldestPendingJob = await c.query<{ run_after: Date | null; type: string | null }>(
      `SELECT run_after, type FROM jobs
       WHERE status = 'pending'
       ORDER BY run_after ASC
       LIMIT 1`,
    )
    const pendingRow = oldestPendingJob.rows[0]
    if (pendingRow) {
      console.log("")
      console.log(`  Oldest pending job:`)
      console.log(`    run_after:  ${new Date(pendingRow.run_after!).toISOString()}`)
      console.log(`    type:       ${pendingRow.type ?? "(unknown)"}`)
    } else {
      console.log("")
      console.log("  Oldest pending job:           (none)")
    }

    const oldestRunningJob = await c.query<{
      started_at: Date | null
      locked_at: Date | null
      type: string | null
    }>(
      `SELECT started_at, locked_at, type FROM jobs
       WHERE status = 'running'
       ORDER BY started_at ASC NULLS LAST
       LIMIT 1`,
    )
    const runningRow = oldestRunningJob.rows[0]
    if (runningRow) {
      console.log("")
      console.log(`  Oldest running job:`)
      console.log(
        `    started_at: ${runningRow.started_at ? new Date(runningRow.started_at).toISOString() : "(null)"}`,
      )
      console.log(
        `    locked_at:  ${runningRow.locked_at ? new Date(runningRow.locked_at).toISOString() : "(null)"}`,
      )
      console.log(`    type:       ${runningRow.type ?? "(unknown)"}`)
    } else {
      console.log("")
      console.log("  Oldest running job:           (none)")
    }

    const staleLease = await c.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM jobs
       WHERE status = 'running'
         AND locked_at IS NOT NULL
         AND locked_at < NOW() - interval '5 minutes'`,
    )
    console.log("")
    console.log(
      `  Stale-lease running jobs:     ${fmtNumber(staleLease.rows[0]?.n ?? 0)}`,
    )
    console.log("    (locked_at older than the 5-min lease window; reaper picks up)")

    const recentDead = await c.query<{
      type: string
      attempts: number
      max_attempts: number
      completed_at: Date | null
      error_message: string | null
    }>(
      `SELECT type, attempts, max_attempts, completed_at, error_message
       FROM jobs
       WHERE status = 'dead'
         AND COALESCE(completed_at, updated_at) > NOW() - interval '24 hours'
       ORDER BY COALESCE(completed_at, updated_at) DESC
       LIMIT 5`,
    )
    console.log("")
    console.log("  Recent dead jobs (24h):")
    if (recentDead.rows.length === 0) {
      console.log("    (none)")
    } else {
      for (const r of recentDead.rows) {
        const ts = r.completed_at ? new Date(r.completed_at).toISOString() : "(no ts)"
        const msg = r.error_message
          ? r.error_message.length > 80
            ? r.error_message.slice(0, 80) + "…"
            : r.error_message
          : "(no message)"
        console.log(
          `    ${ts}  ${r.type}  attempts=${r.attempts}/${r.max_attempts}`,
        )
        console.log(`      error: ${msg}`)
      }
    }

    // ─── P2.3 — system events (24h) ──────────────────────────────────
    //
    // Consumes lib/system-events/queries.ts directly — same read API
    // the future P2.5 dashboard will use. Eat-your-own-dog-food per
    // operator P2.3.e §10 Q3.
    section("P2.3 — system events (24h)")

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const now = new Date()

    // 1. Counts by source × severity matrix.
    const matrix = await countBySourceSeverity({ since: since24h, until: now })
    const byPair: Record<string, number> = {}
    for (const r of matrix) byPair[`${r.source}|${r.severity}`] = r.count

    const SEVERITIES_PADDED = SYSTEM_EVENT_SEVERITIES // info, warn, error
    console.log("  Counts by source × severity (24h):")
    console.log(
      `    ${pad("source", 14)}${SEVERITIES_PADDED.map((s) => padLeft(s, 8)).join("")}${padLeft("total", 8)}`,
    )
    console.log(`    ${"-".repeat(14 + 8 * SEVERITIES_PADDED.length + 8)}`)
    let grandTotal = 0
    for (const src of SYSTEM_EVENT_SOURCES) {
      const cells = SEVERITIES_PADDED.map(
        (sev) => byPair[`${src}|${sev}`] ?? 0,
      )
      const rowTotal = cells.reduce((a, b) => a + b, 0)
      grandTotal += rowTotal
      console.log(
        `    ${pad(src, 14)}${cells
          .map((n) => padLeft(fmtNumber(n), 8))
          .join("")}${padLeft(fmtNumber(rowTotal), 8)}`,
      )
    }
    console.log(`    ${"-".repeat(14 + 8 * SEVERITIES_PADDED.length + 8)}`)
    console.log(`    ${pad("TOTAL", 14)}${padLeft(fmtNumber(grandTotal), 8 * SEVERITIES_PADDED.length + 8)}`)

    // 2. Sanity bridge — `countBySource` should equal the row totals
    //    of the matrix. Cheap consistency check; flags read-API
    //    regressions early.
    const bySource = await countBySource({ since: since24h, until: now })
    const bySourceTotal = bySource.reduce((a, r) => a + r.count, 0)
    if (bySourceTotal !== grandTotal) {
      console.log(
        `  WARNING: countBySource total (${fmtNumber(bySourceTotal)}) != ` +
          `countBySourceSeverity total (${fmtNumber(grandTotal)}) — ` +
          `read-API drift?`,
      )
    }

    // 3. Top 5 recent warn/error events (last 24h).
    console.log("")
    console.log("  Top recent warn/error events (24h, up to 5):")
    const errs = await topErrors({ since: since24h, limit: 5 })
    if (errs.length === 0) {
      console.log("    (none)")
    } else {
      for (const e of errs) {
        const ts = e.event_at.toISOString()
        const subj =
          e.subject_kind && e.subject_id
            ? `${e.subject_kind}:${e.subject_id}`
            : "-"
        const payloadStr = JSON.stringify(e.payload)
        const payloadPreview =
          payloadStr.length > 60
            ? payloadStr.slice(0, 60) + "…"
            : payloadStr
        console.log(
          `    ${ts}  ${pad(e.severity, 5)} ${e.source}.${e.event_type}  ${subj}`,
        )
        console.log(`      payload: ${payloadPreview}`)
        if (e.actor) console.log(`      actor:   ${e.actor}`)
      }
    }

    // 4. Subject_kind distribution (24h). Uses listEvents to sample;
    //    the dashboard's eventual aggregator can do an exact count
    //    when needed. Sample size capped by listEvents' clamped limit.
    console.log("")
    console.log("  Subject distribution (24h, sample up to 500):")
    const sample = await listEvents({ since: since24h, limit: 500 })
    const subjectCounts: Record<string, number> = {}
    for (const r of sample) {
      const key = r.subject_kind ?? "(no subject)"
      subjectCounts[key] = (subjectCounts[key] ?? 0) + 1
    }
    const subjectEntries = Object.entries(subjectCounts).sort(
      (a, b) => b[1] - a[1],
    )
    if (subjectEntries.length === 0) {
      console.log("    (no events sampled)")
    } else {
      for (const [kind, n] of subjectEntries) {
        console.log(`    ${pad(kind, 30)}${padLeft(fmtNumber(n), 8)}`)
      }
      if (sample.length === 500) {
        console.log("    (sample capped at 500 — true counts may be larger)")
      }
    }

    // 5. Last-event timestamp — confirms the writers are alive.
    const lastEvent = sample[0]
    if (lastEvent) {
      console.log("")
      console.log(`  Most recent event: ${lastEvent.event_at.toISOString()}  (${lastEvent.source}.${lastEvent.event_type})`)
    } else {
      console.log("")
      console.log("  Most recent event: (none in 24h)")
    }

    section("Summary")
    console.log(`  All counts above reflect the LOCAL DB at ${new Date().toISOString()}.`)
    console.log("  Paste this run's output into docs/phase-1-closure.md under")
    console.log("  '7-day REPORT-mode observation' before flipping any enforce flag.")
    console.log("")
  } finally {
    await c.end().catch(() => {})
  }
}

main().catch((err) => {
  console.error(`[${SCRIPT_VERSION}] fatal:`, err)
  process.exit(2)
})
