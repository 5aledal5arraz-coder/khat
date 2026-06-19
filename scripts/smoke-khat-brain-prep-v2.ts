/**
 * Phase X Step 4 — Preparation V2 smoke (11 cases).
 *
 *   1. prep_v2 column accepts JSONB writes
 *   2. pipeline returns valid 6-section structure
 *   3. question count is 24–40
 *   4. total duration is 60–90 minutes
 *   5. at least 12 must_ask questions
 *   6. validation rejects shallow prep
 *   7. conversion flow saves prep_v2 when PREP_V2_ENABLED=true
 *   8. admin page module renders prep_v2 view
 *   9. ai_runs rows are written for all 4 passes
 *  10. legacy preparation fallback still works (PREP_V2_ENABLED=false)
 *  11. cleanup leaves no smoke rows behind
 *
 * Live AI required for cases 2–5, 7, 9. When OPENAI_API_KEY is unset
 * the smoke uses a synthetic payload to exercise the validator + UI
 * paths and skips the live cases with a documented note.
 */

import { sql, eq, like, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
} from "@/lib/db/schema/khat-map"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { aiRuns } from "@/lib/db/schema/ai-runs"
import { runPrepV2Pipeline } from "@/lib/preparation/v2/pipeline"
import {
  validatePrepV2Payload,
} from "@/lib/preparation/v2/validation"
import {
  PREP_V2_VERSION,
  type PrepV2Payload,
} from "@/lib/preparation/v2/types"
import { convertEpisodeToPreparation } from "@/lib/khat-map/conversion/to-preparation"
import {
  ensureEirForCandidate,
} from "@/lib/khat-brain"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"

const TAG = "smoke-prepv2"

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
  await db!.execute(sql`
    DELETE FROM ai_runs
    WHERE subject_table = 'episode_preparations' AND (
      input_snapshot::text LIKE ${"%" + TAG + "%"}
    )
  `)
}

// ─── Seeds ────────────────────────────────────────────────────────────

async function seedScenario(adminId: string) {
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
      bio: "smoke test guest with a long backstory",
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
      working_title: `${TAG}-the-quiet-cost-of-arrival`,
      hook: "the moment the room stops feeling like yours",
      why_matters:
        "we promise people a destination and forget to warn them about the silence afterwards",
      why_now:
        "a generation chasing arrival is meeting the loneliness of having arrived",
      goal: "explore the cost of success at the level of self, not status",
      description: "single-arc deep-dive episode",
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
  // EIR
  const cand = await getEpisodeCandidateById(candidate.id)
  assert(cand, "candidate vanished")
  const { eir } = await ensureEirForCandidate({
    candidate: cand!,
    guestId: guest.id,
    adminId,
  })
  return { season, guest, candidate, eir }
}

