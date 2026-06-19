/**
 * Phase X Step 5 — Live Recording V2 smoke (11 cases).
 *
 *   1. schema migration — director_notes + section state + extended marker_type CHECK
 *   2. /admin/recording/[roomId]/v2 page module loads with prep_v2
 *   3. fallback path works without prep_v2 (legacy questions surfaced)
 *   4. timer start/pause/resume/reset/end persists correctly + paused time excluded
 *   5. flow tracker updates current_section_key + index
 *   6. section questions ordered must_ask before if_time
 *   7. director notes autosave persists
 *   8. quick tags create markers with timestamp + section_key + valid type
 *   9. EIR status mapping still works (recording → recorded on end)
 *  10. old /admin/collab/[roomId] page module still loads
 *  11. cleanup leaves no smoke rows behind
 *
 * Idempotent. Cleans up its own rows on success.
 */

import { sql, eq, like, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  collaborationRooms,
  roomSessionMarkers,
  roomParticipants,
} from "@/lib/db/schema/collaboration"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { khatMapSeasons } from "@/lib/db/schema/khat-map"
import { loadLiveV2, questionsForSection } from "@/lib/recording-v2/load"
import {
  startTimer,
  pauseTimer,
  resumeTimer,
  resetTimer,
  endTimer,
  setCurrentSection,
  saveDirectorNotes,
  createMarker,
} from "@/lib/recording-v2/actions-impl"
import type { PrepV2Payload } from "@/lib/preparation/v2/types"
import { ensureEirForCandidate } from "@/lib/khat-brain"
import { getEpisodeIntelligenceRecord } from "@/lib/eir"
import { sql as drSql } from "drizzle-orm"
import { khatMapEpisodeCandidates, khatMapGuestCandidates } from "@/lib/db/schema/khat-map"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"

const TAG = "smoke-livev2"

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

async function ensureSmokeAdmin(): Promise<{ id: string; email: string }> {
  const existing = await db!
    .select({ id: adminUsers.id, email: adminUsers.email })
    .from(adminUsers)
    .where(eq(adminUsers.email, `${TAG}@example.com`))
    .limit(1)
  if (existing[0]) return existing[0]
  const [row] = await db!
    .insert(adminUsers)
    .values({
      email: `${TAG}@example.com`,
      password_hash: "x",
      role: "ADMIN",
    })
    .returning({ id: adminUsers.id, email: adminUsers.email })
  return row
}

