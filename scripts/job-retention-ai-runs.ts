/**
 * Phase 1.5 — retention CLI shell.
 *
 *   npm run jobs:retention-ai-runs                # dry-run (default)
 *   npm run jobs:retention-ai-runs -- --confirm   # actually mutate
 *   npm run jobs:retention-ai-runs -- --confirm --max-rows 10000
 *
 * Wraps lib/jobs/retention.runRetentionJob() with:
 *   • hostname guard (reuses the P1.2/P1.4 pattern)
 *   • flag parsing
 *   • verbose output formatting
 *   • exit code: 0 = success (dry-run or wet), 2 = guard refused / DB error
 *
 * No cron wiring. Manual command only.
 */

import { runRetentionJob, DEFAULT_MAX_ROWS } from "@/lib/jobs/retention"
import type { RetentionResult } from "@/lib/jobs/retention"

const SCRIPT_VERSION = "retention-cli-v1.0"

// ─── Hostname guard (same patterns as smoke-spine-joins) ─────────────

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

// ─── Flag parsing ─────────────────────────────────────────────────────

interface Args {
  confirm: boolean
  maxRows: number
}

function parseArgs(argv: string[]): Args {
  const out: Args = { confirm: false, maxRows: DEFAULT_MAX_ROWS }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--confirm" || a === "-c") out.confirm = true
    else if (a === "--max-rows" || a === "-n") {
      const v = argv[++i]
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid --max-rows: ${v}`)
        process.exit(2)
      }
      out.maxRows = Math.floor(n)
    } else if (a === "--help" || a === "-h") {
      printUsage()
      process.exit(0)
    } else {
      console.error(`Unknown flag: ${a}`)
      printUsage()
      process.exit(2)
    }
  }
  return out
}

function printUsage() {
  console.log("Usage: npm run jobs:retention-ai-runs [-- --confirm] [--max-rows N]")
  console.log("")
  console.log("  --confirm     actually mutate the DB (default: dry-run)")
  console.log("  --max-rows N  cap rows processed per invocation (default: 50_000)")
  console.log("")
  console.log("Refuses to run against managed-DB hostnames unless SMOKE_ALLOW_REMOTE=1.")
}

// ─── Report formatter ────────────────────────────────────────────────

function fmtNumber(n: number): string {
  return n.toLocaleString()
}

function printReport(r: RetentionResult) {
  console.log("")
  console.log(`Mode:    ${r.dry_run ? "DRY-RUN (no changes applied)" : "CONFIRMED (mutations committed)"}`)
  console.log("")
  console.log("Cutoffs:")
  console.log(`  ai_runs stripped before:                 ${r.cutoffs.ai_runs_strip_before}`)
  console.log(`  jsonb_validation_events deleted before:  ${r.cutoffs.jve_delete_before}`)
  console.log(`  ai_rate_limit_events deleted before:     ${r.cutoffs.arle_delete_before}`)
  console.log("")
  console.log("ai_runs (strip-and-keep):")
  console.log(`  Candidates older than cutoff:            ${fmtNumber(r.ai_runs.candidates)}`)
  console.log(`  Distinct (task_kind, prompt_version):    ${fmtNumber(r.ai_runs.distinct_versions)}`)
  console.log(`  Protected (earliest per version):        ${fmtNumber(r.ai_runs.protected_per_version)}`)
  if (r.dry_run) {
    console.log(`  Would strip:                             ${fmtNumber(r.ai_runs.would_strip)}`)
  } else {
    console.log(`  Stripped:                                ${fmtNumber(r.ai_runs.stripped)}`)
  }
  if (r.ai_runs.earliest_completed_at) {
    console.log(`  Earliest candidate completed_at:         ${r.ai_runs.earliest_completed_at}`)
  }
  console.log("")
  console.log("ai_runs_summary (monthly roll-up):")
  if (r.dry_run) {
    console.log(`  (counts available only in --confirm mode)`)
  } else {
    console.log(`  New monthly rows:                        ${fmtNumber(r.ai_runs_summary.new_monthly_rows)}`)
    console.log(`  Updated monthly rows:                    ${fmtNumber(r.ai_runs_summary.updated_monthly_rows)}`)
    console.log(`  Aggregated source runs:                  ${fmtNumber(r.ai_runs_summary.aggregated_run_count)}`)
  }
  console.log("")
  console.log("jsonb_validation_events (delete report/scanner; keep enforce):")
  console.log(`  Candidates older than cutoff:            ${fmtNumber(r.jsonb_validation_events.candidates)}`)
  console.log(`  Skipped (mode='enforce'):                ${fmtNumber(r.jsonb_validation_events.skipped_enforce)}`)
  if (r.dry_run) {
    console.log(`  Would delete:                            ${fmtNumber(r.jsonb_validation_events.would_delete)}`)
  } else {
    console.log(`  Deleted:                                 ${fmtNumber(r.jsonb_validation_events.deleted)}`)
  }
  console.log("")
  console.log("Untouched:")
  console.log("  eir_phase_transitions, admin_audit_logs, khat_map_season_decisions")
  console.log("")
  console.log(`Wall time: ${r.wall_ms} ms`)
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[retention] ${SCRIPT_VERSION}`)
  const args = parseArgs(process.argv)

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[retention] DATABASE_URL is not set — refusing to run")
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[retention] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
  } else {
    console.log("[retention] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed")
  }

  if (!args.confirm) {
    console.log("[retention] DRY-RUN — no changes will be applied. Add --confirm to mutate.")
  } else {
    console.log("[retention] CONFIRMED — mutations will be applied inside one transaction.")
    console.log("[retention] WARNING: stripped JSONB snapshots are unrecoverable except from backup.")
  }

  let result: RetentionResult
  try {
    result = await runRetentionJob({
      dryRun: !args.confirm,
      maxRows: args.maxRows,
    })
  } catch (err) {
    console.error("[retention] FAILED:", (err as Error).message)
    if (err instanceof Error && err.stack) console.error(err.stack)
    process.exit(2)
  }

  printReport(result)

  if (result.dry_run) {
    console.log("")
    console.log("[retention] DRY-RUN complete. Run with --confirm to apply.")
  } else {
    console.log("")
    console.log("[retention] CONFIRMED run complete.")
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("[retention] fatal:", err)
  process.exit(2)
})
