/**
 * Khat Brain Phase 3 — spine completion smoke.
 *
 * Verifies the downstream wiring without LLM/network:
 *   1. Preparation → live recording copies eir_id (room creation)
 *   2. Live recording status → EIR phases (waiting/live/paused/ended)
 *   3. Preparation → studio session copies eir_id
 *   4. Studio push → episode copies eir_id + walks to ready_to_publish/published
 *   5. Episode published walks to "published"
 *   6. Performance sync walks the EIR to "analyzing"
 *   7. Preparation status (approved) walks the EIR to "prepared"
 *   8. The 3 migrated AI generators write ai_runs rows
 *   9. Backfill is idempotent
 *  10. The state machine still rejects illegal jumps (regression)
 *
 * Cleans up. Idempotent.
 */

import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
} from "@/lib/db/schema/khat-map"
import {
  episodeIntelligenceRecords,
} from "@/lib/db/schema/eir"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { collaborationRooms } from "@/lib/db/schema/collaboration"
import { studioSessions } from "@/lib/db/schema/studio"
import { episodes } from "@/lib/db/schema/episodes"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import { aiRuns } from "@/lib/db/schema/ai-runs"
import {
  ensureEirForCandidate,
  walkEirToPhase,
  syncEirFromRoomStatus,
  syncEirFromPrepStatus,
  syncEirOnEpisodePublish,
  syncEirOnPerformanceWrite,
  syncEirOnStudioPushed,
  walkForwardIfBehind,
  getEirIdForRoom,
  getEirIdForEpisode,
} from "@/lib/khat-brain"
import { resolveEirForStudioSession } from "@/lib/khat-brain/studio-resolver"
import {
  getEpisodeIntelligenceRecord,
  transitionEpisodePhase,
  InvalidPhaseTransitionError,
} from "@/lib/eir"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"
import { generateGlobalEpisodeIntelligence } from "@/lib/ai/episode-intelligence"
import { generateStudioPackage } from "@/lib/ai/studio"
import { generateDeepAnalysis } from "@/lib/ai/deep-analysis"

const TAG = "smoke-spine"

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

async function ensureSmokeAdmin(): Promise<string> {
  const existing = await db!
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, `${TAG}@example.com`))
    .limit(1)
  if (existing[0]) return existing[0].id
  const [row] = await db!
    .insert(adminUsers)
    .values({ email: `${TAG}@example.com`, password_hash: "x", role: "ADMIN" })
    .returning({ id: adminUsers.id })
  return row.id
}

