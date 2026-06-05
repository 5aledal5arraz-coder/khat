/**
 * Khat Brain Phase 7 — Command Center smoke.
 *
 *   1. command center service returns phase counts
 *   2. attention alerts include stuck-EIR detection
 *   3. failed ai_runs are surfaced
 *   4. failed jobs are surfaced
 *   5. discovery run status is surfaced
 *   6. performance snapshots are surfaced
 *   7. promoted candidate without canonical link is surfaced
 *   8. /admin/khat-brain/command page module imports cleanly
 *   9. service works on (mostly-)empty database
 *  10. all previous Khat Map + Khat Brain smokes still pass (orchestrator)
 */

import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  episodeIntelligenceRecords,
} from "@/lib/db/schema/eir"
import { aiRuns } from "@/lib/db/schema/ai-runs"
import { jobs } from "@/lib/db/schema/jobs"
import { performanceSnapshots } from "@/lib/db/schema/studio-analysis"
import {
  discoveryRuns,
  guestDiscoveryCandidates,
} from "@/lib/db/schema/discovery"
import {
  ATTENTION_THRESHOLDS,
  getCommandCenterData,
} from "@/lib/khat-brain/command-center"

const TAG = "smoke-cc"

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

async function cleanup() {
  await db!.execute(sql`
    DELETE FROM performance_snapshots WHERE eir_id IN
      (SELECT id FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM guest_discovery_candidates WHERE proposed_name LIKE ${TAG + "%"}
       OR discovery_run_id IN (SELECT id FROM discovery_runs WHERE seed_prompt LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`DELETE FROM discovery_runs WHERE seed_prompt LIKE ${TAG + "%"}`)
  await db!.execute(sql`
    DELETE FROM ai_runs WHERE subject_id LIKE ${TAG + "%"}
       OR error_message LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`DELETE FROM jobs WHERE payload->>'tag' = ${TAG}`)
}

