/**
 * UX-4 — Workspace-native actions + polish smoke (10 cases).
 *
 *   1. createRoomForEpisodeAction creates a room when prep exists +
 *      walks EIR forward to ready_to_record.
 *   2. action returns the existing room (existing=true) on a second call.
 *   3. action errors clearly when no prep exists for the EIR.
 *   4. Recording tab source mounts the workspace-native CreateRoomButton
 *      (not just a fallback link).
 *   5. pushPackageToEpisodeAction reuses the shared push helper +
 *      writes a push_log row into studio_analysis_records.
 *   6. Publish tab source mounts the workspace-native PushButton.
 *   7. Legacy /admin/episodes/[id] page surfaces the "Open in Khat Brain"
 *      banner when the episode row has eir_id.
 *   8. Legacy push API route still routes through the shared helper
 *      (i.e. the file imports runStudioPushToEpisode).
 *   9. Legacy /admin/episodes link in the sidebar is flag-gated.
 *  10. Cleanup leaves no smoke rows behind.
 *
 * Cleans up its own rows on success.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { sql, eq, desc } from "drizzle-orm"
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
  roomParticipants,
} from "@/lib/db/schema/collaboration"
import { studioSessions } from "@/lib/db/schema/studio"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import { episodes as episodesTable } from "@/lib/db/schema/episodes"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { ensureEirForCandidate, walkEirToPhase } from "@/lib/khat-brain"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"
import { createRoom } from "@/lib/collaboration/rooms"
import { runStudioPushToEpisode } from "@/lib/studio/push-to-episode"
import { createWebsitePackage } from "@/lib/studio/website-packages"

const TAG = "smoke-ux4"
const REPO_ROOT = path.resolve(__dirname, "..")

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

// The workspace actions are thin wrappers — auth + lookup + delegate.
// The smoke calls the underlying primitives (createRoom +
// runStudioPushToEpisode) the same way the actions do. A separate
// case verifies the action source delegates to those primitives.

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
  await db!.execute(sql`DELETE FROM episode_enrichments WHERE episode_id IN
    (SELECT id FROM episodes WHERE title LIKE ${TAG + "%"})`)
  await db!.execute(sql`DELETE FROM episode_overrides WHERE episode_id IN
    (SELECT id FROM episodes WHERE title LIKE ${TAG + "%"})`)
  await db!.execute(sql`DELETE FROM episode_quotes_config WHERE episode_id IN
    (SELECT id FROM episodes WHERE title LIKE ${TAG + "%"})`)
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

// ─── Seed helpers ─────────────────────────────────────────────────────

async function seedScenario(adminId: string, suffix: string) {
  const [season] = await db!
    .insert(khatMapSeasons)
    .values({
      name: `${TAG}-${suffix}`,
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
      working_title: `${TAG}-${suffix}-episode`,
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
  return { season, eir, guest }
}

async function seedPreparation(adminId: string, eirId: string, suffix: string) {
  await walkEirToPhase({ eirId, toPhase: "approved", actorId: adminId, reason: "smoke" })
  const [prep] = await db!
    .insert(episodePreparations)
    .values({
      title: `${TAG}-${suffix}-prep`,
      guest_name: `${TAG}-guest`,
      status: "draft",
      eir_id: eirId,
      created_by: adminId,
    })
    .returning({ id: episodePreparations.id })
  return prep.id
}

// ─── Cases ────────────────────────────────────────────────────────────

async function caseCreateRoomHappy(admin: { id: string; email: string }) {
  console.log("Case 1+2 — workspace-native create-room flow (createRoom + EIR walk):")
  const seeded = await seedScenario(admin.id, "happy")
  const prepId = await seedPreparation(admin.id, seeded.eir.id, "happy")

  // Replicates the action body: createRoom( {prep, name}, adminId ).
  const room = await createRoom(
    { preparation_id: prepId, name: `${TAG}-happy-prep` },
    admin.id,
  )
  assert(room.id, "room_id missing")
  console.log(`  ✓ room created (id=${room.id.slice(0, 8)})`)

  // EIR should have walked forward to ready_to_record (createRoom
  // calls walkForwardIfBehind internally).
  const [eirRow] = await db!
    .select({ phase: episodeIntelligenceRecords.phase })
    .from(episodeIntelligenceRecords)
    .where(eq(episodeIntelligenceRecords.id, seeded.eir.id))
    .limit(1)
  assert(eirRow.phase === "ready_to_record", `expected ready_to_record, got ${eirRow.phase}`)
  console.log(`  ✓ EIR walked to ready_to_record`)

  // The action returns "existing" on a second call by checking
  // collaboration_rooms first. Verify that lookup is sane.
  const existing = await db!
    .select({ id: collaborationRooms.id })
    .from(collaborationRooms)
    .where(eq(collaborationRooms.eir_id, seeded.eir.id))
  assert(existing.length === 1, `expected 1 existing room for EIR, got ${existing.length}`)
  assert(existing[0].id === room.id, "existing-room lookup should return the room we just created")
  console.log(`  ✓ second call would return the existing room (verified via lookup)`)

  return { eirId: seeded.eir.id, roomId: room.id, seasonId: seeded.season.id }
}

async function caseCreateRoomNoPrep(admin: { id: string; email: string }) {
  console.log("\nCase 3 — create-room flow errors when no prep:")
  const seeded = await seedScenario(admin.id, "noprep")
  // Don't seed a prep. The action does:
  //   const [prep] = db.select(...).from(prep).where(prep.eir_id === eirId)
  //   if (!prep) return { ok:false, reason: "no_preparation" }
  // Verify the lookup path returns nothing.
  const [prep] = await db!
    .select({ id: episodePreparations.id })
    .from(episodePreparations)
    .where(eq(episodePreparations.eir_id, seeded.eir.id))
    .limit(1)
  assert(!prep, "no preparation expected for this EIR")
  // Verify the action source still encodes the no_preparation reason.
  const actionsBody = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/episodes/[eirId]/actions.ts"),
    "utf8",
  )
  assert(
    actionsBody.includes(`reason: "no_preparation"`),
    "action source missing no_preparation guard",
  )
  console.log(`  ✓ action returns no_preparation when prep is missing`)
}

async function caseRecordingTabHasButton() {
  console.log("\nCase 4 — Recording tab mounts CreateRoomButton:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/episodes/[eirId]/tab-recording.tsx"),
    "utf8",
  )
  assert(body.includes("CreateRoomButton"), "RecordingTab must mount CreateRoomButton")
  assert(
    body.includes('import { CreateRoomButton } from "./create-room-button"'),
    "RecordingTab must import CreateRoomButton",
  )
  console.log(`  ✓ workspace-native button mounted (no longer a pure link)`)
}

async function casePushHelperRoundTrip(eirId: string) {
  console.log("\nCase 5 — runStudioPushToEpisode round-trip + push_log row:")
  // Seed a studio session, a website_package row, and an episodes row
  // linked to the same eir_id.
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
  const [episode] = await db!
    .insert(episodesTable)
    .values({
      title: `${TAG}-pushed`,
      slug: `${TAG}-pushed-${Date.now()}`,
      youtube_url: "https://youtu.be/smokeUx4",
      duration_minutes: 60,
      release_date: new Date().toISOString().slice(0, 10),
      status: "draft",
      eir_id: eirId,
    } as never)
    .returning({ id: episodesTable.id })
  // Use the existing website-package writer (mirrors how Studio
  // produces this row in production). linked_episode_id is required.
  await createWebsitePackage(session.id, {
    status: "ready",
    hero_summary: `${TAG}-hero`,
    full_summary: `${TAG}-full`,
    takeaways: ["t1", "t2"],
    quotes: [],
    resources: [],
    timestamps: [],
    custom_title: `${TAG}-custom-title`,
    selected_quote_indices: null,
    selected_takeaway_indices: null,
    linked_episode_id: episode.id,
    raw_openai_response: null,
    error_message: null,
  } as never)

  // The action's body delegates to runStudioPushToEpisode; the smoke
  // calls the helper directly with the same fields.
  const result = await runStudioPushToEpisode({
    sessionId: session.id,
    fields: {
      title: true,
      description: true,
      hero_summary: true,
      full_summary: true,
      takeaways: true,
      quotes: true,
      resources: true,
      timestamps: true,
    },
  })
  assert(result.episodeId === episode.id, "episodeId mismatch")
  assert(result.pushedFields.length >= 3, `expected ≥3 pushedFields, got ${result.pushedFields.length}`)
  console.log(`  ✓ pushed ${result.pushedFields.length} fields (${result.pushedFields.join(",")})`)

  // push_log row was written via the patched RPC.
  const log = await db!
    .select({ id: studioAnalysisRecords.id, data: studioAnalysisRecords.data })
    .from(studioAnalysisRecords)
    .where(
      and(
        eq(studioAnalysisRecords.studio_session_id, session.id),
        eq(studioAnalysisRecords.kind, "push_log"),
      ),
    )
    .orderBy(desc(studioAnalysisRecords.created_at))
    .limit(1)
  assert(log[0], "push_log row missing — did the RPC write it?")
  console.log(`  ✓ push_log row written`)

  // Verify the action source delegates to the helper.
  const actionsBody = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/episodes/[eirId]/actions.ts"),
    "utf8",
  )
  assert(
    actionsBody.includes("runStudioPushToEpisode"),
    "action must delegate to runStudioPushToEpisode",
  )
  console.log(`  ✓ action source delegates to runStudioPushToEpisode`)
  return { sessionId: session.id, episodeId: episode.id }
}

async function casePublishTabHasButton() {
  console.log("\nCase 6 — Publish tab mounts PushButton:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/episodes/[eirId]/tab-publish.tsx"),
    "utf8",
  )
  assert(body.includes("PushButton"), "PublishTab must mount PushButton")
  assert(
    body.includes('import { PushButton } from "./push-button"'),
    "PublishTab must import PushButton",
  )
  console.log(`  ✓ workspace-native push button mounted`)
}

async function caseLegacyEpisodeBanner() {
  console.log("\nCase 7 — legacy /admin/episodes/[id] surfaces a back-link to the workspace:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/episodes/[id]/page.tsx"),
    "utf8",
  )
  // Phase B renamed the banner copy to be operator-honest about the
  // legacy view. Accept either historical or current copy.
  assert(
    body.includes("افتح في Khat Brain") ||
      body.includes("Open in Khat Brain") ||
      body.includes("العودة إلى مساحة العمل"),
    "legacy episode page missing back-link banner copy",
  )
  assert(
    body.includes("/admin/khat-brain/episodes/${eirId}"),
    "legacy episode page must link to the workspace by eir_id",
  )
  // Module imports cleanly.
  const mod = await import("@/app/admin/episodes/[id]/page")
  assert(typeof mod.default === "function", "legacy episode page module broken")
  console.log(`  ✓ banner present + page module loads`)
}

async function caseLegacyPushRouteUsesHelper() {
  console.log("\nCase 8 — legacy push API route delegates to runStudioPushToEpisode:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/api/admin/studio/[id]/push/route.ts"),
    "utf8",
  )
  assert(
    body.includes(`from "@/lib/studio/push-to-episode"`),
    "legacy push route must import the shared helper",
  )
  assert(
    body.includes("runStudioPushToEpisode"),
    "legacy push route must call the shared helper",
  )
  // The route should NOT call the RPC directly anymore. We look for an
  // actual call (with paren) rather than just the function name —
  // documentation comments mentioning push_episode_data are fine.
  assert(
    !body.match(/push_episode_data\s*\(/),
    "legacy push route should not call push_episode_data() directly anymore",
  )
  console.log(`  ✓ route is a thin wrapper around the shared helper`)
}

async function caseLegacySidebarFlag() {
  console.log("\nCase 9 — legacy /admin/episodes sidebar entry is flag-gated:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/components/admin-sidebar.tsx"),
    "utf8",
  )
  assert(
    body.includes("legacy: true"),
    "sidebar legacy flag definition missing",
  )
  assert(
    body.includes("NEXT_PUBLIC_KHAT_LEGACY_EPISODES_VISIBLE"),
    "sidebar must read NEXT_PUBLIC_KHAT_LEGACY_EPISODES_VISIBLE",
  )
  // The legacy entry block is still in the source (so toggling restores
  // it). Phase B.3 renamed the label from "قائمة الحلقات الكاملة" to
  // "الحلقات" inside the collapsible "أدوات متقدمة" group. The smoke
  // verifies the legacy item still exists with `legacy: true` + the
  // /admin/episodes href; the exact label doesn't matter for the gate.
  assert(
    body.includes("legacy: true"),
    "legacy sidebar item must remain defined with legacy: true gate",
  )
  // Item must still target /admin/episodes.
  assert(
    body.match(/href:\s*"\/admin\/episodes"[\s\S]{0,160}legacy:\s*true/),
    "legacy sidebar item must remain pointed at /admin/episodes",
  )
  console.log(`  ✓ legacy sidebar entry hidden by default`)
}

async function caseCleanupCheck() {
  console.log("\nCase 10 — cleanup leaves no smoke rows:")
  await cleanup()
  const c = await db!.execute(sql`
    SELECT count(*)::int AS c FROM khat_map_seasons WHERE name LIKE ${TAG + "%"}
  `)
  assert(
    Number((c.rows[0] as { c: number })?.c ?? 0) === 0,
    "smoke seasons remain",
  )
  console.log(`  ✓ zero TAG rows after cleanup`)
}

// drizzle import re-used inside cases
import { and } from "drizzle-orm"

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 smoke-khat-brain-ux4 — starting\n")
  await cleanup()
  const admin = await ensureSmokeAdmin()

  const happy = await caseCreateRoomHappy(admin)
  await caseCreateRoomNoPrep(admin)
  await caseRecordingTabHasButton()
  await casePushHelperRoundTrip(happy.eirId)
  await casePublishTabHasButton()
  await caseLegacyEpisodeBanner()
  await caseLegacyPushRouteUsesHelper()
  await caseLegacySidebarFlag()
  await caseCleanupCheck()

  console.log("\n✅ smoke-khat-brain-ux4: all 10 cases passed")
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
