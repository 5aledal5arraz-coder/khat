/**
 * Phase 1.7 — Consolidated Phase-1 closure verification.
 *
 *   npm run smoke:phase-1-all
 *
 * Runs every Phase-1 substrate check in sequence:
 *
 *   1. tsc --noEmit                          (no Phase-1 TS errors)
 *   2. Substrate smokes (DB-only):
 *        - smoke:spine-joins
 *        - smoke:fk-orphans
 *        - scan:jsonb-drift
 *        - smoke:rate-limit-burst
 *   3. Retention dry-run (read-only)
 *   4. Unit tests (Phase-1 surface only):
 *        - tests/admin-auth/sliding-session.test.ts        (P1.1)
 *        - tests/db-validators/{wrapper,schemas}.test.ts   (P1.3)
 *        - tests/jobs/retention.test.ts                    (P1.5)
 *        - tests/ai-router/rate-limit.test.ts              (P1.6)
 *        - tests/prompts/snapshots.test.ts                 (P0.5)
 *   5. Eval CLI list  (substrate sanity, no API calls)
 *
 * Exits 0 only if every step exits 0. Otherwise exits 2 and prints
 * the first-failing step plus a final FAIL summary so it's easy to
 * paste into the closure doc.
 *
 * Hostname guard: each step that touches the DB already enforces its
 * own guard; this script does no DB I/O directly.
 *
 * Output also persisted to `evals/phase-1-closure-run.log` so the
 * operator can attach the exact run to the closure doc.
 */

import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const SCRIPT_VERSION = "smoke-phase-1-all-v1.0"

interface Step {
  /** Short label shown in the summary. */
  name: string
  /** Phase reference (for the summary table). */
  phase: string
  /** npm script to invoke (no `npm run` prefix). */
  npmScript: string
  /** Extra arguments after `--`. */
  extraArgs?: string[]
}

const STEPS: Step[] = [
  // 1. Typecheck.
  // We spawn `tsc` directly via the project binary so we don't depend
  // on a typecheck script being present in package.json.
  { name: "TypeScript: tsc --noEmit",         phase: "all",   npmScript: "__tsc__" },

  // 2. Substrate smokes.
  { name: "Smoke: spine-joins",               phase: "P1.2",  npmScript: "smoke:spine-joins" },
  { name: "Smoke: fk-orphans",                phase: "P1.4",  npmScript: "smoke:fk-orphans" },
  { name: "Scan:  jsonb-drift",               phase: "P1.3",  npmScript: "scan:jsonb-drift" },
  { name: "Smoke: rate-limit-burst",          phase: "P1.6",  npmScript: "smoke:rate-limit-burst" },
  // P2.3.b — unified event log writer. Grows in P2.3.c–P2.3.d as more
  // subsystems wire their emitters.
  { name: "Smoke: system-events",             phase: "P2.3",  npmScript: "smoke:system-events" },
  // P2.5.a — ops dashboard data layer. Exercises the read API + per-
  // section fetchers against the local DB. Pure read; no synth.
  { name: "Smoke: ops-dashboard",             phase: "P2.5",  npmScript: "smoke:ops-dashboard" },
  // P2.4.a — guest-identity schema substrate. Pure structural read:
  // verifies the two new junction tables, indexes, and the new
  // fk_gdc_promoted_guest FK constraint are in place. No mutations.
  { name: "Smoke: guest-identity-schema",     phase: "P2.4",  npmScript: "smoke:guest-identity-schema" },
  // P2.4.b — guest-identity backfill dry-run. Spawns the backfill
  // script in default (no --confirm) mode for each pass + combined.
  // Asserts zero writes, valid report shape, perf budget. Pure read.
  { name: "Smoke: guest-identity-backfill",   phase: "P2.4",  npmScript: "smoke:guest-identity-backfill" },
  // P2.4.e.1 — guest-identity integrity lib. Seeds known issues (2
  // dup guests, 1 unlinked candidate, 1 unlinked application, 1
  // stale profile, 1 fresh control), exercises every integrity
  // helper, asserts detection, cleans up. Marker-tagged & re-runnable.
  { name: "Smoke: p2-4-e-integrity",          phase: "P2.4",  npmScript: "smoke:p2-4-e-integrity" },

  // 3. Retention dry-run.
  { name: "Job:   retention-ai-runs (dry-run)", phase: "P1.5", npmScript: "jobs:retention-ai-runs" },

  // 4. Unit tests — Phase-1 surface only.
  { name: "Test:  sliding-session",           phase: "P1.1",  npmScript: "test", extraArgs: ["tests/admin-auth/sliding-session.test.ts"] },
  { name: "Test:  jsonb wrapper",             phase: "P1.3",  npmScript: "test", extraArgs: ["tests/db-validators/wrapper.test.ts"] },
  { name: "Test:  jsonb schemas",             phase: "P1.3",  npmScript: "test", extraArgs: ["tests/db-validators/schemas.test.ts"] },
  { name: "Test:  retention policy",          phase: "P1.5",  npmScript: "test", extraArgs: ["tests/jobs/retention.test.ts"] },
  { name: "Test:  rate-limit policy",         phase: "P1.6",  npmScript: "test", extraArgs: ["tests/ai-router/rate-limit.test.ts"] },
  { name: "Test:  prompt snapshots",          phase: "P0.5",  npmScript: "test", extraArgs: ["tests/prompts/snapshots.test.ts"] },

  // 5. Eval CLI sanity (lists golden-set features; no API calls).
  // NB: the eval CLI's `list` is a positional subcommand, not a flag.
  // `npm run eval -- list` → `npx tsx scripts/run-eval.ts list`.
  { name: "Eval CLI: list",                   phase: "P0.8",  npmScript: "eval", extraArgs: ["list"] },
]

