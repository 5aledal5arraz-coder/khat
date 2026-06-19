/**
 * Khat Brain Phase 5 — Studio consolidation completion smoke.
 *
 *   1. All 9 Studio kinds write through analysis-records repo
 *   2. All 9 Studio kinds read through analysis-records repo
 *   3. Legacy studio_* tables are gone (information_schema check)
 *   4. Studio session DELETE cascade clears consolidated rows
 *   5. Studio push regression — eir propagation still works
 *   6. prepareTranscript writes ai_runs rows (each chunk = one row)
 *   7. prepareTranscriptWithPositions writes ai_runs rows
 */

import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { studioSessions } from "@/lib/db/schema/studio"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import { aiRuns } from "@/lib/db/schema/ai-runs"
import { episodes } from "@/lib/db/schema/episodes"
import {
  getChaptersForSession,
  createChapters,
} from "@/lib/studio/chapters"
import { createClips, getClipsForSession } from "@/lib/studio/clips"
import {
  createDeepAnalysis,
  getDeepAnalysisForSession,
} from "@/lib/studio/deep-analysis"
import {
  createGuestIntelligence,
  getGuestIntelligenceForSession,
} from "@/lib/studio/guest-intelligence"
import { createTranscript, getTranscriptForSession } from "@/lib/studio/transcripts"
import { createAiOutput, getAiOutputForSession } from "@/lib/studio/ai-outputs"
import {
  createWebsitePackage,
  getWebsitePackageForSession,
} from "@/lib/studio/website-packages"
import { createAnalyzer, getAnalyzerForSession } from "@/lib/studio/analyzers"
import { appendPushLog } from "@/lib/studio-push-log"
import { deleteStudioSession } from "@/lib/studio/sessions"
import {
  prepareTranscript,
  prepareTranscriptWithPositions,
  getClient,
} from "@/lib/ai/client"
import {
  createEpisodeIntelligenceRecord,
  getEpisodeIntelligenceRecord,
  transitionEpisodePhase,
} from "@/lib/eir"

const TAG = "smoke-studio-done"

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