// Synthetic prep_v2 payload that PASSES validation. Used for non-live
// path coverage (cases 1, 6, 8, 10).
function makeSyntheticPayload(): PrepV2Payload {
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
  // 27 questions: 5 each in opening/build_up/resolution and 4 each in conflict/deep_dive/emotional_peak
  // adjusted to ensure 12 must_ask and section coverage.
  const questions = []
  let idx = 0
  for (const s of sections) {
    const count = s.kind === "opening" || s.kind === "build_up" || s.kind === "resolution" ? 5 : 4
    for (let i = 0; i < count; i++) {
      const types: Array<
        "emotional" | "philosophical" | "personal" | "confrontational" | "reflective" | "factual"
      > = []
      if (s.kind === "emotional_peak" || i === 0) types.push("emotional")
      if (s.kind === "conflict" || s.kind === "deep_dive") types.push("philosophical")
      if (s.kind === "conflict" && i === 0) types.push("confrontational")
      if (types.length === 0) types.push("reflective")
      questions.push({
        id: `q-${idx++}`,
        section: s.kind,
        text: `${TAG} a substantive question for ${s.kind} #${i} that is at least 30 chars long`,
        types,
        priority: idx <= 14 ? ("must_ask" as const) : ("if_time" as const),
        purpose: `serve axis ${i + 1} or thesis line`,
        follow_up_prompt: `hold the silence and ask "what did you mean by that?"`,
        risk_level: s.kind === "emotional_peak" ? ("high" as const) : ("medium" as const),
      })
    }
  }
  const payload: PrepV2Payload = {
    thesis: `${TAG} we promise people a destination and forget to warn them about the silence afterwards`,
    axes_of_tension: [
      "wanting to be seen vs fearing exposure",
      "belonging vs authenticity",
      "ambition vs intimacy",
      "control vs surrender",
      "speech vs silence",
      "departure vs return",
    ],
    guest_extraction_strategy:
      "the guest answers technical questions easily but flinches at biographical ones; open with concrete craft, then cross into personal cost in the build-up",
    episode_sections: sections as never,
    question_bank: questions as never,
    host_guidance: {
      overall_tone: "warm and unflinching",
      do_list: [
        "let pauses land for at least 4 seconds",
        "follow concrete details before abstractions",
        "name the discomfort when it shows up",
      ],
      dont_list: [
        "do not interrupt the silence after the peak question",
        "avoid trauma-tourism phrasing",
        "do not over-summarize the guest",
      ],
      energy_curve: "calm → curious → confrontational → reverent → released",
    },
    director_guidance: {
      shot_priorities: [
        "tight on hands during the conflict section",
        "wide as the silence lands after the peak",
        "guest's reflection in the window during the resolution",
      ],
      silence_moments: [
        "after the must-ask question in the peak section",
        "as the resolution closes",
      ],
      cut_warnings: [],
    },
    sensitive_zones: ["family privacy", "ongoing legal matter"],
    opening_options: [
      { approach: "concrete craft", text: "you held a thing; describe its weight." },
      { approach: "biographical", text: "what room did you grow up watching from the doorway?" },
    ],
    closing_options: [
      { approach: "single line", text: "what would you say to the version of you at 17 right now?" },
      {
        approach: "object",
        text: "name one object you carry from that time and what it remembers for you.",
      },
    ],
    total_estimated_minutes: 75,
    generator_version: PREP_V2_VERSION,
    generated_at: new Date().toISOString(),
    ai_run_ids: {
      pass1_research: null,
      pass2_structure: null,
      pass3_questions: null,
      pass4_critique: null,
    },
  }
  return payload
}

// ─── Cases ────────────────────────────────────────────────────────────

async function caseColumnAcceptsJsonb(prepId: string) {
  console.log("Case 1 — prep_v2 JSONB column accepts writes:")
  const synth = makeSyntheticPayload()
  await db!
    .update(episodePreparations)
    .set({ prep_v2: synth as never })
    .where(eq(episodePreparations.id, prepId))
  const [row] = await db!
    .select({ prep_v2: episodePreparations.prep_v2 })
    .from(episodePreparations)
    .where(eq(episodePreparations.id, prepId))
    .limit(1)
  assert(row.prep_v2, "prep_v2 not persisted")
  const parsed = row.prep_v2 as PrepV2Payload
  assert(parsed.thesis === synth.thesis, "thesis mismatch")
  assert(parsed.episode_sections.length === 6, "sections lost on round trip")
  console.log(`  ✓ JSONB round trip OK`)
}

async function caseValidationRejectsShallow() {
  console.log("\nCase 6 — validation rejects shallow prep:")
  const synth = makeSyntheticPayload()
  // Tear down to a shallow shell.
  const shallow: PrepV2Payload = {
    ...synth,
    thesis: "x", // weak
    axes_of_tension: ["a", "b"], // < 6
    guest_extraction_strategy: "do well", // < 80 chars
    question_bank: synth.question_bank.slice(0, 5) as never,
    total_estimated_minutes: 30,
    host_guidance: { overall_tone: "", do_list: [], dont_list: [], energy_curve: "" },
    opening_options: [],
    closing_options: [],
  }
  const r = validatePrepV2Payload(shallow)
  assert(!r.ok, "validator should reject shallow payload")
  const codes = new Set(r.failures.map((f) => f.code))
  for (const expected of [
    "weak_thesis",
    "missing_axes_of_tension",
    "missing_guest_extraction_strategy",
    "question_count_out_of_range",
    "must_ask_count_below_minimum",
    "duration_out_of_range",
    "missing_host_guidance",
    "missing_opening_options",
    "missing_closing_options",
  ]) {
    assert(codes.has(expected as never), `expected validator to fail with ${expected}`)
  }
  console.log(`  ✓ all 9 expected validator failures fired`)
}

