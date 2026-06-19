/**
 * Khat Brain — full end-to-end operational cycle.
 *
 * Walks one episode all the way from a Khat Map idea through Command
 * Center visibility. Uses REAL service entry points wherever they
 * exist; only mocks YouTube where the worker would call the API.
 *
 * Flow:
 *   1. Seed Khat Map season + guest_candidate + episode_candidate
 *   2. Accept candidate → ensureEirForCandidate (EIR appears at guest_assigned)
 *   3. convertEpisodeToPreparation (creates prep, walks EIR to researching)
 *   4. createRoom (walks EIR to ready_to_record)
 *   5. updateRoom: live → paused → ended (walks EIR through recording → recorded)
 *   6. createStudioSession (links eir_id, walks to producing via resolver)
 *   7. createTranscript / createChapters / createClips / createWebsitePackage
 *   8. Insert episode + push studio package via push_episode_data() RPC,
 *      stamp episodes.eir_id, syncEirOnStudioPushed → ready_to_publish
 *   9. Mark episode published, syncEirOnEpisodePublish → published
 *  10. MOCKED YouTube refresh: insert two performance_snapshots rows,
 *      label clearly, syncEirOnPerformanceWrite → analyzing
 *  11. analyzeEirPerformance → episode_performance_signals row
 *  12. getCommandCenterData → assert EIR + snapshot visible
 *
 * Invocation:
 *   export DATABASE_URL=...
 *   npx tsx scripts/cycle-khat-brain-e2e.ts
 *
 * Cleans up its own rows on success.
 */

import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  khatMapSeasons,
  khatMapGuestCandidates,
  khatMapEpisodeCandidates,
} from "@/lib/db/schema/khat-map"
import { episodes as episodesTable } from "@/lib/db/schema/episodes"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { collaborationRooms } from "@/lib/db/schema"
import { studioSessions } from "@/lib/db/schema/studio"
import { studioAnalysisRecords, performanceSnapshots } from "@/lib/db/schema/studio-analysis"
import { episodePerformanceSignals } from "@/lib/db/schema/performance-signals"
import {
  episodeIntelligenceRecords,
  type EpisodePhase,
} from "@/lib/db/schema/eir"
import { getEpisodeIntelligenceRecord } from "@/lib/eir"
import {
  ensureEirForCandidate,
  walkEirToPhase,
  syncEirOnStudioPushed,
  syncEirOnEpisodePublish,
  syncEirOnPerformanceWrite,
  getEirIdForStudioSession,
} from "@/lib/khat-brain"
import { convertEpisodeToPreparation } from "@/lib/khat-map/conversion/to-preparation"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"
import { createRoom, updateRoom } from "@/lib/collaboration/rooms"
import { createStudioSession } from "@/lib/studio/sessions"
import { createTranscript } from "@/lib/studio/transcripts"
import { createChapters } from "@/lib/studio/chapters"
import { createClips } from "@/lib/studio/clips"
import { createWebsitePackage } from "@/lib/studio/website-packages"
import { analyzeEirPerformance } from "@/lib/khat-brain/performance-learning"
import { getCommandCenterData } from "@/lib/khat-brain/command-center"

const TAG = "cycle-e2e"

interface StepResult {
  step: number
  name: string
  pass: boolean
  notes: string[]
  ids?: Record<string, string>
}
const results: StepResult[] = []
const phaseHistory: Array<{ step: number; phase: EpisodePhase }> = []
const tablesTouched = new Set<string>()

function pass(step: number, name: string, notes: string[], ids?: Record<string, string>) {
  results.push({ step, name, pass: true, notes, ids })
  console.log(`✅ Step ${step} — ${name}`)
  for (const n of notes) console.log(`   · ${n}`)
}
function fail(step: number, name: string, msg: string): never {
  results.push({ step, name, pass: false, notes: [msg] })
  console.error(`❌ Step ${step} — ${name}: ${msg}`)
  throw new Error(`Step ${step} failed: ${msg}`)
}

