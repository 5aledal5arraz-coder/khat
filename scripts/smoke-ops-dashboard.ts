/**
 * Phase 2.5 (P2.5.a) — local-DB smoke for the ops dashboard data layer.
 *
 *   npm run smoke:ops-dashboard
 *
 * Pure read. No synthetic data. No cleanup needed.
 *
 * Validates:
 *   1. Hostname guard refuses managed-DB unless SMOKE_ALLOW_REMOTE=1.
 *   2. takeOpsSnapshot() resolves within 2 seconds (perf gate).
 *   3. Top-level shape: taken_at is Date, duration_ms is finite ≥ 0,
 *      all 5 sections present.
 *   4. Each section returns either { ok: true, data } or { ok: false,
 *      error } — never null/undefined/malformed.
 *   5. At least 4 of 5 sections OK on a healthy local DB.
 *   6. queue.countsByStatus has all 6 JobStatus keys.
 *   7. systemEvents.grand_total >= sum-of-matrix counts (consistency).
 *   8. aiRouter.rate_limit_mode is one of off/report/enforce; both
 *      tier snapshots present.
 *   9. eirPipeline.countByPhase has 15 EpisodePhase keys.
 *   10. recentActivity.events is array (0–20).
 *
 * Empty-corpus safety: every scenario must pass against a fresh local
 * DB. Zero counts are valid; missing structural keys are NOT.
 *
 * Exit:
 *   0 — every scenario PASS
 *   2 — any scenario FAIL or hostname guard refused
 */

import { takeOpsSnapshot } from "@/lib/ops/snapshot"

const SMOKE_VERSION = "smoke-ops-dashboard-v1.0"

// ─── Hostname guard (mirrors prior P1+ smokes) ────────────────────────

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

// ─── Expected key sets ────────────────────────────────────────────────

const EXPECTED_JOB_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead",
  "cancelled",
] as const

const EXPECTED_EPISODE_PHASES = [
  "idea",
  "guest_discovery",
  "guest_assigned",
  "approved",
  "researching",
  "prepared",
  "ready_to_record",
  "recording",
  "recorded",
  "producing",
  "ready_to_publish",
  "published",
  "analyzing",
  "learned",
  "archived",
] as const

const EXPECTED_RATE_LIMIT_MODES = new Set(["off", "report", "enforce"])

// ─── Result reporting ────────────────────────────────────────────────

interface ScenarioResult {
  name: string
  ok: boolean
  detail: string
}

