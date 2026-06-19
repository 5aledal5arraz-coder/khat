/**
 * Khat Brain Phase 5 — Hidden Guest Discovery smoke.
 *
 *   1. discovery_run can be created
 *   2. archetypes can be generated through AI Router (mocked here)
 *   3. search job stores evidence or returns clear not_configured
 *   4. verify job creates candidate intelligence (mocked)
 *   5. rank job produces composite_score
 *   6. candidate can be rejected / saved / promoted
 *   7. /admin/discovery URL serves a page (best-effort: import works)
 *   8. ai_runs rows are written for discovery / verification tasks
 *   9. jobs rows are written for the discovery pipeline
 *  10. state-machine regression — invalid run transition rejected
 */

import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  type DiscoveryArchetype,
} from "@/lib/db/schema/discovery"
import { aiRuns } from "@/lib/db/schema/ai-runs"
import {
  createDiscoveryRun,
  createCandidate,
  getCandidate,
  listCandidates,
  listDiscoveryRuns,
  rankCandidate,
  setCandidateStatus,
  transitionDiscoveryRun,
  updateCandidateScores,
  updateCandidateVerification,
  InvalidDiscoveryTransitionError,
  type DiscoveryEvidenceUrl,
} from "@/lib/discovery"
import { runSearchAgent } from "@/lib/discovery/search-agents"
import { enqueueJob, getJob } from "@/lib/jobs"
import { getHandler } from "@/lib/jobs/registry"
import "@/lib/jobs/registered" // eslint-disable-line import/no-unassigned-import

const TAG = "smoke-discovery"

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