async function cleanup() {
  await db!.execute(sql`
    DELETE FROM room_session_markers WHERE room_id IN
      (SELECT id FROM collaboration_rooms WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM room_participants WHERE room_id IN
      (SELECT id FROM collaboration_rooms WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM collaboration_rooms WHERE name LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM episode_preparations WHERE title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM khat_map_episode_candidates
    WHERE working_title LIKE ${TAG + "%"}
       OR season_id IN (SELECT id FROM khat_map_seasons WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM khat_map_guest_candidates
    WHERE season_id IN (SELECT id FROM khat_map_seasons WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`DELETE FROM khat_map_seasons WHERE name LIKE ${TAG + "%"}`)
}

// The smoke calls lib/recording-v2/actions-impl directly (no auth gate),
// which matches what the server-action wrappers do after requireAdmin().

// ─── Seeds ────────────────────────────────────────────────────────────

async function seedScenario(adminId: string) {
  // Season + guest + candidate so we can create an EIR linked to the prep.
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
  const [cand] = await db!
    .insert(khatMapEpisodeCandidates)
    .values({
      season_id: season.id,
      status: "approved",
      working_title: `${TAG}-cand-title`,
      hook: "h",
      why_matters: "w",
      why_now: "n",
      goal: "g",
      description: "d",
      episode_type: "intellectual",
      topic_domain: "psychology",
      suggested_guest_candidate_id: guest.id,
      main_axes: [],
      suggested_questions: [],
      production_notes: null,
      risk_level: "medium",
      effort_level: "medium",
    })
    .returning()
  const fresh = await getEpisodeCandidateById(cand.id)
  assert(fresh, "candidate vanished")
  const { eir } = await ensureEirForCandidate({ candidate: fresh!, adminId })

  return { season, guest, cand, eir }
}

function makePrepV2(): PrepV2Payload {
  // Compact 24-question payload (2 must_ask emotional in peak; valid shape).
  const sections = (
    [
      ["opening", 6, "curiosity", "set the room"],
      ["build_up", 10, "tension", "reveal the stakes"],
      ["conflict", 14, "tension", "earn the conflict"],
      ["deep_dive", 18, "reverence", "hold the silence"],
      ["emotional_peak", 16, "longing", "let it land"],
      ["resolution", 11, "release", "land soft"],
    ] as const
  ).map(([kind, mins, emo, gt]) => ({
    kind,
    intent: `${TAG} intent for ${kind} that is detailed enough to pass validation`,
    target_emotion: emo,
    estimated_minutes: mins,
    transition_goal: gt,
  }))
  const questions = []
  let idx = 0
  for (const s of sections) {
    const count = s.kind === "opening" || s.kind === "build_up" || s.kind === "resolution" ? 4 : 4
    for (let i = 0; i < count; i++) {
      const types: Array<"emotional" | "philosophical" | "personal" | "confrontational" | "reflective" | "factual"> = []
      if (s.kind === "emotional_peak" || (s.kind === "opening" && i === 0)) types.push("emotional")
      if (s.kind === "conflict" || s.kind === "deep_dive") types.push("philosophical")
      if (s.kind === "conflict" && i === 0) types.push("confrontational")
      if (types.length === 0) types.push("reflective")
      questions.push({
        id: `q-${idx++}`,
        section: s.kind,
        text: `${TAG} question for ${s.kind} #${i} that is at least 30 chars long`,
        types,
        priority: idx <= 12 ? ("must_ask" as const) : ("if_time" as const),
        purpose: `serve axis ${i + 1}`,
        follow_up_prompt: `«ما الذي لم تقله بعد؟»`,
        risk_level: s.kind === "emotional_peak" ? ("high" as const) : ("medium" as const),
      })
    }
  }
  return {
    thesis: `${TAG} thesis sentence describing the actual argument`,
    axes_of_tension: [
      "wanting to be seen vs fearing exposure",
      "belonging vs authenticity",
      "ambition vs intimacy",
      "control vs surrender",
      "speech vs silence",
      "departure vs return",
    ],
    guest_extraction_strategy:
      "the guest answers technical questions easily but flinches at biographical ones; open with concrete craft, then cross into personal cost",
    episode_sections: sections as never,
    question_bank: questions as never,
    host_guidance: {
      overall_tone: "warm and unflinching",
      do_list: ["pause for 4 seconds", "follow concrete details", "name the discomfort"],
      dont_list: ["do not interrupt the silence", "avoid tourism phrasing", "do not summarize the guest"],
      energy_curve: "calm → curious → confrontational → reverent → released",
    },
    director_guidance: {
      shot_priorities: ["tight on hands", "wide as silence lands", "guest reflection"],
      silence_moments: ["after peak question", "as resolution closes"],
      cut_warnings: [],
    },
    sensitive_zones: ["family privacy"],
    opening_options: [
      { approach: "concrete", text: "describe the weight of the thing you held." },
      { approach: "biographical", text: "what room did you watch from a doorway?" },
    ],
    closing_options: [
      { approach: "single line", text: "what would you say to your 17yo self?" },
      { approach: "object", text: "name an object that remembers for you." },
    ],
    total_estimated_minutes: 75,
    generator_version: "v2.1",
    generated_at: new Date().toISOString(),
    ai_run_ids: {
      pass1_research: null,
      pass2_structure: null,
      pass3_questions: null,
      pass4_critique: null,
    },
  }
}

interface RoomCtx {
  roomId: string
  prepId: string
  eirId: string
  hasPrepV2: boolean
}

async function seedRoom(opts: {
  adminId: string
  eirId: string
  withPrepV2: boolean
  suffix: string
}): Promise<RoomCtx> {
  const [prep] = await db!
    .insert(episodePreparations)
    .values({
      title: `${TAG}-prep-${opts.suffix}`,
      guest_name: `${TAG}-guest`,
      guest_description: "smoke",
      status: "draft",
      eir_id: opts.eirId,
      created_by: opts.adminId,
      key_questions: opts.withPrepV2 ? [] : ["legacy q1", "legacy q2", "legacy q3"],
      prep_v2: opts.withPrepV2 ? (makePrepV2() as never) : null,
    })
    .returning({ id: episodePreparations.id })
  const [room] = await db!
    .insert(collaborationRooms)
    .values({
      preparation_id: prep.id,
      name: `${TAG}-room-${opts.suffix}`,
      eir_id: opts.eirId,
      created_by: opts.adminId,
    })
    .returning({ id: collaborationRooms.id })
  return {
    roomId: room.id,
    prepId: prep.id,
    eirId: opts.eirId,
    hasPrepV2: opts.withPrepV2,
  }
}