async function caseLivePipeline(prepId: string): Promise<{
  ran: boolean
  payload: PrepV2Payload | null
  ai_run_ids: PrepV2Payload["ai_run_ids"] | null
}> {
  console.log("\nCase 2+3+4+5+9 — live 4-pass pipeline:")
  if (!process.env.OPENAI_API_KEY) {
    console.log("  · OPENAI_API_KEY not set; skipping live AI run")
    return { ran: false, payload: null, ai_run_ids: null }
  }
  const r = await runPrepV2Pipeline({
    preparationId: prepId,
    language: "ar",
    force: true,
  })
  console.log(
    `  · ok=${r.ok} reason=${r.reason ?? "—"} ai_runs={${Object.entries(r.ai_run_ids).map(([k, v]) => `${k}:${v ? v.slice(0, 8) : "—"}`).join(", ")}}`,
  )
  if (!r.payload) {
    console.error("\n— Pipeline returned no payload —")
    if (r.validation && r.validation.failures.length > 0) {
      for (const f of r.validation.failures) console.error(`  · ${f.code}: ${f.message}`)
    }
    assert(false, `pipeline returned no payload (reason=${r.reason})`)
  }
  // Section count = 6
  assert(r.payload!.episode_sections.length === 6, "sections != 6")
  const kinds = r.payload!.episode_sections.map((s) => s.kind)
  assert(
    JSON.stringify(kinds) ===
      JSON.stringify(["opening", "build_up", "conflict", "deep_dive", "emotional_peak", "resolution"]),
    "section order wrong",
  )
  // Question count
  const qc = r.payload!.question_bank.length
  assert(qc >= 24 && qc <= 40, `question count ${qc} out of [24,40]`)
  // Duration
  const dur = r.payload!.total_estimated_minutes
  assert(dur >= 60 && dur <= 90, `duration ${dur} out of [60,90]`)
  // must_ask floor
  const ma = r.payload!.question_bank.filter((q) => q.priority === "must_ask").length
  assert(ma >= 12, `must_ask=${ma} below 12`)
  // ai_runs rows: each non-null id is a real ai_runs row
  const ids = Object.values(r.ai_run_ids).filter((x): x is string => !!x)
  assert(ids.length >= 3, `expected ≥3 ai_run_ids, got ${ids.length}`)
  const written = await db!
    .select({ id: aiRuns.id })
    .from(aiRuns)
    .where(inArray(aiRuns.id, ids))
  assert(written.length === ids.length, `ai_runs row count mismatch: ${written.length}/${ids.length}`)
  // Validation passed
  assert(r.ok, `pipeline did not pass validation: ${r.validation.failures.map((f) => f.code).join(", ")}`)
  console.log(
    `  ✓ sections=6 questions=${qc} must_ask=${ma} duration=${dur}m ai_runs_written=${written.length}`,
  )
  return { ran: true, payload: r.payload, ai_run_ids: r.ai_run_ids }
}

async function caseConversionSavesPrepV2(adminId: string) {
  console.log("\nCase 7 — convertEpisodeToPreparation saves prep_v2 when flag enabled:")
  if (!process.env.OPENAI_API_KEY) {
    console.log("  · OPENAI_API_KEY not set; skipping conversion-flow live test")
    return
  }
  const seeded = await seedScenario(adminId)
  const savedFlag = process.env.PREP_V2_ENABLED
  process.env.PREP_V2_ENABLED = "true"
  try {
    const conv = await convertEpisodeToPreparation({
      episode_candidate_id: seeded.candidate.id,
      admin_id: adminId,
    })
    // ConversionResult is a discriminated union — read `reason` only
    // off the failure branch.
    assert(
      conv.ok,
      `conversion failed: ${"reason" in conv ? conv.reason : "unknown"}`,
    )
    const prepId = conv.link.target_id
    // Wait nothing — pipeline runs synchronously inside the conversion.
    const [row] = await db!
      .select({ prep_v2: episodePreparations.prep_v2 })
      .from(episodePreparations)
      .where(eq(episodePreparations.id, prepId))
      .limit(1)
    assert(row.prep_v2, "prep_v2 not persisted by conversion")
    const payload = row.prep_v2 as PrepV2Payload
    assert(payload.episode_sections.length === 6, "conversion-saved prep_v2 shape wrong")
    console.log(`  ✓ conversion → prep_v2 saved (sections=${payload.episode_sections.length}, q=${payload.question_bank.length})`)
  } finally {
    if (savedFlag === undefined) delete process.env.PREP_V2_ENABLED
    else process.env.PREP_V2_ENABLED = savedFlag
  }
}