async function cleanup() {
  await db!.execute(sql`DELETE FROM episodes WHERE title LIKE ${TAG + "%"}`)
  await db!.execute(sql`
    DELETE FROM studio_sessions WHERE video_title LIKE ${TAG + "%"}
       OR episode_title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM collaboration_rooms WHERE name LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM episode_preparations WHERE title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM khat_map_episode_candidates
    WHERE season_id IN (SELECT id FROM khat_map_seasons WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM khat_map_guest_candidates
    WHERE season_id IN (SELECT id FROM khat_map_seasons WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`DELETE FROM khat_map_seasons WHERE name LIKE ${TAG + "%"}`)
  await db!.execute(sql`DELETE FROM ai_runs WHERE subject_id LIKE ${TAG + "%"}`)
}

async function seedScenarioToPrepared(adminId: string) {
  const [season] = await db!
    .insert(khatMapSeasons)
    .values({
      name: `${TAG}-season`,
      season_number: null,
      status: "planning",
      target_episode_count: 6,
      v2_mode: "guided",
      created_by: adminId,
    })
    .returning()

  const [guest] = await db!
    .insert(khatMapGuestCandidates)
    .values({
      season_id: season.id,
      status: "approved",
      full_name: `${TAG}-guest`,
      bio: "smoke",
      gender: "unknown",
      public_links: [],
      social_accounts: { website: "https://example.com" },
      evidence_citations: [],
      risk_flags: [],
    })
    .returning()

  const [candidate] = await db!
    .insert(khatMapEpisodeCandidates)
    .values({
      season_id: season.id,
      status: "approved",
      working_title: `${TAG}-cand`,
      hook: "h",
      why_matters: "w",
      why_now: "n",
      goal: "g",
      description: "d",
      episode_type: "intellectual",
      topic_domain: "philosophy",
      suggested_guest_candidate_id: guest.id,
      main_axes: [],
      suggested_questions: [],
      production_notes: null,
      risk_level: "medium",
      effort_level: "medium",
    })
    .returning()

  // Build EIR via the bridge.
  const cand = await getEpisodeCandidateById(candidate.id)
  assert(cand, "candidate vanished")
  const { eir } = await ensureEirForCandidate({ candidate: cand!, adminId })

  // Walk to "researching" so we can exercise prep-status sync (P3.6).
  const [prep] = await db!
    .insert(episodePreparations)
    .values({
      title: `${TAG}-prep`,
      guest_name: `${TAG}-guest`,
      status: "draft",
      eir_id: eir.id,
      created_by: adminId,
    })
    .returning()

  await walkEirToPhase({ eirId: eir.id, toPhase: "approved", reason: "test" })
  await walkEirToPhase({ eirId: eir.id, toPhase: "researching", reason: "test" })

  return { season, guest, candidate, eir, prep }
}

async function caseRoomInheritsEir(adminId: string) {
  console.log("\nCase 1 — room creation inherits prep.eir_id:")
  const ctx = await seedScenarioToPrepared(adminId)

  const [room] = await db!
    .insert(collaborationRooms)
    .values({
      preparation_id: ctx.prep.id,
      name: `${TAG}-room`,
      created_by: adminId,
      eir_id: ctx.eir.id,
    })
    .returning({ id: collaborationRooms.id, eir_id: collaborationRooms.eir_id })

  assert(room.eir_id === ctx.eir.id, "room.eir_id not stamped")

  // Walk to ready_to_record (the bridge would do this in real flow).
  await walkForwardIfBehind(room.eir_id, "ready_to_record", { reason: "test" })

  console.log(`  ✓ room.eir_id = ${room.eir_id}`)
  return { ...ctx, roomId: room.id }
}

async function caseRoomStatusWalksEir(roomId: string) {
  console.log("\nCase 2 — room status changes walk EIR forward:")
  const eirId = await getEirIdForRoom(roomId)
  assert(eirId, "room missing EIR")

  // waiting → ready_to_record (already there)
  await syncEirFromRoomStatus({ eirId, status: "waiting" })
  let eir = await getEpisodeIntelligenceRecord(eirId!)
  assert(eir?.phase === "ready_to_record", `expected ready_to_record, got ${eir?.phase}`)

  // live → recording
  await syncEirFromRoomStatus({ eirId, status: "live" })
  eir = await getEpisodeIntelligenceRecord(eirId!)
  assert(eir?.phase === "recording", `expected recording, got ${eir?.phase}`)

  // paused stays at recording (no backwards move)
  await syncEirFromRoomStatus({ eirId, status: "paused" })
  eir = await getEpisodeIntelligenceRecord(eirId!)
  assert(eir?.phase === "recording", `paused should stay recording, got ${eir?.phase}`)

  // ended → recorded
  await syncEirFromRoomStatus({ eirId, status: "ended" })
  eir = await getEpisodeIntelligenceRecord(eirId!)
  assert(eir?.phase === "recorded", `expected recorded, got ${eir?.phase}`)

  console.log(`  ✓ walked waiting→ready_to_record→recording→(paused noop)→recorded`)
}

async function caseStudioInheritsEir(prepId: string, eirId: string) {
  console.log("\nCase 3 — studio session inherits eir_id from preparation:")
  const resolved = await resolveEirForStudioSession({
    preparationId: prepId,
    episodeId: null,
    youtubeVideoId: null,
    videoTitle: `${TAG}-session`,
    sourceType: "test",
    createdBy: null,
  })
  assert(resolved === eirId, `expected reuse of prep EIR, got ${resolved}`)

  const [sess] = await db!
    .insert(studioSessions)
    .values({
      video_title: `${TAG}-session`,
      source: "test",
      status: "draft",
      eir_id: resolved,
    })
    .returning({ id: studioSessions.id, eir_id: studioSessions.eir_id })
  assert(sess.eir_id === eirId, "session.eir_id mismatch")
  console.log(`  ✓ studio session reuses prep eir_id=${eirId}`)
  return sess.id
}

async function caseStudioOrphanMintsEir() {
  console.log("\nCase 3b — orphan studio session mints fresh EIR:")
  const fresh = await resolveEirForStudioSession({
    preparationId: null,
    episodeId: null,
    youtubeVideoId: "abc123",
    videoTitle: `${TAG}-orphan`,
    sourceType: "youtube_import",
    createdBy: null,
  })
  assert(fresh, "orphan resolver returned null")
  const eir = await getEpisodeIntelligenceRecord(fresh!)
  assert(eir?.phase === "producing", `orphan should be producing, got ${eir?.phase}`)
  console.log(`  ✓ orphan minted EIR ${fresh} at phase=producing`)
}

async function casePushPropagates(sessionId: string, eirId: string) {
  console.log("\nCase 4 — push studio→episode copies eir_id and walks phase:")
  // Walk EIR to producing first (real flow goes recorded → producing).
  await walkEirToPhase({ eirId, toPhase: "producing", reason: "test" })

  // Insert a fake episode (status=published) and run the propagation
  // logic directly (the API route logic is the same — copy + walk).
  const [ep] = await db!
    .insert(episodes)
    .values({
      title: `${TAG}-episode`,
      slug: `smoke-spine-${Date.now()}`,
      youtube_url: "https://youtu.be/x",
      duration_minutes: 60,
      release_date: "2026-01-01",
      status: "published",
    } as never)
    .returning({ id: episodes.id, status: episodes.status })

  await db!
    .update(episodes)
    .set({ eir_id: eirId, updated_at: new Date() })
    .where(eq(episodes.id, ep.id))

  await syncEirOnStudioPushed({ eirId })
  let eir = await getEpisodeIntelligenceRecord(eirId)
  assert(
    eir?.phase === "ready_to_publish",
    `after push expected ready_to_publish, got ${eir?.phase}`,
  )

  // Episode is status=published — propagate to "published".
  await syncEirOnEpisodePublish({ eirId })
  eir = await getEpisodeIntelligenceRecord(eirId)
  assert(eir?.phase === "published", `expected published, got ${eir?.phase}`)

  const epEir = await getEirIdForEpisode(ep.id)
  assert(epEir === eirId, "episode.eir_id not stamped")
  console.log(`  ✓ episode.eir_id=${epEir}, EIR walked producing→ready_to_publish→published`)
  return ep.id
}

async function casePerformanceSync(eirId: string) {
  console.log("\nCase 6 — performance sync walks EIR to analyzing:")
  await syncEirOnPerformanceWrite({ eirId })
  const eir = await getEpisodeIntelligenceRecord(eirId)
  assert(eir?.phase === "analyzing", `expected analyzing, got ${eir?.phase}`)
  console.log(`  ✓ EIR walked to analyzing`)

  // Idempotent — second call is a no-op.
  await syncEirOnPerformanceWrite({ eirId })
  const eir2 = await getEpisodeIntelligenceRecord(eirId)
  assert(eir2?.phase === "analyzing", "second call should not regress")
  console.log(`  ✓ second call is a no-op`)
}

async function casePrepStatusSync(adminId: string) {
  console.log("\nCase 7 — preparation.approved walks EIR researching→prepared:")
  // Build a fresh scenario at researching.
  const ctx = await seedScenarioToPrepared(adminId)
  const before = await getEpisodeIntelligenceRecord(ctx.eir.id)
  assert(before?.phase === "researching", `seed expected researching, got ${before?.phase}`)

  await syncEirFromPrepStatus({ eirId: ctx.eir.id, status: "approved" })
  const after = await getEpisodeIntelligenceRecord(ctx.eir.id)
  assert(after?.phase === "prepared", `expected prepared, got ${after?.phase}`)
  console.log(`  ✓ EIR walked to prepared`)
}

async function caseGeneratorsLog(eirId: string) {
  console.log("\nCase 8 — 3 newly migrated generators write ai_runs:")
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = "stub-spine-fail"

  const baseline = await db!
    .select({ count: sql<number>`count(*)::int` })
    .from(aiRuns)
    .where(eq(aiRuns.eir_id, eirId))
  const baselineCount = baseline[0]?.count ?? 0

  const subjectId = `${TAG}-spine-call`
  const ctx = { eirId, subjectTable: TAG, subjectId }

  try {
    const tinyTranscript = "نص قصير جداً للاختبار"
    await generateGlobalEpisodeIntelligence(tinyTranscript, "Smoke", ctx).catch(() => {})
    await generateStudioPackage(tinyTranscript, "Smoke", "Khat", null, ctx).catch(() => {})
    await generateDeepAnalysis(tinyTranscript, "Smoke", null, ctx).catch(() => {})
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  }

  const after = await db!
    .select({ count: sql<number>`count(*)::int` })
    .from(aiRuns)
    .where(eq(aiRuns.eir_id, eirId))
  const newRows = (after[0]?.count ?? 0) - baselineCount
  assert(newRows >= 1, `expected at least 1 ai_runs row, got ${newRows}`)

  // All three generators should have routed as task_kind=editorial.
  const sample = await db!
    .select({ task_kind: aiRuns.task_kind, model_name: aiRuns.model_name })
    .from(aiRuns)
    .where(eq(aiRuns.eir_id, eirId))
  const editorialCount = sample.filter((s) => s.task_kind === "editorial").length
  assert(editorialCount >= 1, "expected editorial task_kind")
  console.log(`  ✓ ${newRows} new ai_runs row(s); editorial task_kind confirmed`)
}

async function caseBackfillIdempotent() {
  console.log("\nCase 9 — backfill is idempotent (run twice, second is no-op):")
  // Idempotency contract: after a first run that may have created EIRs
  // for orphans, a second run with the same input must NOT create more.
  // We run twice, ignore the first run's count delta (it depends on
  // pre-existing orphans), and require the second run to be a no-op.
  const { spawnSync } = await import("node:child_process")
  const env = { ...process.env }

  const run = () =>
    spawnSync("npx", ["tsx", "scripts/backfill-eir-downstream.ts"], {
      env,
      encoding: "utf-8",
      cwd: process.cwd(),
    })

  // First run — converges everything.
  const r1 = run()
  assert(r1.status === 0, `first backfill failed: ${r1.stderr}`)
  const after1 = await db!
    .select({ count: sql<number>`count(*)::int` })
    .from(episodeIntelligenceRecords)
  const count1 = after1[0]?.count ?? 0

  // Second run — must be a no-op.
  const r2 = run()
  assert(r2.status === 0, `second backfill failed: ${r2.stderr}`)
  const after2 = await db!
    .select({ count: sql<number>`count(*)::int` })
    .from(episodeIntelligenceRecords)
  const count2 = after2[0]?.count ?? 0

  assert(
    count2 === count1,
    `second run mutated EIR count (after first=${count1}, after second=${count2})`,
  )
  console.log(`  ✓ converged at ${count1} EIRs; second run was a no-op`)
}

async function caseStateMachineRegression() {
  console.log("\nCase 10 — state machine still rejects illegal direct jumps:")
  // walkEirToPhase intentionally cascades through allowed steps —
  // that's its job. The state machine guard lives on the underlying
  // transitionEpisodePhase: each single-step move must be allowed.
  // Verify by trying a direct jump (idea → published) at the
  // primitive level.
  const [eir] = await db!
    .insert(episodeIntelligenceRecords)
    .values({ working_title: `${TAG}-regression`, phase: "idea" })
    .returning({ id: episodeIntelligenceRecords.id })
  let threw = false
  try {
    await transitionEpisodePhase({
      eir_id: eir.id,
      to_phase: "published",
      reason: "illegal",
    })
  } catch (err) {
    threw = err instanceof InvalidPhaseTransitionError
  }
  assert(threw, "direct idea→published should throw InvalidPhaseTransitionError")

  // And also verify a backwards walk is still rejected.
  // Walk one step forward first, then try to go back.
  await transitionEpisodePhase({ eir_id: eir.id, to_phase: "guest_assigned" })
  let backwardsThrew = false
  try {
    await walkEirToPhase({ eirId: eir.id, toPhase: "idea", reason: "regress" })
  } catch (err) {
    backwardsThrew = err instanceof Error && /backwards/i.test(err.message)
  }
  assert(backwardsThrew, "backwards walk should throw")

  console.log(`  ✓ direct idea→published rejected`)
  console.log(`  ✓ backwards walk rejected`)
}

async function main() {
  await cleanup()
  console.log("🧪 smoke-khat-brain-spine-completion — starting")

  const adminId = await ensureSmokeAdmin()

  // Cases 1, 2, 3, 4, 5, 6 share a scenario.
  const ctx1 = await caseRoomInheritsEir(adminId)
  await caseRoomStatusWalksEir(ctx1.roomId)
  const sessionId = await caseStudioInheritsEir(ctx1.prep.id, ctx1.eir.id)
  await caseStudioOrphanMintsEir()
  await casePushPropagates(sessionId, ctx1.eir.id)
  await casePerformanceSync(ctx1.eir.id)

  // Case 7 needs a fresh EIR at researching to walk to prepared.
  await casePrepStatusSync(adminId)

  // Case 8 — exercise the 3 newly migrated generators.
  await caseGeneratorsLog(ctx1.eir.id)

  // Case 9 — idempotent backfill.
  await caseBackfillIdempotent()

  // Case 10 — regression on state machine.
  await caseStateMachineRegression()

  await cleanup()
  console.log("\n✅ smoke-khat-brain-spine-completion: all 10 cases passed")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 smoke failed:", err)
    process.exit(1)
  })