interface StepResult {
  name: string
  phase: string
  exitCode: number
  durationMs: number
  ok: boolean
}

function runStep(s: Step): StepResult {
  const t0 = Date.now()
  let cp
  if (s.npmScript === "__tsc__") {
    cp = spawnSync(
      "node_modules/.bin/tsc",
      ["--noEmit", "--skipLibCheck"],
      { stdio: "inherit", env: process.env, shell: false },
    )
  } else {
    const args = ["run", s.npmScript]
    if (s.extraArgs && s.extraArgs.length > 0) {
      args.push("--", ...s.extraArgs)
    }
    cp = spawnSync("npm", args, { stdio: "inherit", env: process.env, shell: false })
  }
  const exitCode = cp.status ?? (cp.signal ? 130 : 1)
  return {
    name: s.name,
    phase: s.phase,
    exitCode,
    durationMs: Date.now() - t0,
    ok: exitCode === 0,
  }
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}

function main() {
  console.log(`[${SCRIPT_VERSION}] running Phase-1 consolidated verification`)
  console.log(`[${SCRIPT_VERSION}] cwd: ${process.cwd()}`)
  console.log("")

  const results: StepResult[] = []
  let stopOnFirstFailure = false

  for (const step of STEPS) {
    console.log("")
    console.log(`════ ${step.name}   (${step.phase}) ═════════════════════════`)
    const r = runStep(step)
    results.push(r)
    console.log(`──── ${r.ok ? "PASS" : "FAIL"}  exit=${r.exitCode}  ${fmtMs(r.durationMs)}`)
    if (!r.ok) {
      stopOnFirstFailure = true
      // Don't break — surface ALL failures in the final summary so
      // the operator sees the full picture on one run. But mark that
      // we know the run will FAIL overall.
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  const overall: "PASS" | "FAIL" = failed === 0 ? "PASS" : "FAIL"

  console.log("")
  console.log("══════════════════════════════════════════════════════════════")
  console.log("Phase-1 consolidated verification summary")
  console.log("══════════════════════════════════════════════════════════════")
  console.log("")
  for (const r of results) {
    console.log(
      `  ${r.ok ? "✓" : "✗"}  ${pad(r.phase, 6)} ${pad(r.name, 44)} ${pad(fmtMs(r.durationMs), 8)} exit=${r.exitCode}`,
    )
  }
  console.log("")
  console.log(`  Steps:   ${results.length}`)
  console.log(`  Passed:  ${passed}`)
  console.log(`  Failed:  ${failed}`)
  console.log("")
  console.log(`  PHASE 1 CONSOLIDATED VERIFICATION: ${overall}`)
  console.log("")

  // Persist a structured run log for the closure doc.
  try {
    const logPath = "evals/phase-1-closure-run.log"
    mkdirSync(dirname(logPath), { recursive: true })
    const payload = {
      script: SCRIPT_VERSION,
      timestamp: new Date().toISOString(),
      overall,
      passed,
      failed,
      results: results.map((r) => ({
        phase: r.phase,
        name: r.name,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        ok: r.ok,
      })),
    }
    writeFileSync(logPath, JSON.stringify(payload, null, 2) + "\n")
    console.log(`  Run log: ${logPath}`)
    console.log("")
  } catch (err) {
    console.warn(`  (could not write run log: ${(err as Error).message})`)
  }

  process.exit(overall === "PASS" ? 0 : 2)
  // Reference unused var to silence TS (kept for readability above).
  void stopOnFirstFailure
}

main()