async function cleanup() {
  await db!.execute(sql`
    DELETE FROM studio_analysis_records WHERE studio_session_id IN
      (SELECT id::text FROM studio_sessions WHERE video_title LIKE ${TAG + "%"})
       OR studio_session_id LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM studio_sessions WHERE video_title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`DELETE FROM ai_runs WHERE subject_id LIKE ${TAG + "%"}`)
}

async function caseAllKindsViaServiceModules() {
  console.log("Case 1+2 — all 9 Studio kinds round-trip via service modules:")

  // Create a real studio_session row so eir resolution works.
  const [sess] = await db!
    .insert(studioSessions)
    .values({
      video_title: `${TAG}-session`,
      source: "test",
      status: "draft",
    })
    .returning({ id: studioSessions.id })
  const sid = sess.id

  // chapters
  const ch = await createChapters(sid, {
    status: "ready",
    chapters: [{ start_time: "00:00:00", title: "Intro" }],
    raw_openai_response: null,
    error_message: null,
  })
  assert(ch.success, "createChapters failed")
  assert((await getChaptersForSession(sid))?.chapters[0].title === "Intro", "chapters readback")

  // clips
  const cl = await createClips(sid, {
    status: "ready",
    clips: [
      {
        start_time: "00:01:00",
        end_time: "00:02:00",
        platform: "X",
        clip_title: "t",
        hook_text: "h",
        caption: "c",
        hashtags: [],
        description: "d",
        viral_hook: "v",
        why_it_works: "w",
      } as never,
    ],
    raw_openai_response: null,
    error_message: null,
  })
  assert(cl.success, "createClips failed")
  assert((await getClipsForSession(sid))?.clips.length === 1, "clips readback")

  // deep_analysis
  const da = await createDeepAnalysis(sid, {
    status: "ready",
    thesis: "phase 5 thesis",
    open_questions: ["?"],
  })
  assert(da.success, "createDeepAnalysis failed")
  assert((await getDeepAnalysisForSession(sid))?.thesis === "phase 5 thesis", "da readback")

  // guest_intelligence
  const gi = await createGuestIntelligence(sid, {
    status: "ready",
    detected_name: "G",
    confidence_score: 0.7,
  })
  assert(gi.success, "createGuestIntelligence failed")
  assert((await getGuestIntelligenceForSession(sid))?.detected_name === "G", "gi readback")

  // transcript
  const tr = await createTranscript(sid, "youtube_captions", "نص مقصير ولكن كافي للاختبار", "ar")
  assert(tr.success, "createTranscript failed")
  const trBack = await getTranscriptForSession(sid)
  assert((trBack?.transcript_clean.length ?? 0) > 0, "transcript readback")

  // ai_outputs
  const ai = await createAiOutput(sid, {
    model: "gpt-4o-mini",
    prompt_version: "v1",
    status: "ready",
    title_best: "Best",
    title_alternatives: ["Alt 1"],
    thumbnail_text_options: ["T"],
    youtube_description: "desc",
    seo_keywords: ["k"],
    hashtags: ["#h"],
    raw_openai_response: null,
    error_message: null,
  })
  assert(ai.success, "createAiOutput failed")
  assert((await getAiOutputForSession(sid))?.title_best === "Best", "ai_outputs readback")

  // website_package
  const wp = await createWebsitePackage(sid, {
    status: "ready",
    hero_summary: "hero",
    full_summary: "full",
    takeaways: ["t1"],
    quotes: [],
    resources: [],
    timestamps: [],
    linked_episode_id: null,
    raw_openai_response: null,
    error_message: null,
  })
  assert(wp.success, "createWebsitePackage failed")
  assert((await getWebsitePackageForSession(sid))?.hero_summary === "hero", "website_package readback")

  // analyzer
  const an = await createAnalyzer(sid, {
    status: "ready",
    data: { performance_score: 7.5 } as never,
    prompt_version: "v1",
    raw_openai_response: null,
    error_message: null,
  })
  assert(an.success, "createAnalyzer failed")
  const anBack = await getAnalyzerForSession(sid)
  assert(anBack?.status === "ready", "analyzer readback")

  // push_log (append-only)
  await appendPushLog({
    sessionId: sid,
    episodeId: "ep-test",
    episodeTitle: `${TAG}-episode`,
    pushedFields: ["title"],
    pushedAt: new Date().toISOString(),
  })

  // Verify every kind landed in studio_analysis_records.
  const kindsRows = await db!
    .select({ kind: studioAnalysisRecords.kind })
    .from(studioAnalysisRecords)
    .where(eq(studioAnalysisRecords.studio_session_id, sid))
  const kinds = new Set(kindsRows.map((r) => r.kind))
  for (const k of [
    "chapters",
    "clips",
    "deep_analysis",
    "guest_intelligence",
    "transcript",
    "ai_outputs",
    "website_package",
    "analyzer",
    "push_log",
  ] as const) {
    assert(kinds.has(k), `kind ${k} not in consolidated table`)
  }
  console.log(`  ✓ all 9 kinds round-trip via service modules`)
  console.log(`  ✓ ${kinds.size} kinds present in studio_analysis_records for session ${sid.slice(0, 8)}`)
  return sid
}

async function caseLegacyTablesGone() {
  console.log("\nCase 3 — legacy studio_* tables no longer exist:")
  const legacy = [
    "studio_transcripts",
    "studio_ai_outputs",
    "studio_chapters",
    "studio_clips",
    "studio_website_packages",
    "studio_analyzers",
    "studio_deep_analysis",
    "studio_guest_intelligence",
    "studio_push_log",
  ]
  const r = (await db!.execute(sql.raw(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY(ARRAY[
       ${legacy.map((t) => `'${t}'`).join(",")}
     ])
  `))) as unknown as { rows: Array<{ table_name: string }> }
  const found = r.rows.map((row) => row.table_name)
  assert(found.length === 0, `legacy tables still exist: ${found.join(", ")}`)
  console.log(`  ✓ all 9 legacy studio_* tables dropped`)
}

