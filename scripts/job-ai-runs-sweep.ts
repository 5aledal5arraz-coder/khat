/**
 * Phase 2.1 (P2.1.b) — stale-running ai_runs sweeper CLI shell.
 *
 *   npm run jobs:ai-runs-sweep                # dry-run (default)
 *   npm run jobs:ai-runs-sweep -- --confirm   # actually mutate
 *   npm run jobs:ai-runs-sweep -- --confirm --max-rows 1000
 *
 * Wraps `lib/jobs/handlers/ai-runs-sweeper.ts::runAiRunsSweep` with:
 *   • Hostname guard (reuses the P1.2/P1.4/P1.5 pattern)
 *   • Flag parsing
 *   • Verbose output formatting
 *   • Exit code: 0 success (dry-run or wet), 2 guard refused / DB error
 *
 * No cron wiring. Manual command only. The worker-bootstrap that ticks
 * this on a schedule is P2.1.f.
 */

import {
  runAiRunsSweep,
  DEFAULT_MAX_ROWS,
  DEFAULT_STALE_AFTER_MS,
  readSweepEnv,
} from "@/lib/jobs/handlers/ai-runs-sweeper"
import type { SweepResult } from "@/lib/jobs/handlers/ai-runs-sweeper"

const SCRIPT_VERSION = "ai-runs-sweep-cli-v1.0"

// ─── Hostname guard (mirrors smoke-spine-joins / job-retention-ai-runs) ─

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
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return { ok: true }
    }
    for (const pat of PRODUCTION_HOSTNAME_PATTERNS) {
      if (pat.test(host)) {
        return { ok: false, reason: `hostname ${host} matches production pattern ${pat}.` }
      }
    }
    return { ok: false, reason: `hostname ${host} is not localhost.` }
  } catch (err) {
    return { ok: false, reason: `could not parse DATABASE_URL: ${(err as Error).message}` }
  }
}

// ─── Flag parsing ──────────────────────────────────────────────────────

interface Args {
  confirm: boolean
  maxRows: number | null
  staleAfterMs: number | null
}

function parseArgs(argv: string[]): Args {
  const env = readSweepEnv()
  const out: Args = { confirm: false, maxRows: null, staleAfterMs: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--confirm" || a === "-c") {
      out.confirm = true
    } else if (a === "--max-rows" || a === "-n") {
      const v = argv[++i]
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid --max-rows: ${v}`)
        process.exit(2)
      }
      out.maxRows = Math.floor(n)
    } else if (a === "--stale-ms") {
      const v = argv[++i]
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid --stale-ms: ${v}`)
        process.exit(2)
      }
      out.staleAfterMs = Math.floor(n)
    } else if (a === "--help" || a === "-h") {
      printUsage(env.maxRows, env.staleAfterMs)
      process.exit(0)
    } else {
      console.error(`Unknown flag: ${a}`)
      printUsage(env.maxRows, env.staleAfterMs)
      process.exit(2)
    }
  }
  return out
}

function printUsage(envMax: number, envStaleMs: number) {
  console.log("Usage: npm run jobs:ai-runs-sweep [-- --confirm] [--max-rows N] [--stale-ms MS]")
  console.log("")
  console.log("  --confirm      actually mutate the DB (default: dry-run)")
  console.log(`  --max-rows N   cap rows reclaimed per invocation (default: ${envMax})`)
  console.log(`  --stale-ms MS  stale-threshold in ms (default: ${envStaleMs})`)
  console.log("")
  console.log("Refuses to run against managed-DB hostnames unless SMOKE_ALLOW_REMOTE=1.")
}

// ─── Report formatter ──────────────────────────────────────────────────

function fmtNumber(n: number): string {
  return n.toLocaleString()
}

function printReport(r: SweepResult, args: Args, env: { maxRows: number; staleAfterMs: number }) {
  console.log("")
  console.log(
    `Mode:    ${r.dry_run ? "DRY-RUN (no changes applied)" : "CONFIRMED (mutations committed)"}`,
  )
  console.log("")
  console.log("Policy:")
  console.log(`  Stale threshold (ms):    ${args.staleAfterMs ?? env.staleAfterMs}`)
  console.log(`  Max rows per invocation: ${args.maxRows ?? env.maxRows}`)
  console.log(`  Cutoff (older than):     ${r.cutoff}`)
  console.log("")
  console.log("ai_runs (status='running' AND started_at < cutoff):")
  console.log(`  Candidates:              ${fmtNumber(r.ai_runs.candidates)}`)
  if (r.dry_run) {
    console.log(`  Would reclaim:           ${fmtNumber(r.ai_runs.would_reclaim)}`)
  } else {
    console.log(`  Reclaimed:               ${fmtNumber(r.ai_runs.reclaimed)}`)
  }
  if (r.ai_runs.earliest_started_at) {
    console.log(`  Earliest started_at:     ${r.ai_runs.earliest_started_at}`)
  }
  console.log("")
  console.log("ai_subject_locks (orphans older than 10 min):")
  console.log(`  Candidates:              ${fmtNumber(r.ai_subject_locks.candidates)}`)
  if (r.dry_run) {
    console.log(`  (counts only in DRY-RUN)`)
  } else {
    console.log(`  Deleted:                 ${fmtNumber(r.ai_subject_locks.deleted)}`)
  }
  console.log("")
  console.log(`Wall time: ${r.wall_ms} ms`)
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`[ai-runs-sweep] ${SCRIPT_VERSION}`)
  const env = readSweepEnv()
  const args = parseArgs(process.argv)

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[ai-runs-sweep] DATABASE_URL is not set — refusing to run")
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[ai-runs-sweep] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
  } else {
    console.log("[ai-runs-sweep] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed")
  }

  if (!args.confirm) {
    console.log(
      "[ai-runs-sweep] DRY-RUN — no changes will be applied. Add --confirm to mutate.",
    )
  } else {
    console.log("[ai-runs-sweep] CONFIRMED — mutations will be applied inside one transaction.")
    console.log(
      `[ai-runs-sweep] WARNING: reclaimed rows are flipped to 'timed_out' with error_class='stale_sweep'. ` +
        `If a row is legitimately mid-flight at the moment of reclaim, its in-process callback will still ` +
        `update the row — last-writer-wins. Tune --stale-ms higher if needed.`,
    )
  }

  let result: SweepResult
  try {
    result = await runAiRunsSweep({
      dryRun: !args.confirm,
      maxRows: args.maxRows ?? undefined,
      staleAfterMs: args.staleAfterMs ?? undefined,
    })
  } catch (err) {
    console.error("[ai-runs-sweep] FAILED:", (err as Error).message)
    if (err instanceof Error && err.stack) console.error(err.stack)
    process.exit(2)
  }

  printReport(result, args, env)

  if (result.dry_run) {
    console.log("")
    console.log("[ai-runs-sweep] DRY-RUN complete. Run with --confirm to apply.")
  } else {
    console.log("")
    console.log("[ai-runs-sweep] CONFIRMED run complete.")
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("[ai-runs-sweep] fatal:", err)
  process.exit(2)
})

// Mirror the constants out for ergonomics — useful when reading the CLI
// help text vs. the handler defaults. Re-exporting from the handler is
// safer than duplicating the numbers.
export { DEFAULT_MAX_ROWS, DEFAULT_STALE_AFTER_MS }