// ─── Cases ────────────────────────────────────────────────────────────

async function caseSchemaMigration() {
  console.log("Case 1 — schema migration:")
  // Check the new columns exist.
  const cols = await db!.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'collaboration_rooms'
      AND column_name IN ('director_notes','current_section_key','current_section_index')
  `)
  const colNames = new Set(
    (cols.rows as Array<{ column_name: string }>).map((r) => r.column_name),
  )
  for (const c of ["director_notes", "current_section_key", "current_section_index"]) {
    assert(colNames.has(c), `column ${c} missing on collaboration_rooms`)
  }
  // Check the marker_type CHECK includes the V2 vocab.
  const checks = await db!.execute(sql`
    SELECT pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'room_session_markers' AND c.contype = 'c'
  `)
  const checkText = (checks.rows as Array<{ def: string }>).map((r) => r.def).join(" ")
  for (const v of ["deep_moment", "emotional", "highlight", "quote", "cut", "revisit"]) {
    assert(checkText.includes(v), `marker_type CHECK missing value: ${v}`)
  }
  console.log(`  ✓ collaboration_rooms columns + marker_type vocab in place`)
}

async function casePageLoadsWithPrepV2(ctx: RoomCtx) {
  console.log("\nCase 2 — page loads with prep_v2:")
  const snap = await loadLiveV2(ctx.roomId)
  assert(snap, "snapshot null")
  assert(snap!.preparation.prep_v2, "prep_v2 not surfaced")
  assert(snap!.preparation.prep_v2!.episode_sections.length === 6, "sections != 6")
  assert(snap!.room.id === ctx.roomId, "room id mismatch")
  // Page module imports cleanly.
  const page = await import("@/app/admin/recording/[roomId]/v2/page")
  assert(typeof page.default === "function", "page default export missing")
  const client = await import("@/app/admin/recording/[roomId]/v2/live-v2-client")
  assert(typeof client.LiveV2Client === "function", "client component missing")
  console.log(
    `  ✓ snapshot loaded with ${snap!.preparation.prep_v2!.episode_sections.length} sections + ${snap!.preparation.prep_v2!.question_bank.length} questions`,
  )
}

async function caseFallbackWithoutPrepV2(ctx: RoomCtx) {
  console.log("\nCase 3 — fallback when prep_v2 is missing:")
  const snap = await loadLiveV2(ctx.roomId)
  assert(snap, "snapshot null")
  assert(snap!.preparation.prep_v2 === null, "prep_v2 should be null in fallback room")
  assert(snap!.preparation.legacy_questions.length === 3, "legacy questions missing")
  console.log(
    `  ✓ legacy fallback: ${snap!.preparation.legacy_questions.length} questions surfaced`,
  )
}

async function caseTimerLifecycle(ctx: RoomCtx) {
  console.log("\nCase 4 — timer lifecycle persists correctly:")
  // start
  await startTimer(ctx.roomId)
  let [room] = await db!.select().from(collaborationRooms).where(eq(collaborationRooms.id, ctx.roomId)).limit(1)
  assert(room.status === "live", `expected live, got ${room.status}`)
  assert(room.recording_started_at !== null, "recording_started_at not set")
  assert(room.recording_paused_at === null, "recording_paused_at must be null after start")

  // accumulate ~150ms; pause
  await new Promise((r) => setTimeout(r, 150))
  await pauseTimer(ctx.roomId)
  ;[room] = await db!.select().from(collaborationRooms).where(eq(collaborationRooms.id, ctx.roomId)).limit(1)
  assert(room.status === "paused", `expected paused, got ${room.status}`)
  assert(room.recording_paused_at !== null, "paused_at not set")
  const elapsedAfterPause = room.recording_elapsed_ms
  assert(elapsedAfterPause >= 100, `expected elapsed >= 100ms, got ${elapsedAfterPause}`)

  // wait 250ms while paused — must NOT count
  await new Promise((r) => setTimeout(r, 250))
  ;[room] = await db!.select().from(collaborationRooms).where(eq(collaborationRooms.id, ctx.roomId)).limit(1)
  assert(
    room.recording_elapsed_ms === elapsedAfterPause,
    `paused time should not increment elapsed (was ${elapsedAfterPause}, now ${room.recording_elapsed_ms})`,
  )

  // resume + accumulate ~120ms; end
  await resumeTimer(ctx.roomId)
  await new Promise((r) => setTimeout(r, 120))
  await endTimer(ctx.roomId)
  ;[room] = await db!.select().from(collaborationRooms).where(eq(collaborationRooms.id, ctx.roomId)).limit(1)
  assert(room.status === "ended", `expected ended, got ${room.status}`)
  assert(room.recording_ended_at !== null, "ended_at not set")
  assert(
    room.recording_elapsed_ms >= elapsedAfterPause + 100,
    `elapsed didn't grow on resume: was ${elapsedAfterPause}, now ${room.recording_elapsed_ms}`,
  )

  // reset
  await resetTimer(ctx.roomId)
  ;[room] = await db!.select().from(collaborationRooms).where(eq(collaborationRooms.id, ctx.roomId)).limit(1)
  assert(room.status === "waiting", `expected waiting after reset, got ${room.status}`)
  assert(room.recording_elapsed_ms === 0, `elapsed not reset: ${room.recording_elapsed_ms}`)
  assert(room.recording_started_at === null, "started_at not cleared")
  assert(room.recording_ended_at === null, "ended_at not cleared")
  console.log(`  ✓ start → pause → resume → end → reset persists correctly; paused time excluded`)
}