async function caseSurfaces() {
  console.log("Case 1+2+3+4+5+6+7 — service surfaces all signal types:")

  // Seed: stuck EIR in researching > 7d
  const [stuckEir] = await db!
    .insert(episodeIntelligenceRecords)
    .values({
      working_title: `${TAG}-stuck`,
      phase: "researching",
    })
    .returning({ id: episodeIntelligenceRecords.id })
  // Backdate updated_at past the threshold via trigger-bypass.
  await db!.execute(sql`
    ALTER TABLE episode_intelligence_records DISABLE TRIGGER trg_eir_updated_at
  `)
  await db!.execute(sql`
    UPDATE episode_intelligence_records SET updated_at = NOW() - INTERVAL '10 days'
     WHERE id = ${stuckEir.id}
  `)
  await db!.execute(sql`
    ALTER TABLE episode_intelligence_records ENABLE TRIGGER trg_eir_updated_at
  `)

  // Failed AI run
  await db!.insert(aiRuns).values({
    eir_id: null,
    subject_table: TAG,
    subject_id: `${TAG}-ai-failed`,
    task_kind: "structural",
    provider: "openai",
    model_name: "gpt-4o-mini",
    status: "failed",
    started_at: new Date(),
    completed_at: new Date(),
    latency_ms: 100,
    error_class: "TestError",
    error_message: `${TAG}-failed`,
  })

  // Failed job
  await db!.insert(jobs).values({
    type: `${TAG}.failure-test`,
    status: "failed",
    payload: { tag: TAG },
    error_message: `${TAG}-job-error`,
  })

  // Discovery run + a "promoted" candidate WITHOUT a canonical link
  const [run] = await db!
    .insert(discoveryRuns)
    .values({
      seed_prompt: `${TAG}-prompt`,
      status: "completed",
      candidate_count: 1,
    })
    .returning({ id: discoveryRuns.id })
  await db!.insert(guestDiscoveryCandidates).values({
    discovery_run_id: run.id,
    proposed_name: `${TAG}-orphan-promotion`,
    archetype: null,
    evidence_urls: [],
    status: "promoted",
    promoted_guest_id: "fake-guest-no-link",
  })

  // Performance snapshot pinned to the stuck EIR
  await db!.insert(performanceSnapshots).values({
    eir_id: stuckEir.id,
    episode_id: null,
    view_count: "999",
    source: "youtube_api",
    raw: { tag: TAG },
  })

  const data = await getCommandCenterData()

  // 1. Phase counts include researching
  assert(
    (data.phase_counts.researching ?? 0) >= 1,
    `expected researching count ≥1, got ${data.phase_counts.researching}`,
  )
  console.log(`  ✓ phase counts: researching=${data.phase_counts.researching}`)

  // 2. Stuck EIR alert present
  const stuckAlert = data.alerts.find(
    (a) => a.id.startsWith("stuck_research:") && a.id.includes(stuckEir.id),
  )
  assert(stuckAlert, "stuck-researching alert missing")
  console.log(`  ✓ stuck-researching alert: ${stuckAlert!.message}`)

  // 3. Failed AI run surfaced
  assert(
    data.totals.failed_ai_runs_recent >= 1,
    `expected failed_ai_runs_recent ≥1, got ${data.totals.failed_ai_runs_recent}`,
  )
  const aiAlert = data.alerts.find((a) => a.id === "ai_failed_count")
  assert(aiAlert?.level === "error", "ai_failed_count alert missing or wrong level")
  console.log(`  ✓ failed AI runs surfaced (count=${data.totals.failed_ai_runs_recent})`)

  // 4. Failed job surfaced
  assert(
    data.totals.failed_jobs_recent >= 1,
    `expected failed_jobs_recent ≥1, got ${data.totals.failed_jobs_recent}`,
  )
  const jobAlert = data.alerts.find((a) => a.id === "jobs_failed_count")
  assert(jobAlert?.level === "error", "jobs_failed_count alert missing")
  console.log(`  ✓ failed jobs surfaced (count=${data.totals.failed_jobs_recent})`)

  // 5. Discovery run status surfaced
  const dr = data.recent.discovery_runs.find((r) => r.id === run.id)
  assert(dr, "discovery run missing from recent")
  assert(dr!.status === "completed", "discovery run status mismatch")
  console.log(`  ✓ discovery run status surfaced`)

  // 6. Performance snapshot surfaced
  const snap = data.recent.performance_snapshots.find(
    (s) => s.eir_id === stuckEir.id,
  )
  assert(snap, "performance snapshot missing")
  assert(snap!.view_count === "999", "view_count mismatch")
  console.log(`  ✓ performance snapshot surfaced (views=${snap!.view_count})`)

  // 7. Orphan promotion alert
  const orphan = data.alerts.find(
    (a) => a.id.startsWith("promotion_no_link:") && a.message.includes("orphan-promotion"),
  )
  assert(orphan, "orphan-promotion alert missing")
  console.log(`  ✓ orphan-promotion alert: ${orphan!.message}`)
}

async function caseCommandCenterImports() {
  console.log("\nCase 8 — /admin/khat-brain/command module imports:")
  const mod = await import("@/app/admin/khat-brain/command/page")
  assert(typeof mod.default === "function", "default export missing")
  console.log(`  ✓ command center page module loaded`)
}

async function caseEmptyData() {
  console.log("\nCase 9 — service works on a wiped slice:")
  // Wipe our seeded rows; verify the service still returns a coherent shape.
  await cleanup()
  const data = await getCommandCenterData()
  assert(typeof data.generated_at === "string", "generated_at missing")
  assert(typeof data.phase_counts === "object", "phase_counts missing")
  assert(Array.isArray(data.alerts), "alerts must be an array")
  // Even with our seeds wiped there may be other rows — we just check
  // the structure is intact.
  console.log(
    `  ✓ shape OK; ${data.alerts.length} ambient alerts, ${data.recent.eirs.length} ambient EIRs`,
  )
}

async function main() {
  await cleanup()
  console.log("🧪 smoke-khat-brain-command-center — starting\n")

  await caseSurfaces()
  await caseCommandCenterImports()
  await caseEmptyData()

  await cleanup()
  console.log("\n✅ smoke-khat-brain-command-center: all 9 cases passed")
  console.log(`(threshold reference: stuck=${ATTENTION_THRESHOLDS.researching_days}d, ai=${ATTENTION_THRESHOLDS.ai_run_lookback_hours}h)`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 smoke failed:", err)
    process.exit(1)
  })

// suppress unused-import lint
void eq