async function recordPhase(step: number, eirId: string) {
  const eir = await getEpisodeIntelligenceRecord(eirId)
  if (eir) phaseHistory.push({ step, phase: eir.phase })
  return eir?.phase ?? null
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
  // Children first.
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
      (SELECT id::text FROM studio_sessions WHERE episode_title LIKE ${TAG + "%"} OR video_title LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM studio_sessions
     WHERE episode_title LIKE ${TAG + "%"} OR video_title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM collaboration_rooms WHERE name LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM episodes WHERE title LIKE ${TAG + "%"} OR slug LIKE ${TAG + "%"}
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
  await db!.execute(sql`
    DELETE FROM khat_map_seasons WHERE name LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`DELETE FROM ai_runs WHERE subject_id LIKE ${TAG + "%"}`)
}

// ─── Cycle ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 Khat Brain — full end-to-end cycle\n")
  await cleanup()
  const adminId = await ensureSmokeAdmin()
  console.log(`(admin id: ${adminId.slice(0, 8)})\n`)

  // ── STEP 1: Seed Khat Map candidate
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
      bio: "cycle-e2e guest",
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
      working_title: `${TAG}-candidate-title`,
      hook: "the-hook",
      why_matters: "why-matters",
      why_now: "why-now",
      goal: "explore one idea deeply",
      description: "single-arc deep-dive episode",
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
  tablesTouched.add("khat_map_seasons")
  tablesTouched.add("khat_map_guest_candidates")
  tablesTouched.add("khat_map_episode_candidates")
  pass(1, "Seed Khat Map candidate", [
    `season=${season.id.slice(0, 8)}`,
    `guest=${guest.id.slice(0, 8)}`,
    `candidate=${candidate.id.slice(0, 8)}`,
  ], { season: season.id, guest: guest.id, candidate: candidate.id })

  // ── STEP 2: Accept candidate → EIR
  const candFresh = await getEpisodeCandidateById(candidate.id)
  if (!candFresh) fail(2, "Accept candidate", "candidate vanished")
  const ensure = await ensureEirForCandidate({
    candidate: candFresh!,
    guestId: guest.id,
    adminId,
  })
  tablesTouched.add("episode_intelligence_records")
  if (!ensure.created) fail(2, "Accept candidate", "ensureEirForCandidate did not create a new EIR")
  if (ensure.eir.phase !== "guest_assigned") {
    fail(2, "Accept candidate", `expected phase=guest_assigned got ${ensure.eir.phase}`)
  }
  await recordPhase(2, ensure.eir.id)
  pass(2, "EIR created from candidate", [
    `eir=${ensure.eir.id.slice(0, 8)}`,
    `phase=${ensure.eir.phase}`,
    `created=${ensure.created}`,
  ], { eir: ensure.eir.id })
  const eirId = ensure.eir.id

  // ── STEP 3: Convert to preparation
  const conv = await convertEpisodeToPreparation({
    episode_candidate_id: candidate.id,
    admin_id: adminId,
  })
  if (!conv.ok) fail(3, "Convert to preparation", `conversion failed: ${conv.reason}`)
  const prepId = conv.link!.target_id
  tablesTouched.add("episode_preparations")
  // Verify prep.eir_id is wired.
  const [prepRow] = await db!
    .select({ id: episodePreparations.id, eir_id: episodePreparations.eir_id })
    .from(episodePreparations)
    .where(eq(episodePreparations.id, prepId))
    .limit(1)
  if (!prepRow || prepRow.eir_id !== eirId) {
    fail(3, "Convert to preparation", `preparation.eir_id mismatch (got ${prepRow?.eir_id})`)
  }
  await recordPhase(3, eirId)
  // The conversion walks the EIR to "researching". Walk the rest of the
  // way to "prepared" so the room can fire on a prepared EIR.
  await walkEirToPhase({
    eirId,
    toPhase: "prepared",
    actorId: adminId,
    reason: "cycle-e2e:prep-reviewed",
  })
  await recordPhase(3, eirId)
  pass(3, "Convert to preparation", [
    `preparation=${prepId.slice(0, 8)}`,
    `preparation.eir_id=${prepRow.eir_id?.slice(0, 8)}`,
    `phase walked: researching → prepared`,
  ], { preparation: prepId })

  // ── STEP 4: Create recording room → ready_to_record
  const room = await createRoom(
    { preparation_id: prepId, name: `${TAG}-room` },
    adminId,
  )
  tablesTouched.add("collaboration_rooms")
  if (room.eir_id !== eirId) {
    fail(4, "Create recording room", `room.eir_id mismatch (got ${room.eir_id})`)
  }
  const phaseAfterRoom = await recordPhase(4, eirId)
  if (phaseAfterRoom !== "ready_to_record") {
    fail(4, "Create recording room", `expected ready_to_record got ${phaseAfterRoom}`)
  }
  pass(4, "Recording room created → ready_to_record", [
    `room=${room.id.slice(0, 8)}`,
    `room.status=${room.status}`,
    `eir.phase=${phaseAfterRoom}`,
  ], { room: room.id })

  // ── STEP 5: Room status transitions
  await updateRoom(room.id, { status: "live" })
  let phase = await recordPhase(5, eirId)
  if (phase !== "recording") fail(5, "Room status: live", `expected recording got ${phase}`)
  await updateRoom(room.id, { status: "paused" })
  phase = await recordPhase(5, eirId)
  if (phase !== "recording") fail(5, "Room status: paused", `paused must not move EIR (got ${phase})`)
  await updateRoom(room.id, { status: "ended" })
  phase = await recordPhase(5, eirId)
  if (phase !== "recorded") fail(5, "Room status: ended", `expected recorded got ${phase}`)
  pass(5, "Room status walks EIR through recording → recorded", [
    `live → recording`,
    `paused → recording (no-op)`,
    `ended → recorded`,
  ])

  // ── STEP 6: Studio session
  const sessionResult = await createStudioSession(
    {
      source: "youtube",
      status: "fetched",
      youtube_url: `https://youtu.be/cycleE2E001`,
      video_id: "cycleE2E001",
      video_title: `${TAG}-video`,
      channel_title: "Khat",
      published_at: null,
      duration_seconds: 3600,
      thumbnail_url: null,
      raw_youtube_response: null,
      audio_filename: null,
      audio_file_size: null,
      audio_start_seconds: null,
      audio_end_seconds: null,
      audio_best_intro: null,
      audio_edit_suggestions: null,
      episode_id: null,
      episode_title: `${TAG}-episode`,
      source_type: "studio",
      notes: null,
    } as never,
    { preparationId: prepId, createdBy: adminId },
  )
  if (!sessionResult.success || !sessionResult.data) {
    fail(6, "Create studio session", `error: ${sessionResult.error ?? "unknown"}`)
  }
  const studioSessionId = sessionResult.data!.id
  tablesTouched.add("studio_sessions")
  const sessionEir = await getEirIdForStudioSession(studioSessionId)
  if (sessionEir !== eirId) {
    fail(6, "Create studio session", `studio_sessions.eir_id mismatch (got ${sessionEir})`)
  }
  // The resolver does not walk; it just stamps. Walk to "producing".
  await walkEirToPhase({ eirId, toPhase: "producing", actorId: adminId, reason: "cycle-e2e:studio-session-created" })
  await recordPhase(6, eirId)
  pass(6, "Studio session created", [
    `studio_sessions.id=${studioSessionId.slice(0, 8)}`,
    `studio_sessions.eir_id=${sessionEir?.slice(0, 8)}`,
    `walked phase: recorded → producing`,
  ], { studio_session: studioSessionId })

  // ── STEP 7: Studio outputs
  // `StudioTranscriptSource` accepts `'youtube_captions' | 'upload' |
  // 'whisper' | 'paste'`. The cycle script pastes a fixture string —
  // `"paste"` is the matching variant. (Was `"manual"`, which was
  // never in the union.)
  const transcriptRes = await createTranscript(
    studioSessionId,
    "paste",
    "Welcome to khat. Today we discuss philosophy. ".repeat(20),
    "ar",
  )
  if (!transcriptRes.success) fail(7, "Studio outputs: transcript", transcriptRes.error ?? "?")
  const chaptersRes = await createChapters(studioSessionId, {
    status: "ready",
    chapters: [
      { title: "Intro", start_time_seconds: 0, end_time_seconds: 120, summary: "intro" },
      { title: "Main", start_time_seconds: 120, end_time_seconds: 3000, summary: "main" },
      { title: "Outro", start_time_seconds: 3000, end_time_seconds: 3600, summary: "outro" },
    ] as never,
    raw_openai_response: null,
    error_message: null,
  })
  if (!chaptersRes.success) fail(7, "Studio outputs: chapters", chaptersRes.error ?? "?")
  const clipsRes = await createClips(studioSessionId, {
    status: "ready",
    clips: [
      { title: "Clip A", start_time_seconds: 600, end_time_seconds: 660, hook: "h", reason: "r" },
      { title: "Clip B", start_time_seconds: 1800, end_time_seconds: 1860, hook: "h2", reason: "r2" },
    ] as never,
    raw_openai_response: null,
    error_message: null,
  })
  if (!clipsRes.success) fail(7, "Studio outputs: clips", clipsRes.error ?? "?")
  const pkgRes = await createWebsitePackage(studioSessionId, {
    status: "ready",
    hero_summary: `${TAG}-hero`,
    full_summary: `${TAG}-full-summary`,
    takeaways: ["takeaway-1", "takeaway-2", "takeaway-3"],
    quotes: [{ text: "a notable line", theme: "philosophy", speaker: `${TAG}-guest` }] as never,
    resources: [],
    timestamps: [
      { title: "Intro", time_seconds: 0 },
      { title: "Main", time_seconds: 120 },
    ] as never,
    custom_title: `${TAG}-final-title`,
    selected_quote_indices: [0],
    selected_takeaway_indices: [0, 1, 2],
    linked_episode_id: null,
    raw_openai_response: null,
    error_message: null,
  })
  if (!pkgRes.success) fail(7, "Studio outputs: website_package", pkgRes.error ?? "?")
  tablesTouched.add("studio_analysis_records")
  // Verify all four kinds present.
  const kinds = await db!
    .select({ kind: studioAnalysisRecords.kind })
    .from(studioAnalysisRecords)
    .where(eq(studioAnalysisRecords.studio_session_id, studioSessionId))
  const kindSet = new Set(kinds.map((k) => k.kind))
  // `as const` so the literal array narrows to the StudioAnalysisKind
  // union and matches `kindSet.has()`'s parameter type.
  const expectedKinds = ["transcript", "chapters", "clips", "website_package"] as const
  for (const expected of expectedKinds) {
    if (!kindSet.has(expected)) fail(7, "Studio outputs", `missing kind=${expected}`)
  }
  pass(7, "Studio outputs (4 kinds) written", [
    `transcript ✓ chapters ✓ clips ✓ website_package ✓`,
    `package.id=${pkgRes.data!.id.slice(0, 8)}`,
  ])

  // ── STEP 8: Push studio package to episode
  const [episode] = await db!
    .insert(episodesTable)
    .values({
      title: `${TAG}-episode-title`,
      slug: `${TAG}-${Date.now()}`,
      youtube_url: `https://youtu.be/cycleE2E001`,
      duration_minutes: 60,
      release_date: new Date().toISOString().slice(0, 10),
      status: "draft",
    } as never)
    .returning()
  tablesTouched.add("episodes")
  // Link the website package to this episode (mirrors what UI does).
  await db!
    .update(studioAnalysisRecords)
    .set({
      data: sql`jsonb_set(${studioAnalysisRecords.data}, '{linked_episode_id}', to_jsonb(${episode.id}::text))`,
      updated_at: new Date(),
    })
    .where(
      sql`${studioAnalysisRecords.studio_session_id} = ${studioSessionId} AND ${studioAnalysisRecords.kind} = 'website_package'`,
    )
  // Call the same RPC the API route uses.
  const overrideJson = JSON.stringify({
    original_title: `${TAG}-episode-title`,
    custom_title: `${TAG}-final-title`,
    custom_description: `${TAG}-full-summary`,
  })
  const enrichmentJson = JSON.stringify({
    hero_summary: `${TAG}-hero`,
    full_summary: `${TAG}-full-summary`,
    takeaways: ["takeaway-1", "takeaway-2", "takeaway-3"],
    timestamps: [
      { title: "Intro", time_seconds: 0 },
      { title: "Main", time_seconds: 120 },
    ],
  })
  const logJson = JSON.stringify({
    session_id: studioSessionId,
    episode_title: `${TAG}-episode-title`,
    pushed_fields: ["title", "description", "hero_summary", "full_summary", "takeaways", "timestamps"],
    pushed_at: new Date().toISOString(),
    via: "cycle-e2e",
  })
  await db!.execute(sql`
    SELECT push_episode_data(
      ${episode.id},
      ${overrideJson}::jsonb,
      NULL::jsonb,
      ${enrichmentJson}::jsonb,
      ${logJson}::jsonb
    )
  `)
  // Stamp episodes.eir_id and walk to ready_to_publish (mirrors API route).
  await db!
    .update(episodesTable)
    .set({ eir_id: eirId, updated_at: new Date() } as never)
    .where(eq(episodesTable.id, episode.id))
  await syncEirOnStudioPushed({ eirId })
  const phaseStep8 = await recordPhase(8, eirId)
  if (phaseStep8 !== "ready_to_publish") {
    fail(8, "Push to episode", `expected ready_to_publish got ${phaseStep8}`)
  }
  // Verify episodes.eir_id stamped.
  const [epRow] = await db!
    .select({ id: episodesTable.id, eir_id: episodesTable.eir_id })
    .from(episodesTable)
    .where(eq(episodesTable.id, episode.id))
    .limit(1)
  if (epRow.eir_id !== eirId) fail(8, "Push to episode", `episodes.eir_id mismatch (got ${epRow.eir_id})`)
  pass(8, "Studio package pushed to episode", [
    `episode=${episode.id.slice(0, 8)}`,
    `episodes.eir_id=${epRow.eir_id?.slice(0, 8)}`,
    `eir.phase=${phaseStep8}`,
    `via push_episode_data() RPC`,
  ], { episode: episode.id })

  // ── STEP 9: Mark published
  await db!
    .update(episodesTable)
    .set({ status: "published" } as never)
    .where(eq(episodesTable.id, episode.id))
  await syncEirOnEpisodePublish({ eirId, actorId: adminId })
  const phaseStep9 = await recordPhase(9, eirId)
  if (phaseStep9 !== "published") {
    fail(9, "Mark episode published", `expected published got ${phaseStep9}`)
  }
  pass(9, "Episode published", [
    `episodes.status=published`,
    `eir.phase=${phaseStep9}`,
  ])

  // ── STEP 10: MOCKED YouTube performance refresh
  // The real worker calls YouTube Data API. Here we directly insert two
  // performance_snapshots rows, clearly labeled, so we can exercise the
  // analyzer + Command Center surfaces without external network.
  const anchor = new Date(Date.now() - 30 * 86400_000)
  await db!.insert(performanceSnapshots).values({
    eir_id: eirId,
    episode_id: episode.id,
    snapshot_at: anchor,
    view_count: "1200",
    like_count: "60",
    comment_count: "8",
    source: "youtube_api",
    raw: { _MOCKED: true, tag: TAG, note: "publish-anchor snapshot" } as never,
  })
  await db!.insert(performanceSnapshots).values({
    eir_id: eirId,
    episode_id: episode.id,
    snapshot_at: new Date(anchor.getTime() + 28 * 86400_000),
    view_count: "9200",
    like_count: "420",
    comment_count: "85",
    source: "youtube_api",
    raw: { _MOCKED: true, tag: TAG, note: "28d snapshot" } as never,
  })
  tablesTouched.add("performance_snapshots")
  await syncEirOnPerformanceWrite({ eirId })
  const phaseStep10 = await recordPhase(10, eirId)
  if (phaseStep10 !== "analyzing") {
    fail(10, "YouTube refresh (mocked)", `expected analyzing got ${phaseStep10}`)
  }
  const snapCount = await db!
    .select({ id: performanceSnapshots.id })
    .from(performanceSnapshots)
    .where(eq(performanceSnapshots.eir_id, eirId))
  if (snapCount.length !== 2) {
    fail(10, "YouTube refresh (mocked)", `expected 2 snapshots, got ${snapCount.length}`)
  }
  pass(10, "YouTube performance refresh — MOCKED", [
    `inserted 2 performance_snapshots rows (source=youtube_api, raw._MOCKED=true)`,
    `eir.phase=${phaseStep10}`,
    `(real handler would hit YouTube Data API; behaviour identical from analyzer's POV)`,
  ])

  // ── STEP 11: Performance learning analysis
  const analysis = await analyzeEirPerformance(eirId)
  tablesTouched.add("episode_performance_signals")
  if (!analysis.ok || !analysis.signal) {
    fail(11, "Performance learning", `analyzer failed: ${analysis.reason}`)
  }
  const score = analysis.signal!.editorial_signal_score
  if (score === null) fail(11, "Performance learning", "editorial_signal_score is null")
  pass(11, "Performance learning signal computed", [
    `views_at_28d=${analysis.signal!.views_at_28d}`,
    `like_rate=${analysis.signal!.like_rate?.toFixed(4)} comment_rate=${analysis.signal!.comment_rate?.toFixed(4)}`,
    `editorial_signal_score=${score?.toFixed(3)}`,
    `baseline_used=${analysis.signal!.baseline_used}`,
  ], { signal: analysis.signal!.id })

  // ── STEP 12: Command Center
  const cc = await getCommandCenterData()
  const eirVisible = cc.recent.eirs.find((e) => e.id === eirId)
  const snapVisible = cc.recent.performance_snapshots.find((s) => s.eir_id === eirId)
  const phaseCountAnalyzing = (cc.phase_counts as Record<string, number>).analyzing ?? 0
  const phaseCountPublished = (cc.phase_counts as Record<string, number>).published ?? 0
  const aiRunsCount = cc.totals.failed_ai_runs_recent
  const jobsCount = cc.totals.failed_jobs_recent
  const alerts = cc.alerts.length
  if (!eirVisible) {
    fail(12, "Command Center", `cycle EIR ${eirId.slice(0, 8)} not in recent.eirs`)
  }
  if (!snapVisible) {
    fail(12, "Command Center", `cycle snapshot not in recent.performance_snapshots`)
  }
  pass(12, "Command Center sees the cycle", [
    `EIR visible in recent.eirs (phase=${eirVisible!.phase})`,
    `Performance snapshot visible (eir_id=${snapVisible!.eir_id?.slice(0, 8)}, views=${snapVisible!.view_count})`,
    `phase_counts.analyzing=${phaseCountAnalyzing} (incl. our cycle)`,
    `phase_counts.published=${phaseCountPublished}`,
    `failed_ai_runs_recent=${aiRunsCount}, failed_jobs_recent=${jobsCount}`,
    `total alerts=${alerts}`,
  ])

  // ── Final report
  console.log("\n" + "═".repeat(72))
  console.log("KHAT BRAIN — FULL CYCLE QA REPORT")
  console.log("═".repeat(72))
  console.log(`\nResult: ${results.every((r) => r.pass) ? "✅ ALL 12 STEPS PASSED" : "❌ FAILURES PRESENT"}`)
  console.log(`\nPhase transition history (EIR ${eirId.slice(0, 8)}):`)
  for (const h of phaseHistory) console.log(`  step ${h.step}: ${h.phase}`)
  console.log(`\nTables touched (${tablesTouched.size}):`)
  for (const t of [...tablesTouched].sort()) console.log(`  - ${t}`)
  console.log(`\nKey IDs:`)
  for (const r of results) {
    if (r.ids) {
      for (const [k, v] of Object.entries(r.ids)) {
        console.log(`  ${k}: ${v}`)
      }
    }
  }
  console.log(`\nMocked surfaces:`)
  console.log(`  - YouTube Data API call (step 10) — bypassed; performance_snapshots rows`)
  console.log(`    inserted directly with source=youtube_api, raw._MOCKED=true`)
  console.log(`\nReal services exercised:`)
  console.log(`  ensureEirForCandidate, walkEirToPhase, convertEpisodeToPreparation,`)
  console.log(`  createRoom, updateRoom, createStudioSession, createTranscript,`)
  console.log(`  createChapters, createClips, createWebsitePackage,`)
  console.log(`  push_episode_data() RPC, syncEirOnStudioPushed,`)
  console.log(`  syncEirOnEpisodePublish, syncEirOnPerformanceWrite,`)
  console.log(`  analyzeEirPerformance, getCommandCenterData`)

  await cleanup()
  console.log(`\nCleanup complete.`)
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("\n💥 cycle aborted:", err.message)
    console.error("\n— last results —")
    for (const r of results) {
      console.error(`  ${r.pass ? "✓" : "✗"} step ${r.step}: ${r.name}`)
    }
    try {
      await cleanup()
    } catch {
      // best-effort
    }
    process.exit(1)
  })

// Suppress unused-import lints when iterating.
void episodeIntelligenceRecords
void episodePerformanceSignals
void collaborationRooms
void studioSessions