const results: ScenarioResult[] = []

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail })
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${SMOKE_VERSION}]`)

  // Scenario 1 — hostname guard.
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
    console.log(`[${SMOKE_VERSION}] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed`)
    record("1. hostname guard refuses non-local DB", true, "bypassed via env")
  }

  // Take the snapshot.
  let snap
  const wallStart = Date.now()
  try {
    snap = await takeOpsSnapshot()
  } catch (err) {
    record(
      "2. takeOpsSnapshot resolves within 2000ms",
      false,
      `threw: ${(err as Error).message}`,
    )
    summarizeAndExit()
    return
  }
  const wallMs = Date.now() - wallStart

  // Scenario 2 — perf gate.
  if (wallMs > 2000) {
    record(
      "2. takeOpsSnapshot resolves within 2000ms",
      false,
      `wallMs=${wallMs}`,
    )
  } else {
    record(
      "2. takeOpsSnapshot resolves within 2000ms",
      true,
      `wallMs=${wallMs} duration_ms=${snap.duration_ms}`,
    )
  }

  // Scenario 3 — top-level shape.
  const topShapeOk =
    snap.taken_at instanceof Date &&
    !Number.isNaN(snap.taken_at.getTime()) &&
    typeof snap.duration_ms === "number" &&
    snap.duration_ms >= 0 &&
    snap.queue !== undefined &&
    snap.systemEvents !== undefined &&
    snap.aiRouter !== undefined &&
    snap.eirPipeline !== undefined &&
    snap.recentActivity !== undefined
  record(
    "3. top-level shape: taken_at, duration_ms, 5 sections present",
    topShapeOk,
    topShapeOk
      ? `taken_at=${snap.taken_at.toISOString()}`
      : "missing or wrong top-level field",
  )

  // Scenario 4 — each section is a valid SectionResult shape.
  const sections = [
    ["queue", snap.queue] as const,
    ["systemEvents", snap.systemEvents] as const,
    ["aiRouter", snap.aiRouter] as const,
    ["eirPipeline", snap.eirPipeline] as const,
    ["recentActivity", snap.recentActivity] as const,
  ]
  let allShaped = true
  let bad = ""
  for (const [name, s] of sections) {
    if (s === null || s === undefined || typeof s !== "object") {
      allShaped = false
      bad = name
      break
    }
    if (s.ok === true) {
      if (!("data" in s)) {
        allShaped = false
        bad = name
        break
      }
    } else if (s.ok === false) {
      if (!("error" in s) || typeof s.error !== "string") {
        allShaped = false
        bad = name
        break
      }
    } else {
      allShaped = false
      bad = name
      break
    }
  }
  record(
    "4. each section is SectionResult shaped",
    allShaped,
    allShaped ? "all 5 sections OK" : `malformed: ${bad}`,
  )

  // Scenario 5 — at least 4 of 5 sections OK on a healthy local DB.
  const okCount = sections.filter(([, s]) => s.ok === true).length
  const failingNames = sections.filter(([, s]) => s.ok === false).map(([n]) => n)
  if (okCount < 4) {
    record(
      "5. at least 4 of 5 sections OK",
      false,
      `okCount=${okCount} failing=${failingNames.join(",")}`,
    )
  } else {
    record(
      "5. at least 4 of 5 sections OK",
      true,
      `okCount=${okCount}${failingNames.length ? ` failing=${failingNames.join(",")}` : ""}`,
    )
  }

  // Scenario 6 — queue.countsByStatus has all 6 keys.
  if (snap.queue.ok) {
    const counts = snap.queue.data.countsByStatus
    const missing = EXPECTED_JOB_STATUSES.filter((k) => !(k in counts))
    if (missing.length === 0) {
      record(
        "6. queue.countsByStatus has all 6 JobStatus keys",
        true,
        `keys=${Object.keys(counts).join(",")}`,
      )
    } else {
      record(
        "6. queue.countsByStatus has all 6 JobStatus keys",
        false,
        `missing=${missing.join(",")}`,
      )
    }
  } else {
    record(
      "6. queue.countsByStatus has all 6 JobStatus keys",
      false,
      `queue section failed: ${snap.queue.error}`,
    )
  }

  // Scenario 7 — systemEvents.grand_total == sum-of-matrix.
  if (snap.systemEvents.ok) {
    const d = snap.systemEvents.data
    const sum = d.matrix.reduce((a, r) => a + r.count, 0)
    if (d.grand_total === sum) {
      record(
        "7. systemEvents.grand_total == sum(matrix.count)",
        true,
        `grand_total=${d.grand_total}`,
      )
    } else {
      record(
        "7. systemEvents.grand_total == sum(matrix.count)",
        false,
        `grand_total=${d.grand_total} sum=${sum}`,
      )
    }
  } else {
    record(
      "7. systemEvents.grand_total == sum(matrix.count)",
      false,
      `systemEvents section failed: ${snap.systemEvents.error}`,
    )
  }

  // Scenario 8 — aiRouter mode + both tiers present.
  if (snap.aiRouter.ok) {
    const d = snap.aiRouter.data
    const modeOk = EXPECTED_RATE_LIMIT_MODES.has(d.rate_limit_mode)
    const tiersOk =
      d.tiers &&
      typeof d.tiers.light?.current_concurrency === "number" &&
      typeof d.tiers.light?.concurrency_limit === "number" &&
      typeof d.tiers.expensive?.current_concurrency === "number" &&
      typeof d.tiers.expensive?.concurrency_limit === "number"
    if (modeOk && tiersOk) {
      record(
        "8. aiRouter.rate_limit_mode valid + both tiers present",
        true,
        `mode=${d.rate_limit_mode} light.lim=${d.tiers.light.concurrency_limit} expensive.lim=${d.tiers.expensive.concurrency_limit}`,
      )
    } else {
      record(
        "8. aiRouter.rate_limit_mode valid + both tiers present",
        false,
        `modeOk=${modeOk} tiersOk=${tiersOk}`,
      )
    }
  } else {
    record(
      "8. aiRouter.rate_limit_mode valid + both tiers present",
      false,
      `aiRouter section failed: ${snap.aiRouter.error}`,
    )
  }

  // Scenario 9 — eirPipeline.countByPhase has all 15 keys.
  if (snap.eirPipeline.ok) {
    const counts = snap.eirPipeline.data.countByPhase
    const missing = EXPECTED_EPISODE_PHASES.filter((k) => !(k in counts))
    if (missing.length === 0) {
      record(
        "9. eirPipeline.countByPhase has all 15 EpisodePhase keys",
        true,
        `15 phases present`,
      )
    } else {
      record(
        "9. eirPipeline.countByPhase has all 15 EpisodePhase keys",
        false,
        `missing=${missing.join(",")}`,
      )
    }
  } else {
    record(
      "9. eirPipeline.countByPhase has all 15 EpisodePhase keys",
      false,
      `eirPipeline section failed: ${snap.eirPipeline.error}`,
    )
  }

  // Scenario 10 — recentActivity.events is array (0–20).
  if (snap.recentActivity.ok) {
    const evs = snap.recentActivity.data.events
    const isOk = Array.isArray(evs) && evs.length <= 20
    record(
      "10. recentActivity.events is array (length 0–20)",
      isOk,
      `length=${Array.isArray(evs) ? evs.length : "(not array)"}`,
    )
  } else {
    record(
      "10. recentActivity.events is array (length 0–20)",
      false,
      `recentActivity section failed: ${snap.recentActivity.error}`,
    )
  }

  summarizeAndExit()
}

function summarizeAndExit(): never {
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log("")
  console.log("══════════════════════════════════════════════════════════════")
  console.log("ops-dashboard smoke summary")
  console.log("══════════════════════════════════════════════════════════════")
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"}  ${r.name}`)
    console.log(`     ${r.detail}`)
  }
  console.log("")
  console.log(`  Scenarios:  ${results.length}`)
  console.log(`  Passed:     ${passed}`)
  console.log(`  Failed:     ${failed}`)
  console.log("")
  if (failed > 0) {
    console.log("  OPS-DASHBOARD SMOKE: FAIL")
    process.exit(2)
  }
  console.log("  OPS-DASHBOARD SMOKE: PASS")
  process.exit(0)
}

main().catch((err) => {
  console.error(`[${SMOKE_VERSION}] fatal:`, err)
  process.exit(2)
})