async function caseFlowTracker(ctx: RoomCtx) {
  console.log("\nCase 5 — flow tracker updates current_section:")
  await setCurrentSection({ roomId: ctx.roomId, index: 2, key: "conflict" })
  let [room] = await db!.select().from(collaborationRooms).where(eq(collaborationRooms.id, ctx.roomId)).limit(1)
  assert(room.current_section_key === "conflict", `expected conflict, got ${room.current_section_key}`)
  assert(room.current_section_index === 2, `expected index=2, got ${room.current_section_index}`)
  await setCurrentSection({ roomId: ctx.roomId, index: 4, key: "emotional_peak" })
  ;[room] = await db!.select().from(collaborationRooms).where(eq(collaborationRooms.id, ctx.roomId)).limit(1)
  assert(room.current_section_key === "emotional_peak", "second update failed")
  assert(room.current_section_index === 4, "second update index failed")
  console.log(`  ✓ section key + index persist`)
}

async function caseSectionQuestionOrdering(ctx: RoomCtx) {
  console.log("\nCase 6 — section questions: must_ask before if_time:")
  const snap = await loadLiveV2(ctx.roomId)
  assert(snap?.preparation.prep_v2, "prep_v2 missing")
  const ordered = questionsForSection(snap!.preparation.prep_v2, "conflict")
  assert(ordered.length > 0, "no questions in conflict")
  // Verify must_ask comes first.
  let seenIfTime = false
  for (const q of ordered) {
    if (q.priority === "if_time") seenIfTime = true
    else if (q.priority === "must_ask" && seenIfTime) {
      assert(false, "must_ask appeared after if_time — ordering broken")
    }
  }
  console.log(`  ✓ ${ordered.length} questions ordered must_ask first`)
}

async function caseDirectorNotesAutosave(ctx: RoomCtx) {
  console.log("\nCase 7 — director notes autosave:")
  await saveDirectorNotes({
    roomId: ctx.roomId,
    notes: `${TAG} the producer's note that should persist`,
  })
  const [room] = await db!.select().from(collaborationRooms).where(eq(collaborationRooms.id, ctx.roomId)).limit(1)
  assert(
    (room.director_notes ?? "").includes("producer's note"),
    `director_notes missing or wrong: ${room.director_notes}`,
  )
  await saveDirectorNotes({ roomId: ctx.roomId, notes: `${TAG} updated` })
  const [room2] = await db!.select().from(collaborationRooms).where(eq(collaborationRooms.id, ctx.roomId)).limit(1)
  assert(room2.director_notes === `${TAG} updated`, "director_notes did not overwrite")
  console.log(`  ✓ notes saved + overwritten`)
}

