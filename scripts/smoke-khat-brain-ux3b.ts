/**
 * UX-3b — Episode Workspace full tab embeds smoke (11 cases).
 *
 *   1. Preparation tab renders prep_v2 (when present in DB)
 *   2. Preparation tab shows fallback message when prep_v2 missing
 *   3. Recording tab resolves an existing room by EIR
 *   4. Recording tab shows the create-room CTA when no room exists
 *      but a prep does
 *   5. Studio tab summary returns output statuses + a session row
 *      (when a session exists) or "missing" for every kind otherwise
 *   6. Markers strip is populated when the room has session markers
 *   7. Publish tab returns a linked-episode summary when episodes.eir_id
 *      points at our EIR
 *   8. Performance tab returns the latest performance signal/snapshot
 *   9. Sidebar Episodes link points at /admin/khat-brain/episodes
 *  10. Legacy /admin/recording/[roomId]/v2 page still loads + carries
 *      a "open in Khat Brain" link
 *  11. cleanup leaves no smoke rows behind
 *
 * Cleans up its own rows on success.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
} from "@/lib/db/schema/khat-map"
import { episodePreparations } from "@/lib/db/schema/preparation"
import {
  collaborationRooms,
  roomSessionMarkers,
  roomParticipants,
} from "@/lib/db/schema/collaboration"
import { studioSessions } from "@/lib/db/schema/studio"
import {
  studioAnalysisRecords,
  performanceSnapshots,
} from "@/lib/db/schema/studio-analysis"
import { episodePerformanceSignals } from "@/lib/db/schema/performance-signals"
import { episodes } from "@/lib/db/schema/episodes"
import {
  getRoomSummaryForEir,
  getPreparationForEir,
  getStudioSummaryForEir,
  getMarkersForRoom,
  getEpisodeForEir,
  getPerformanceForEir,
} from "@/lib/khat-brain/workspace-tabs"
import { ensureEirForCandidate } from "@/lib/khat-brain"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"

const TAG = "smoke-ux3b"
const REPO_ROOT = path.resolve(__dirname, "..")

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
    .values({
      email: `${TAG}@example.com`,
      password_hash: "x",
      role: "ADMIN",
    })
    .returning({ id: adminUsers.id })
  return row.id
}

async function cleanup() {
  // Children before parents.
  await db!.execute(sql`
    DELETE FROM episode_performance_signals WHERE eir_id IN
      (SELECT id FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM performance_snapshots WHERE eir_id IN
      (SELECT id FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM studio_analysis_records WHERE studio_session_id IN
      (SELECT id::text FROM studio_sessions WHERE eir_id IN
        (SELECT id FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"}))
  `)
  await db!.execute(sql`
    DELETE FROM studio_sessions WHERE eir_id IN
      (SELECT id FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM room_session_markers WHERE room_id IN
      (SELECT id FROM collaboration_rooms WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM room_participants WHERE room_id IN
      (SELECT id FROM collaboration_rooms WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`DELETE FROM collaboration_rooms WHERE name LIKE ${TAG + "%"}`)
  await db!.execute(sql`DELETE FROM episodes WHERE title LIKE ${TAG + "%"}`)
  await db!.execute(sql`DELETE FROM episode_preparations WHERE title LIKE ${TAG + "%"}`)
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

// ─── Seeds ────────────────────────────────────────────────────────────

async function seedScenario(adminId: string) {
  const [season] = await db!
    .insert(khatMapSeasons)
    .values({
      name: `${TAG}-season`,
      season_number: null,
      status: "planning",
      target_episode_count: 4,
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
      working_title: `${TAG}-episode`,
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
  const { eir } = await ensureEirForCandidate({
    candidate: fresh!,
    guestId: guest.id,
    adminId,
  })
  return { season, cand, eir }
}

// ─── Cases ────────────────────────────────────────────────────────────

async function casePreparationRendersV2(adminId: string, eirId: string) {
  console.log("Case 1 — Preparation tab renders prep_v2 when present:")
  const fakeV2 = {
    thesis: "smoke prep v2 thesis",
    axes_of_tension: ["a", "b", "c", "d", "e", "f"],
    guest_extraction_strategy: "smoke strategy",
    episode_sections: [
      { kind: "opening", intent: "i", target_emotion: "curiosity", estimated_minutes: 6, transition_goal: "g" },
      { kind: "build_up", intent: "i", target_emotion: "tension", estimated_minutes: 10, transition_goal: "g" },
      { kind: "conflict", intent: "i", target_emotion: "tension", estimated_minutes: 14, transition_goal: "g" },
      { kind: "deep_dive", intent: "i", target_emotion: "reverence", estimated_minutes: 18, transition_goal: "g" },
      { kind: "emotional_peak", intent: "i", target_emotion: "longing", estimated_minutes: 16, transition_goal: "g" },
      { kind: "resolution", intent: "i", target_emotion: "release", estimated_minutes: 11, transition_goal: "g" },
    ],
    question_bank: [],
    host_guidance: { overall_tone: "x", do_list: ["a"], dont_list: ["b"], energy_curve: "c" },
    director_guidance: { shot_priorities: ["x"], silence_moments: ["y"], cut_warnings: [] },
    sensitive_zones: [],
    opening_options: [],
    closing_options: [],
    total_estimated_minutes: 75,
    generator_version: "v2.1",
    generated_at: new Date().toISOString(),
    ai_run_ids: { pass1_research: null, pass2_structure: null, pass3_questions: null, pass4_critique: null },
  }
  await db!
    .insert(episodePreparations)
    .values({
      title: `${TAG}-prep`,
      guest_name: `${TAG}-guest`,
      status: "draft",
      eir_id: eirId,
      created_by: adminId,
      prep_v2: fakeV2 as never,
    })
  const prep = await getPreparationForEir(eirId)
  assert(prep, "prep missing")
  assert(prep!.prep_v2, "prep_v2 not present")
  assert(prep!.prep_v2!.thesis === fakeV2.thesis, "thesis lost")
  console.log(`  ✓ prep_v2 round trip via getPreparationForEir`)
}

async function casePrepFallbackWhenV2Missing(adminId: string) {
  console.log("\nCase 2 — Preparation tab fallback when prep_v2 missing:")
  // Insert a separate prep with NO prep_v2.
  const [seeded] = await db!
    .insert(episodePreparations)
    .values({
      title: `${TAG}-prep-novv2`,
      guest_name: null,
      status: "draft",
      eir_id: null,
      created_by: adminId,
      prep_v2: null,
    })
    .returning({ id: episodePreparations.id })
  // Lookup by id directly to verify the loader handles null prep_v2.
  const [row] = await db!
    .select()
    .from(episodePreparations)
    .where(eq(episodePreparations.id, seeded.id))
    .limit(1)
  assert(row, "row vanished")
  assert(row.prep_v2 === null, "prep_v2 should be null in this scenario")
  // UX-5.4 replaced the CLI hint with a workspace-native button that
  // calls `regeneratePrepV2Action`. The warning copy was localized to
  // "الإعداد العميق غير مُولَّد" (more operator-friendly than the
  // earlier "Prep V2 غير مُولَّد"). Either is accepted so the smoke
  // tracks both historical and current states.
  const tabBody = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/episodes/[eirId]/tab-preparation.tsx"),
    "utf8",
  )
  assert(
    tabBody.includes("regeneratePrepV2Action") &&
      tabBody.includes("إعادة توليد الإعداد"),
    "PreparationTab must wire the regen server action with the workspace-native button",
  )
  assert(
    tabBody.includes("Prep V2 غير مُولَّد") ||
      tabBody.includes("الإعداد العميق غير مُولَّد"),
    "PreparationTab missing the missing-v2 warning copy",
  )
  console.log(`  ✓ fallback warning + workspace-native regen button present`)
}

async function caseRecordingResolvesRoom(adminId: string, eirId: string) {
  console.log("\nCase 3 — Recording tab resolves an existing room by EIR:")
  const prep = await getPreparationForEir(eirId)
  assert(prep, "needs prep first")
  const [seededRoom] = await db!
    .insert(collaborationRooms)
    .values({
      preparation_id: prep!.id,
      name: `${TAG}-room`,
      eir_id: eirId,
      created_by: adminId,
    })
    .returning({ id: collaborationRooms.id })
  const room = await getRoomSummaryForEir(eirId)
  assert(room, "room not resolved")
  assert(room!.id === seededRoom.id, "wrong room")
  console.log(`  ✓ resolved room ${room!.id.slice(0, 8)}`)
  return seededRoom.id
}

async function caseRecordingCreateCta(adminId: string) {
  console.log("\nCase 4 — Recording tab create-room CTA when no room (prep exists):")
  // Build a NEW EIR with prep but no room.
  const [season] = await db!
    .insert(khatMapSeasons)
    .values({
      name: `${TAG}-season-norec`,
      season_number: null,
      status: "planning",
      target_episode_count: 4,
      v2_mode: "guided",
      created_by: adminId,
    })
    .returning()
  const [g] = await db!
    .insert(khatMapGuestCandidates)
    .values({
      season_id: season.id,
      status: "approved",
      full_name: `${TAG}-g`,
      bio: "x",
      gender: "unknown",
      public_links: [],
      social_accounts: { website: "https://example.com" },
      evidence_citations: [],
      risk_flags: [],
    })
    .returning()
  const [c] = await db!
    .insert(khatMapEpisodeCandidates)
    .values({
      season_id: season.id,
      status: "approved",
      working_title: `${TAG}-norec`,
      hook: "h",
      why_matters: "w",
      why_now: "n",
      goal: "g",
      description: "d",
      episode_type: "intellectual",
      topic_domain: "psychology",
      suggested_guest_candidate_id: g.id,
      main_axes: [],
      suggested_questions: [],
      production_notes: null,
      risk_level: "medium",
      effort_level: "medium",
    })
    .returning()
  const fresh = await getEpisodeCandidateById(c.id)
  const { eir } = await ensureEirForCandidate({ candidate: fresh!, guestId: g.id, adminId })
  await db!
    .insert(episodePreparations)
    .values({
      title: `${TAG}-norec-prep`,
      guest_name: null,
      status: "draft",
      eir_id: eir.id,
      created_by: adminId,
    })

  const room = await getRoomSummaryForEir(eir.id)
  assert(room === null, "room should not exist for the no-rec scenario")
  const prep = await getPreparationForEir(eir.id)
  assert(prep, "prep should exist")
  // The RecordingTab JSX should render a create-room CTA when room is null + prep is present.
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/episodes/[eirId]/tab-recording.tsx"),
    "utf8",
  )
  assert(
    body.includes("لا توجد غرفة تسجيل لهذه الحلقة"),
    "RecordingTab missing 'no room' state",
  )
  // UX-3b had a fallback link to /admin/preparation; UX-4 replaced it
  // with a workspace-native CreateRoomButton (the link still exists,
  // labeled "الصفحة القديمة"). Either is acceptable here.
  const hasCta =
    body.includes("CreateRoomButton") ||
    body.includes("إنشاء غرفة من الصفحة القديمة")
  assert(hasCta, "RecordingTab missing create-room CTA (button or fallback link)")
  console.log(`  ✓ create-room CTA present in source`)
}

async function caseStudioSummary(adminId: string, eirId: string) {
  console.log("\nCase 5 — Studio tab summary returns outputs + session:")
  // No session yet → all outputs are 'missing'.
  const before = await getStudioSummaryForEir(eirId)
  assert(before.session === null, "session should be null before insert")
  assert(before.outputs.every((o) => o.status === "missing"), "outputs should be missing")
  assert(before.outputs.length === 6, "expected 6 output kinds")

  // Seed a session + a couple records.
  const [session] = await db!
    .insert(studioSessions)
    .values({
      source: "youtube",
      status: "fetched",
      eir_id: eirId,
      video_title: `${TAG}-video`,
      youtube_url: "https://example.com/video",
      duration_seconds: 1800,
    } as never)
    .returning({ id: studioSessions.id })
  await db!.insert(studioAnalysisRecords).values([
    {
      studio_session_id: session.id,
      kind: "transcript",
      status: "ready",
      data: { _smoke: true } as never,
      generated_at: new Date(),
    } as never,
    {
      studio_session_id: session.id,
      kind: "chapters",
      status: "ready",
      data: { _smoke: true } as never,
      generated_at: new Date(),
    } as never,
  ])
  const after = await getStudioSummaryForEir(eirId)
  assert(after.session !== null, "session should be present")
  assert(after.session!.id === session.id, "session id mismatch")
  const transcript = after.outputs.find((o) => o.kind === "transcript")
  const chapters = after.outputs.find((o) => o.kind === "chapters")
  assert(transcript?.status === "ready", "transcript should be ready")
  assert(chapters?.status === "ready", "chapters should be ready")
  // Other kinds remain missing.
  const clips = after.outputs.find((o) => o.kind === "clips")
  assert(clips?.status === "missing", "clips should still be missing")
  console.log(`  ✓ session + outputs surfaced (transcript+chapters ready, others missing)`)
}

async function caseMarkersStrip(adminId: string, eirId: string, roomId: string) {
  console.log("\nCase 6 — markers strip surfaces room markers:")
  // Need a participant for the FK.
  const [participant] = await db!
    .insert(roomParticipants)
    .values({
      room_id: roomId,
      user_id: adminId,
      display_name: `${TAG}-author`,
      role: "director",
      is_online: false,
    })
    .returning({ id: roomParticipants.id })
  await db!.insert(roomSessionMarkers).values([
    {
      room_id: roomId,
      author_id: participant.id,
      marker_type: "deep_moment",
      label: "deep moment",
      recording_ms: 60_000,
      section_key: "emotional_peak",
    } as never,
    {
      room_id: roomId,
      author_id: participant.id,
      marker_type: "highlight",
      label: "highlight",
      recording_ms: 90_000,
      section_key: "deep_dive",
    } as never,
  ])
  const markers = await getMarkersForRoom(roomId, 30)
  assert(markers.length === 2, `expected 2 markers, got ${markers.length}`)
  assert(markers[0].marker_type === "highlight" || markers[0].marker_type === "deep_moment", "marker type wrong")
  assert(typeof markers[0].recording_ms === "number", "recording_ms missing")
  console.log(`  ✓ 2 markers surfaced (deep_moment + highlight)`)
}

async function casePublishLinkedEpisode(eirId: string) {
  console.log("\nCase 7 — Publish tab returns linked-episode summary:")
  await db!.insert(episodes).values({
    title: `${TAG}-published-episode`,
    slug: `${TAG}-pub-${Date.now()}`,
    youtube_url: "https://youtu.be/smokeUx3b",
    duration_minutes: 60,
    release_date: new Date().toISOString().slice(0, 10),
    status: "published",
    eir_id: eirId,
  } as never)
  const ep = await getEpisodeForEir(eirId)
  assert(ep, "episode not resolved")
  assert(ep!.status === "published", `expected published, got ${ep!.status}`)
  assert(ep!.youtube_url, "youtube_url missing")
  console.log(`  ✓ episode resolved (status=${ep!.status})`)
}

async function casePerformanceSignal(eirId: string) {
  console.log("\nCase 8 — Performance tab returns latest signal/snapshot:")
  await db!.insert(performanceSnapshots).values({
    eir_id: eirId,
    episode_id: null,
    view_count: "1234",
    like_count: "56",
    comment_count: "7",
    source: "youtube_api",
    raw: { _smoke: true } as never,
  } as never)
  await db!.insert(episodePerformanceSignals).values({
    eir_id: eirId,
    views_at_28d: 5000,
    editorial_signal_score: 0.72,
    baseline_used: "season",
  } as never)
  const perf = await getPerformanceForEir(eirId)
  assert(perf.signal, "signal missing")
  assert(perf.signal!.editorial_signal_score === 0.72, "score mismatch")
  assert(perf.latest_snapshot, "latest_snapshot missing")
  assert(perf.latest_snapshot!.view_count === "1234", "view_count mismatch")
  assert(perf.snapshot_count === 1, "snapshot_count mismatch")
  console.log(`  ✓ signal=0.72 baseline=season + 1 snapshot surfaced`)
}

async function caseSidebarEpisodesPointsToWorkspace() {
  console.log("\nCase 9 — sidebar Episodes link points at /admin/khat-brain/episodes:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/components/admin-sidebar.tsx"),
    "utf8",
  )
  // The PRIMARY "الحلقات" entry must point at the new index.
  // (The legacy /admin/episodes link is preserved under Site & Operations
  // with a different label "قائمة الحلقات (قديمة)".)
  const primaryLine = body
    .split("\n")
    .find((l) => l.includes(`label: "الحلقات"`))
  assert(primaryLine, "sidebar missing primary 'الحلقات' link")
  assert(
    primaryLine!.includes(`href: "/admin/khat-brain/episodes"`),
    `primary 'الحلقات' must point at new workspace, got: ${primaryLine}`,
  )
  console.log(`  ✓ sidebar Episodes → /admin/khat-brain/episodes`)
}

async function caseLegacyRecordingPageHasWorkspaceLink() {
  console.log("\nCase 10 — legacy /admin/recording/[roomId]/v2 page has 'open in Khat Brain':")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/recording/[roomId]/v2/page.tsx"),
    "utf8",
  )
  assert(
    body.includes("/admin/khat-brain/episodes/${eirId}?tab=recording"),
    "legacy v2 page missing the back-to-workspace link",
  )
  // Page module imports cleanly.
  const mod = await import("@/app/admin/recording/[roomId]/v2/page")
  assert(typeof mod.default === "function", "legacy page default missing")
  console.log(`  ✓ legacy v2 page still loads + links back to workspace`)
}

async function caseCleanupLeavesNothing() {
  console.log("\nCase 11 — cleanup leaves no smoke rows:")
  await cleanup()
  const c = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(khatMapSeasons)
  // We don't claim 0 across all seasons, only that ours are gone.
  const ours = await db!.execute(sql`
    SELECT count(*)::int AS c FROM khat_map_seasons WHERE name LIKE ${TAG + "%"}
  `)
  assert(
    Number((ours.rows[0] as { c: number })?.c ?? 0) === 0,
    "smoke seasons remain",
  )
  void c
  console.log(`  ✓ zero TAG rows after cleanup`)
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 smoke-khat-brain-ux3b — starting\n")
  await cleanup()
  const adminId = await ensureSmokeAdmin()
  const seeded = await seedScenario(adminId)

  await casePreparationRendersV2(adminId, seeded.eir.id)
  await casePrepFallbackWhenV2Missing(adminId)
  const roomId = await caseRecordingResolvesRoom(adminId, seeded.eir.id)
  await caseRecordingCreateCta(adminId)
  await caseStudioSummary(adminId, seeded.eir.id)
  await caseMarkersStrip(adminId, seeded.eir.id, roomId)
  await casePublishLinkedEpisode(seeded.eir.id)
  await casePerformanceSignal(seeded.eir.id)
  await caseSidebarEpisodesPointsToWorkspace()
  await caseLegacyRecordingPageHasWorkspaceLink()
  await caseCleanupLeavesNothing()

  console.log("\n✅ smoke-khat-brain-ux3b: all 11 cases passed")
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