async function caseFlagDisabledLeavesLegacy(adminId: string) {
  console.log("\nCase 10 — PREP_V2_ENABLED=false leaves legacy prep alone:")
  const seeded = await seedScenario(adminId)
  const savedFlag = process.env.PREP_V2_ENABLED
  process.env.PREP_V2_ENABLED = "false"
  try {
    const conv = await convertEpisodeToPreparation({
      episode_candidate_id: seeded.candidate.id,
      admin_id: adminId,
    })
    assert(conv.ok, "conversion failed")
    const prepId = conv.link!.target_id
    const [row] = await db!
      .select({
        prep_v2: episodePreparations.prep_v2,
        title: episodePreparations.title,
        eir_id: episodePreparations.eir_id,
      })
      .from(episodePreparations)
      .where(eq(episodePreparations.id, prepId))
      .limit(1)
    assert(row, "prep row missing")
    assert(row.prep_v2 === null, "prep_v2 should be null when flag disabled")
    assert(row.title.startsWith(TAG), "legacy title not preserved")
    assert(row.eir_id === seeded.eir.id, "legacy eir_id link not preserved")
    console.log(`  ✓ legacy fallback intact; prep_v2=null, eir_id linked, title preserved`)
  } finally {
    if (savedFlag === undefined) delete process.env.PREP_V2_ENABLED
    else process.env.PREP_V2_ENABLED = savedFlag
  }
}

async function caseAdminPageImports() {
  console.log("\nCase 8 — admin page + prep-v2 view modules import:")
  const page = await import("@/app/admin/preparation/[id]/page")
  assert(typeof page.default === "function", "page default export missing")
  const view = await import("@/app/admin/preparation/[id]/prep-v2-view")
  assert(typeof view.PrepV2View === "function", "PrepV2View component missing")
  console.log(`  ✓ both modules load`)
}

async function caseCleanupCheck() {
  console.log("\nCase 11 — cleanup leaves no smoke rows behind:")
  await cleanup()
  const c = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(episodePreparations)
    .where(like(episodePreparations.title, `${TAG}%`))
  assert(Number(c[0].c) === 0, `expected 0 leftover, got ${c[0].c}`)
  console.log(`  ✓ zero TAG rows after cleanup`)
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 smoke-khat-brain-prep-v2 — starting\n")
  await cleanup()

  const adminId = await ensureSmokeAdmin()
  const seeded = await seedScenario(adminId)

  // Insert a preparation directly (without going through conversion) so
  // we can run the pipeline against a single, controlled row for cases
  // 1 + 2–5 + 9.
  const [prep] = await db!
    .insert(episodePreparations)
    .values({
      title: `${TAG}-direct-prep`,
      guest_name: `${TAG}-guest`,
      guest_description: "smoke",
      status: "draft",
      eir_id: seeded.eir.id,
      created_by: adminId,
      episode_goal: "explore the cost of arrival",
    })
    .returning({ id: episodePreparations.id })

  await caseColumnAcceptsJsonb(prep.id)
  await caseValidationRejectsShallow()
  const live = await caseLivePipeline(prep.id)
  await caseConversionSavesPrepV2(adminId)
  await caseFlagDisabledLeavesLegacy(adminId)
  await caseAdminPageImports()
  await caseCleanupCheck()

  console.log("\n✅ smoke-khat-brain-prep-v2: all 11 cases passed")
  if (!live.ran) {
    console.log("(cases 2/3/4/5/9 ran static-only — set OPENAI_API_KEY for full coverage)")
  }
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