async function caseDeleteCascade(sid: string) {
  console.log("\nCase 4 — deleteStudioSession cascades to studio_analysis_records:")
  const before = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(studioAnalysisRecords)
    .where(eq(studioAnalysisRecords.studio_session_id, sid))
  assert((before[0]?.c ?? 0) >= 9, "expected 9+ rows before delete")

  const ok = await deleteStudioSession(sid)
  assert(ok, "deleteStudioSession returned false")

  const after = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(studioAnalysisRecords)
    .where(eq(studioAnalysisRecords.studio_session_id, sid))
  assert((after[0]?.c ?? 0) === 0, "rows survived session delete")
  console.log(`  ✓ session delete cleared ${before[0]?.c} consolidated rows`)
}

async function casePushRegression() {
  console.log("\nCase 5 — Studio push EIR propagation still works:")
  const eir = await createEpisodeIntelligenceRecord({
    working_title: `${TAG}-push-regression`,
    phase: "idea",
  })
  for (const p of [
    "guest_assigned",
    "approved",
    "researching",
    "prepared",
    "ready_to_record",
    "recording",
    "recorded",
    "producing",
  ] as const) {
    await transitionEpisodePhase({ eir_id: eir.id, to_phase: p, reason: "test" })
  }

  const [ep] = await db!
    .insert(episodes)
    .values({
      title: `${TAG}-ep`,
      slug: `phase5-${Date.now()}`,
      youtube_url: "https://youtu.be/Phase5Test1",
      duration_minutes: 60,
      release_date: "2026-01-01",
      status: "published",
      eir_id: eir.id,
    } as never)
    .returning({ id: episodes.id })

  const { syncEirOnStudioPushed, syncEirOnEpisodePublish } = await import("@/lib/khat-brain")
  await syncEirOnStudioPushed({ eirId: eir.id })
  await syncEirOnEpisodePublish({ eirId: eir.id })

  const final = await getEpisodeIntelligenceRecord(eir.id)
  assert(final?.phase === "published", `expected published, got ${final?.phase}`)
  console.log(`  ✓ EIR walked producing→published`)
  return ep.id
}

async function casePrepHelpersLog() {
  console.log("\nCase 6+7 — prep helpers write ai_runs:")
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = "stub-prep-fail"

  const baseline = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(aiRuns)
    .where(eq(aiRuns.subject_id, `${TAG}-prep`))

  // Both helpers short-circuit when text is short (no chunking → no AI call)
  // so we provide a long string to force chunking.
  const longTranscript = "نص بودكاست طويل ".repeat(2500) // > MAX_TRANSCRIPT_CHARS = 24000

  const openai = (() => {
    try { return getClient() } catch { return null }
  })()
  if (!openai) {
    // Even with a stub key the client constructs OK — only the network fails.
  }

  try {
    await prepareTranscript(openai!, longTranscript, {
      subjectTable: TAG,
      subjectId: `${TAG}-prep`,
    }).catch(() => {})

    await prepareTranscriptWithPositions(openai!, longTranscript, 3600, {
      subjectTable: TAG,
      subjectId: `${TAG}-prep`,
    }).catch(() => {})
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  }

  const after = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(aiRuns)
    .where(eq(aiRuns.subject_id, `${TAG}-prep`))
  const newRows = (after[0]?.c ?? 0) - (baseline[0]?.c ?? 0)
  assert(newRows >= 2, `expected at least 2 ai_runs rows from prep helpers, got ${newRows}`)
  console.log(`  ✓ ${newRows} ai_runs row(s) written by prep helpers`)
}

async function main() {
  await cleanup()
  console.log("🧪 smoke-khat-brain-studio-completion — starting\n")

  const sid = await caseAllKindsViaServiceModules()
  await caseLegacyTablesGone()
  await caseDeleteCascade(sid)
  await casePushRegression()
  await casePrepHelpersLog()

  await cleanup()
  console.log("\n✅ smoke-khat-brain-studio-completion: all 7 cases passed")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 smoke failed:", err)
    process.exit(1)
  })
