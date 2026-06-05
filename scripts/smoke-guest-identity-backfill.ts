/**
 * Phase 2.4.b — dry-run smoke for the guest-identity backfill.
 *
 *   npm run smoke:guest-identity-backfill
 *
 * Pure read against the local DB. The backfill script is invoked in
 * dry-run mode (no --confirm) for each of the three passes plus a
 * combined run. The smoke asserts:
 *   - script doesn't crash
 *   - exit code 0
 *   - JSON report has the expected shape with mode='dry-run'
 *   - writes_actual totals are all zero
 *   - performance gate: combined run < 5 seconds
 *
 * The smoke does NOT validate routing-logic correctness — that's the
 * job of `tests/backfill/guest-identity-routing.test.ts`.
 *
 * Exit codes:
 *   0 — all assertions PASS
 *   2 — hostname guard refused / any assertion FAIL
 */

import { spawnSync } from "node:child_process"

const SMOKE_VERSION = "smoke-guest-identity-backfill-v1.0"
const PERF_BUDGET_MS = 5000

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
      if (pat.test(host)) {
        return { ok: false, reason: `hostname ${host} matches production pattern ${pat}.` }
      }
    }
    return { ok: false, reason: `hostname ${host} is not localhost.` }
  } catch (err) {
    return { ok: false, reason: `could not parse DATABASE_URL: ${(err as Error).message}` }
  }
}

// ─── Result tracking ─────────────────────────────────────────────────

interface AssertionResult {
  name: string
  ok: boolean
  detail: string
}

const results: AssertionResult[] = []

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail })
}

// ─── Helper: run the backfill script and parse its JSON output ───────

interface RunOutcome {
  exit_code: number
  parsed: Record<string, unknown> | null
  raw_stdout: string
  raw_stderr: string
}

function runBackfill(extraArgs: string[]): RunOutcome {
  const result = spawnSync(
    "npx",
    ["tsx", "scripts/backfill-guest-identity-links.ts", ...extraArgs],
    { encoding: "utf8", env: process.env },
  )
  // The script writes a header line + JSON + human summary to stdout.
  // Find the JSON block by matching the first '{' through the last '}'.
  const out = result.stdout
  const firstBrace = out.indexOf("{")
  const lastBrace = out.lastIndexOf("}")
  let parsed: Record<string, unknown> | null = null
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      parsed = JSON.parse(out.slice(firstBrace, lastBrace + 1))
    } catch {
      parsed = null
    }
  }
  return {
    exit_code: result.status ?? -1,
    parsed,
    raw_stdout: out,
    raw_stderr: result.stderr,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${SMOKE_VERSION}]`)

  // Assertion 1 — hostname guard.
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error(`[${SMOKE_VERSION}] DATABASE_URL is not set — refusing`)
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[${SMOKE_VERSION}] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
    record("1. hostname guard refuses non-local DB", true, "DATABASE_URL is local")
  } else {
    record(
      "1. hostname guard refuses non-local DB",
      true,
      "bypassed via SMOKE_ALLOW_REMOTE=1",
    )
  }

  // Assertion 2 — Pass 1 dry-run exits 0.
  const p1 = runBackfill(["--pass=1"])
  if (p1.exit_code === 0) {
    record("2. pass 1 dry-run exits 0", true, "pass 1 exit=0")
  } else {
    record(
      "2. pass 1 dry-run exits 0",
      false,
      `exit=${p1.exit_code} stderr=${p1.raw_stderr.slice(0, 200)}`,
    )
  }

  // Assertion 3 — Pass 2 dry-run exits 0.
  const p2 = runBackfill(["--pass=2"])
  if (p2.exit_code === 0) {
    record("3. pass 2 dry-run exits 0", true, "pass 2 exit=0")
  } else {
    record(
      "3. pass 2 dry-run exits 0",
      false,
      `exit=${p2.exit_code} stderr=${p2.raw_stderr.slice(0, 200)}`,
    )
  }

  // Assertion 4 — Pass 3 dry-run exits 0.
  const p3 = runBackfill(["--pass=3"])
  if (p3.exit_code === 0) {
    record("4. pass 3 dry-run exits 0", true, "pass 3 exit=0")
  } else {
    record(
      "4. pass 3 dry-run exits 0",
      false,
      `exit=${p3.exit_code} stderr=${p3.raw_stderr.slice(0, 200)}`,
    )
  }

  // Assertion 5 — combined run produces well-shaped JSON, mode=dry-run,
  // all writes_actual totals zero, completes within perf budget.
  const combinedStart = Date.now()
  const combined = runBackfill([])
  const combinedMs = Date.now() - combinedStart

  if (combined.exit_code !== 0 || !combined.parsed) {
    record(
      "5. combined dry-run: shape + zero writes + perf",
      false,
      `combined exit=${combined.exit_code} parsed=${!!combined.parsed}`,
    )
  } else {
    const r = combined.parsed
    const mode = r.mode
    const totals = (r.totals as Record<string, Record<string, number>> | undefined) ?? {}
    const wa = totals.writes_actual ?? {}
    const totalActual =
      (wa.guest_candidate_links ?? 0) +
      (wa.guest_application_links ?? 0) +
      (wa.guests ?? 0) +
      (wa.guest_identity_profiles ?? 0)
    const shapeOk =
      mode === "dry-run" &&
      typeof r.script_version === "string" &&
      typeof r.duration_ms === "number" &&
      typeof totals.writes_planned === "object" &&
      typeof totals.writes_actual === "object"
    const perfOk = combinedMs < PERF_BUDGET_MS
    if (shapeOk && totalActual === 0 && perfOk) {
      record(
        "5. combined dry-run: shape + zero writes + perf",
        true,
        `mode=${mode} totals_actual=0 wall=${combinedMs}ms`,
      )
    } else {
      record(
        "5. combined dry-run: shape + zero writes + perf",
        false,
        `shapeOk=${shapeOk} totalActual=${totalActual} perfOk=${perfOk} wall=${combinedMs}ms`,
      )
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log("")
  console.log("══════════════════════════════════════════════════════════════")
  console.log("guest-identity backfill smoke summary")
  console.log("══════════════════════════════════════════════════════════════")
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"}  ${r.name}`)
    console.log(`     ${r.detail}`)
  }
  console.log("")
  console.log(`  Assertions: ${results.length}`)
  console.log(`  Passed:     ${passed}`)
  console.log(`  Failed:     ${failed}`)
  console.log("")
  if (failed > 0) {
    console.log("  GUEST-IDENTITY BACKFILL SMOKE: FAIL")
    process.exit(2)
  }
  console.log("  GUEST-IDENTITY BACKFILL SMOKE: PASS")
  process.exit(0)
}

main().catch((err) => {
  console.error(`[${SMOKE_VERSION}] fatal:`, err)
  process.exit(2)
})