async function caseQuickTags(ctx: RoomCtx, adminId: string, email: string) {
  console.log("\nCase 8 — quick tags create markers with timestamp + section:")
  await startTimer(ctx.roomId)
  await setCurrentSection({ roomId: ctx.roomId, index: 4, key: "emotional_peak" })
  await new Promise((r) => setTimeout(r, 80))
  const a = await createMarker({
    roomId: ctx.roomId,
    markerType: "deep_moment",
    label: "deep moment",
    authorUserId: adminId,
    authorDisplayName: email.split("@")[0],
  })
  assert(a.ok, `createMarker failed: ${a.error ?? "?"}`)
  await new Promise((r) => setTimeout(r, 60))
  const b = await createMarker({
    roomId: ctx.roomId,
    markerType: "quote",
    label: "quote",
    sectionKey: "deep_dive",
    authorUserId: adminId,
    authorDisplayName: email.split("@")[0],
  })
  assert(b.ok, "second marker failed")

  const rows = await db!
    .select()
    .from(roomSessionMarkers)
    .where(eq(roomSessionMarkers.room_id, ctx.roomId))
    .orderBy(asc(roomSessionMarkers.created_at))
  assert(rows.length >= 2, `expected ≥2 markers, got ${rows.length}`)
  const first = rows[0]
  assert(first.marker_type === "deep_moment", `first marker_type: ${first.marker_type}`)
  assert(first.section_key === "emotional_peak", `first section_key: ${first.section_key}`)
  assert(first.recording_ms > 0, `first recording_ms <= 0: ${first.recording_ms}`)
  const second = rows[1]
  assert(second.marker_type === "quote", `second marker_type: ${second.marker_type}`)
  assert(second.section_key === "deep_dive", `second section_key: ${second.section_key}`)
  const part = await db!
    .select({ id: roomParticipants.id })
    .from(roomParticipants)
    .where(eq(roomParticipants.room_id, ctx.roomId))
  assert(part.length >= 1, "participant not auto-created on first marker")

  await endTimer(ctx.roomId)
  await resetTimer(ctx.roomId)
  console.log(`  ✓ markers persisted (deep_moment + quote) with section_key + recording_ms`)
}

async function caseEirMappingStillWorks(adminId: string) {
  console.log("\nCase 9 — EIR phase mapping preserved (fresh scenario):")
  // Seed an independent scenario so we don't inherit any phase state
  // from earlier cases (the EIR walker is monotonic).
  const fresh = await seedScenario(adminId)
  const room = await seedRoom({
    adminId,
    eirId: fresh.eir.id,
    withPrepV2: true,
    suffix: "case9",
  })
  const { walkEirToPhase } = await import("@/lib/khat-brain")
  await walkEirToPhase({
    eirId: fresh.eir.id,
    toPhase: "ready_to_record",
    actorId: adminId,
    reason: "smoke-livev2:case9",
  })
  await startTimer(room.roomId)
  let eir = await getEpisodeIntelligenceRecord(fresh.eir.id)
  assert(eir?.phase === "recording", `expected recording, got ${eir?.phase}`)
  await endTimer(room.roomId)
  eir = await getEpisodeIntelligenceRecord(fresh.eir.id)
  assert(eir?.phase === "recorded", `expected recorded, got ${eir?.phase}`)
  console.log(`  ✓ live → recording, ended → recorded`)
}

async function caseOldPageStillLoads() {
  console.log("\nCase 10 — old /admin/collab/[roomId] page module still loads:")
  const page = await import("@/app/admin/collab/[roomId]/page")
  assert(typeof page.default === "function", "old page default export missing")
  console.log(`  ✓ legacy collab page module imports cleanly`)
}

async function caseCleanupCheck() {
  console.log("\nCase 11 — cleanup leaves no smoke rows behind:")
  await cleanup()
  const rooms = await db!
    .select({ c: drSql<number>`count(*)::int` })
    .from(collaborationRooms)
    .where(like(collaborationRooms.name, `${TAG}%`))
  assert(Number(rooms[0].c) === 0, `expected 0 rooms, got ${rooms[0].c}`)
  console.log(`  ✓ zero TAG rows after cleanup`)
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 smoke-khat-brain-live-v2 — starting\n")
  await cleanup()

  await caseSchemaMigration()

  const admin = await ensureSmokeAdmin()
  const seeded = await seedScenario(admin.id)

  const v2Room = await seedRoom({
    adminId: admin.id,
    eirId: seeded.eir.id,
    withPrepV2: true,
    suffix: "v2",
  })
  const legacyRoom = await seedRoom({
    adminId: admin.id,
    eirId: seeded.eir.id,
    withPrepV2: false,
    suffix: "legacy",
  })

  await casePageLoadsWithPrepV2(v2Room)
  await caseFallbackWithoutPrepV2(legacyRoom)
  await caseTimerLifecycle(v2Room)
  await caseFlowTracker(v2Room)
  await caseSectionQuestionOrdering(v2Room)
  await caseDirectorNotesAutosave(v2Room)
  await caseQuickTags(v2Room, admin.id, admin.email)
  await caseEirMappingStillWorks(admin.id)
  await caseOldPageStillLoads()
  await caseCleanupCheck()

  console.log("\n✅ smoke-khat-brain-live-v2: all 11 cases passed")
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("\n💥 smoke failed:", err)
    try {
      await cleanup()
    } catch {}
    process.exit(1)
  })