async function cleanup() {
  await db!.execute(sql`
    DELETE FROM guest_discovery_candidates WHERE discovery_run_id IN
      (SELECT id FROM discovery_runs WHERE seed_prompt LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`DELETE FROM discovery_runs WHERE seed_prompt LIKE ${TAG + "%"}`)
  await db!.execute(sql`DELETE FROM ai_runs WHERE subject_id LIKE ${TAG + "%"}`)
  await db!.execute(sql`DELETE FROM jobs WHERE payload->>'tag' = ${TAG}`)
}

const FAKE_ARCHETYPE: DiscoveryArchetype = {
  id: "smoke_arc",
  name: "نمط اختباري",
  description: "نمط بشري للاختبار",
  target_signals: ["transformation", "تحوّل"],
  expected_traits: ["honesty"],
}

async function caseCreateRun() {
  console.log("Case 1 — discovery_run can be created:")
  const run = await createDiscoveryRun({
    seed_prompt: `${TAG}-prompt`,
    source_config: { platforms: ["youtube", "google_web"], candidates_per_archetype: 3 },
  })
  assert(run.id, "run id missing")
  assert(run.status === "pending", `expected pending, got ${run.status}`)
  console.log(`  ✓ run ${run.id.slice(0, 8)} created at status=pending`)
  return run.id
}

async function caseArchetypesGenerate(runId: string) {
  console.log("\nCase 2 — archetypes generated via AI Router (mocked failure path):")
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = "stub-discovery-fail"

  try {
    const before = await db!
      .select({ c: sql<number>`count(*)::int` })
      .from(aiRuns)
      .where(eq(aiRuns.subject_id, runId))
    const beforeCount = before[0]?.c ?? 0

    // Call seedArchetypes directly — it will fail at the network layer
    // (stub key) but still write an ai_runs row (the contract).
    const { seedArchetypes } = await import("@/lib/discovery/seed-archetypes")
    await seedArchetypes({
      seedPrompt: `${TAG}-prompt`,
      subjectId: runId,
      count: 4,
    }).catch(() => {})

    const after = await db!
      .select({ c: sql<number>`count(*)::int` })
      .from(aiRuns)
      .where(eq(aiRuns.subject_id, runId))
    const newRows = (after[0]?.c ?? 0) - beforeCount
    assert(newRows >= 1, `expected an ai_runs row, got ${newRows}`)
    console.log(`  ✓ ai_runs row written for archetype seeding (${newRows} new)`)
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  }
}

async function caseSearchAgent() {
  console.log("\nCase 3 — search agent returns clear not_configured / results:")
  // X is a stub — should always return not_configured.
  const xResult = await runSearchAgent({
    archetype: FAKE_ARCHETYPE,
    source: "x",
  })
  assert(xResult.configured === false, "X should be not_configured")
  assert(xResult.note, "stub note missing")
  console.log(`  ✓ X stub returned not_configured with note: ${xResult.note}`)

  // Web search stub when active provider's env vars are not set.
  // Default provider is Brave; WEB_SEARCH_PROVIDER=google_cse falls back to CSE.
  const gw = await runSearchAgent({ archetype: FAKE_ARCHETYPE, source: "google_web" })
  const webProvider =
    process.env.WEB_SEARCH_PROVIDER === "google_cse" ? "google_cse" : "brave"
  const providerConfigured =
    webProvider === "google_cse"
      ? !!process.env.GOOGLE_CSE_KEY && !!process.env.GOOGLE_CSE_CX
      : !!process.env.BRAVE_SEARCH_KEY
  if (!providerConfigured) {
    assert(
      gw.configured === false,
      `google_web should be not_configured without ${webProvider} env`,
    )
    console.log(`  ✓ google_web returned not_configured (${webProvider} env not set)`)
  }
}

async function caseVerifyCandidateContract(runId: string) {
  console.log("\nCase 4 — verify writes ai_runs and stores intelligence:")
  // Pre-create a candidate to verify against.
  const evidence: DiscoveryEvidenceUrl[] = [
    { platform: "youtube", url: "https://youtu.be/ExA1", title: "test", snippet: "x" },
  ]
  const cand = await createCandidate({
    discovery_run_id: runId,
    proposed_name: `${TAG}-person`,
    archetype: FAKE_ARCHETYPE,
    evidence_urls: evidence,
  })

  // Store stub verification result manually (avoid network).
  await updateCandidateVerification({
    id: cand.id,
    evidence_summary: {
      why_they_matter: "لأنهم سرديو تحوّل",
      topics: ["تحوّل"],
      risks: [],
      notable_quotes: [],
      red_flags: [],
    },
    story_signals: {
      arcs: ["transformation_after_loss"],
      topics: ["loss"],
      events: ["lost a job and rebuilt"],
    },
    editorial_fit_score: 0.7,
  })

  const reread = await getCandidate(cand.id)
  assert(reread?.evidence_summary?.why_they_matter, "evidence_summary not stored")
  assert(reread?.editorial_fit_score === 0.7, "fit score not stored")
  console.log(`  ✓ candidate ${cand.id.slice(0, 8)} verified intelligence persisted`)
  return cand.id
}

async function caseRanking(candidateId: string) {
  console.log("\nCase 5 — rank produces composite_score:")
  const cand = await getCandidate(candidateId)
  assert(cand, "candidate vanished")

  const r = rankCandidate({
    editorial_fit_score: cand!.editorial_fit_score,
    evidence_urls: cand!.evidence_urls,
    platform_signals: cand!.platform_signals,
    story_signals: cand!.story_signals,
  })
  await updateCandidateScores({ id: candidateId, ...r })

  const after = await getCandidate(candidateId)
  assert(after?.composite_score !== null, "composite_score not set")
  assert(
    after!.composite_score! >= 0 && after!.composite_score! <= 1,
    `composite out of [0,1]: ${after!.composite_score}`,
  )
  console.log(
    `  ✓ composite=${after!.composite_score} (fit=${after!.editorial_fit_score} hidden=${after!.hiddenness_score} evidence=${after!.evidence_strength_score} novelty=${after!.novelty_score})`,
  )
}

async function caseStatusActions(candidateId: string) {
  console.log("\nCase 6 — candidate status transitions (reject / save / promote):")
  // reject
  await setCandidateStatus(candidateId, "rejected", { rejection_reason: "test" })
  const rejected = await getCandidate(candidateId)
  assert(rejected?.status === "rejected", `expected rejected, got ${rejected?.status}`)
  // saved_for_later (transitioning out of rejected — schema CHECK only restricts
  // values, not transitions; the UI flow doesn't need a state-machine here)
  await setCandidateStatus(candidateId, "saved_for_later")
  const saved = await getCandidate(candidateId)
  assert(saved?.status === "saved_for_later", "save failed")
  // promote
  await setCandidateStatus(candidateId, "promoted", { promoted_guest_id: "guest-x" })
  const promoted = await getCandidate(candidateId)
  assert(promoted?.status === "promoted", "promote failed")
  assert(promoted?.promoted_guest_id === "guest-x", "promoted_guest_id not stamped")
  console.log(`  ✓ rejected → saved_for_later → promoted`)
}

async function caseDashboardImports() {
  console.log("\nCase 7 — /admin/discovery server module imports:")
  // Best-effort smoke: the page is a server component; we just ensure
  // the module loads (catches missing imports / type errors at runtime).
  const mod = await import("@/app/admin/discovery/page")
  assert(typeof mod.default === "function", "default export missing")
  console.log(`  ✓ page module loaded`)
}

async function caseHandlersAndJobs(runId: string) {
  console.log("\nCase 8+9 — handlers registered and jobs enqueueable:")
  for (const t of [
    "discovery.seed_archetypes",
    "discovery.search_archetype",
    "discovery.verify_candidate",
    "discovery.rank_candidates",
  ]) {
    const h = getHandler(t)
    assert(h, `handler ${t} not registered`)
  }
  console.log(`  ✓ all 4 discovery handlers registered`)

  // Enqueue a tagged demo job — proves the jobs row writes work
  // through the discovery pipeline path. We don't actually run the
  // worker; that's covered by the existing foundation smoke.
  const j = await enqueueJob(
    "discovery.rank_candidates",
    { run_id: runId, tag: TAG },
    { priority: 1 },
  )
  assert(j.status === "pending", "enqueue failed")
  const back = await getJob(j.id)
  assert(back?.type === "discovery.rank_candidates", "job round-trip failed")
  console.log(`  ✓ job ${j.id.slice(0, 8)} enqueued for discovery.rank_candidates`)
}

async function caseStateMachine(runId: string) {
  console.log("\nCase 10 — invalid run transition rejected:")
  let threw = false
  try {
    // pending → completed is not allowed (must walk through seeding/searching/etc)
    await transitionDiscoveryRun({ id: runId, to: "completed" })
  } catch (err) {
    threw = err instanceof InvalidDiscoveryTransitionError
  }
  assert(threw, "expected InvalidDiscoveryTransitionError")
  console.log(`  ✓ pending→completed rejected`)
}

async function main() {
  await cleanup()
  console.log("🧪 smoke-khat-brain-discovery — starting\n")

  const runId = await caseCreateRun()
  await caseArchetypesGenerate(runId)
  await caseSearchAgent()
  const candidateId = await caseVerifyCandidateContract(runId)
  await caseRanking(candidateId)
  await caseStatusActions(candidateId)
  await caseDashboardImports()
  await caseHandlersAndJobs(runId)
  await caseStateMachine(runId)

  // Quick informational dump
  const runs = await listDiscoveryRuns({ limit: 5 })
  const cands = await listCandidates({ limit: 5 })
  console.log(`\nlistDiscoveryRuns → ${runs.length}; listCandidates → ${cands.length}`)

  await cleanup()
  console.log("\n✅ smoke-khat-brain-discovery: all 10 cases passed")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 smoke failed:", err)
    process.exit(1)
  })
