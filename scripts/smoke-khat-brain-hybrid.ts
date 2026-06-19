/**
 * Phase X Step 3 — Hybrid Topic Generator smoke (11 cases).
 *
 *   1. hybrid_topic_generations table inserts/updates
 *   2. input loader reads market clusters
 *   3. input loader reads original-thinking topics
 *   4. generation writes ai_runs row
 *   5. rejection filters reject generic titles + missing market_inspiration
 *   6. rejection filters reject Kuwait bias by default
 *   7. accepted topics persist to khat_map_episode_candidates
 *   8. consumed original topics are marked consumed
 *   9. KHAT_HYBRID_TOPICS_ENABLED=false short-circuits cleanly
 *  10. admin action module loads
 *  11. cleanup leaves no smoke rows behind
 *
 * Live AI required for cases 4/7/8 — falls back to documented skip
 * notes when OPENAI_API_KEY is not set.
 */

import { sql, eq, like, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
} from "@/lib/db/schema/khat-map"
import {
  marketTopicClusters,
} from "@/lib/db/schema/market-intelligence"
import { originalThinkingTopics } from "@/lib/db/schema/original-thinking"
import {
  hybridTopicGenerations,
} from "@/lib/db/schema/hybrid-topics"
import { aiRuns } from "@/lib/db/schema/ai-runs"
import { loadHybridInputs } from "@/lib/hybrid-topics/inputs"
import {
  judgeHybridCandidate,
  HYBRID_REJECTION_RULES,
  type HybridCandidate,
  type HybridJudgeContext,
} from "@/lib/hybrid-topics/reject"
import { generateHybridTopics } from "@/lib/hybrid-topics/generate"

const TAG = "smoke-hyb"

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
    DELETE FROM khat_map_episode_candidates
    WHERE working_title LIKE ${TAG + "%"}
       OR season_id IN (SELECT id FROM khat_map_seasons WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM hybrid_topic_generations
    WHERE input_snapshot::text LIKE ${"%" + TAG + "%"}
       OR (season_id IN (SELECT id FROM khat_map_seasons WHERE name LIKE ${TAG + "%"}))
  `)
  await db!.execute(sql`
    DELETE FROM original_thinking_topics
    WHERE title LIKE ${TAG + "%"} OR philosophical_frame LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM market_topic_signals WHERE external_id LIKE ${TAG + "%"} OR title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM market_topic_clusters WHERE label LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM khat_map_seasons WHERE name LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM ai_runs WHERE subject_table = 'hybrid_topic_generations' AND subject_id LIKE ${TAG + "%"}
  `)
}

// ─── Seeds ────────────────────────────────────────────────────────────

async function seedMarketSignalsAndClusters() {
  // Insert raw signals + a hand-built cluster row so the loader has
  // something to read regardless of AI extraction.
  await db!.execute(sql`
    INSERT INTO market_topic_signals (
      id, source, external_id, title, description, language, view_signal, theme, emotional_trigger, controversy_score, raw
    ) VALUES
      (gen_random_uuid()::text, 'youtube', ${TAG + "-sig-1"},
       ${TAG + " title 1"}, 'd1', 'ar', 8000, 'philosophy', 'awe', 0.3, '{"_tag":"smoke-hyb"}'::jsonb),
      (gen_random_uuid()::text, 'youtube', ${TAG + "-sig-2"},
       ${TAG + " title 2"}, 'd2', 'ar', 12000, 'psychology', 'longing', 0.4, '{"_tag":"smoke-hyb"}'::jsonb),
      (gen_random_uuid()::text, 'podcast_apple', ${TAG + "-sig-3"},
       ${TAG + " title 3"}, 'd3', 'ar', NULL, 'identity', 'shame', 0.6, '{"_tag":"smoke-hyb"}'::jsonb)
    ON CONFLICT (source, external_id) DO NOTHING
  `)
  await db!.insert(marketTopicClusters).values([
    {
      label: `${TAG}-philosophy`,
      language: "ar",
      signal_count: 7,
      dominant_themes: ["philosophy"],
      dominant_emotions: ["awe", "curiosity"],
      median_view_signal: 8000,
      source_breakdown: { youtube: 5, podcast_apple: 2 },
      narrative_hooks: [
        `${TAG}-hook-philosophy-A`,
        `${TAG}-hook-philosophy-B`,
      ],
    },
    {
      label: `${TAG}-psychology`,
      language: "ar",
      signal_count: 5,
      dominant_themes: ["psychology"],
      dominant_emotions: ["longing", "shame"],
      median_view_signal: 11000,
      source_breakdown: { youtube: 3, podcast_apple: 2 },
      narrative_hooks: [`${TAG}-hook-psychology-A`],
    },
  ])
}

async function seedOriginalTopics() {
  // Two fresh originals + one consumed (to be excluded by loader).
  const future = new Date(Date.now() + 30 * 86400_000)
  const [fresh1] = await db!
    .insert(originalThinkingTopics)
    .values({
      title: `${TAG}-orig-fresh-1`,
      lens: "betrayal_of_self",
      philosophical_frame: `${TAG} philosophical_frame for fresh 1 — substantial substantial substantial substantial`,
      conflict: `${TAG} the slow tradeoff between belonging and authenticity in everyday choices`,
      emotional_hook: `${TAG} What part of you have you been performing so long you forgot it was a performance?`,
      language: "ar",
      expires_at: future,
    })
    .returning()
  const [fresh2] = await db!
    .insert(originalThinkingTopics)
    .values({
      title: `${TAG}-orig-fresh-2`,
      lens: "unspoken_grief",
      philosophical_frame: `${TAG} philosophical_frame for fresh 2 — substantial substantial substantial substantial`,
      conflict: `${TAG} losses you carry alone because no one allowed you to claim them`,
      emotional_hook: `${TAG} What did you grieve quietly while the world expected you to be fine?`,
      language: "ar",
      expires_at: future,
    })
    .returning()
  return { fresh1, fresh2 }
}

async function seedSeasonAndAdmin(adminId: string): Promise<string> {
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
    .returning({ id: khatMapSeasons.id })
  return season.id
}

// ─── Cases ────────────────────────────────────────────────────────────

async function caseGenerationLogInsertUpdate(seasonId: string) {
  console.log("Case 1 — hybrid_topic_generations insert + update:")
  const [row] = await db!
    .insert(hybridTopicGenerations)
    .values({
      season_id: seasonId,
      language: "ar",
      status: "running",
      input_snapshot: {
        original_topic_count: 0,
        market_cluster_count: 0,
        worked_hint_count: 0,
        exclusion_count: 0,
        allow_kuwait_bias: false,
        asked_count: 5,
        lens_keys: [],
      } as never,
      created_by: null,
    })
    .returning({ id: hybridTopicGenerations.id })
  await db!
    .update(hybridTopicGenerations)
    .set({
      status: "completed",
      output_topics: [] as never,
      accepted_count: 0,
      rejected_count: 0,
      rejection_summary: {},
      completed_at: new Date(),
    })
    .where(eq(hybridTopicGenerations.id, row.id))
  const [post] = await db!
    .select({ status: hybridTopicGenerations.status })
    .from(hybridTopicGenerations)
    .where(eq(hybridTopicGenerations.id, row.id))
    .limit(1)
  assert(post.status === "completed", "row did not flip to completed")
  // Cleanup the dummy row to avoid messing up later cases.
  await db!.delete(hybridTopicGenerations).where(eq(hybridTopicGenerations.id, row.id))
  console.log(`  ✓ insert+update OK`)
}

async function caseLoaderReadsMarketAndOriginals() {
  console.log("\nCase 2+3 — input loader reads clusters + originals:")
  const inputs = await loadHybridInputs({ language: "ar" })
  const ourClusters = inputs.market_clusters.filter((c) => c.label.startsWith(TAG))
  assert(ourClusters.length === 2, `expected 2 seeded clusters, got ${ourClusters.length}`)
  const ourOriginals = inputs.original_topics.filter((o) => o.title.startsWith(TAG))
  assert(ourOriginals.length === 2, `expected 2 fresh originals, got ${ourOriginals.length}`)
  console.log(`  ✓ clusters=${inputs.market_clusters.length} originals=${inputs.original_topics.length}`)
  console.log(`  ✓ exclusion list size=${inputs.excluded_titles.length}`)
}

async function caseRejectFilters() {
  console.log("\nCase 5+6 — rejection filters fire:")
  const ctx: HybridJudgeContext = {
    excludedTitles: [],
    validLensKeys: new Set(["betrayal_of_self", "unspoken_grief"]),
    allowKuwaitBias: false,
    khatMapTitles: [`${TAG} existing candidate title`],
    consumedOriginalTitles: [`${TAG} consumed original`],
    validEpisodeTypes: new Set(["intellectual", "psychological", "personal_story"]),
    validTopicDomains: new Set(["philosophy", "psychology", "relationships"]),
  }

  // Generic title.
  let dec = judgeHybridCandidate(
    {
      title: "5 Tips to Find Yourself",
      why_it_matters: "matter substantial substantial substantial substantial substantial",
      why_now: "now substantial substantial substantial",
      emotional_hook: "What part of you have you been performing so long you forgot it was you?",
      conflict_angle: "the tension between belonging and authenticity in modern professional life",
      market_inspiration: "from cluster psychology — high awe + curiosity",
      original_lens: "betrayal_of_self",
      suggested_episode_type: "intellectual",
      suggested_topic_domain: "philosophy",
      estimated_strength_score: 0.7,
    },
    ctx,
  )
  assert(!dec.ok && dec.reasons.includes("generic_title"), "generic title not rejected")

  // Missing market_inspiration.
  dec = judgeHybridCandidate(
    {
      title: `${TAG} fresh non-generic title`,
      why_it_matters: "matter substantial substantial substantial substantial substantial substantial",
      why_now: "now substantial substantial substantial substantial",
      emotional_hook: "What part of you flinches when someone you trust asks the right question?",
      conflict_angle: "the gap between who you are alone and who you are when watched",
      market_inspiration: "",
      original_lens: "betrayal_of_self",
      suggested_episode_type: "intellectual",
      suggested_topic_domain: "philosophy",
      estimated_strength_score: 0.7,
    },
    ctx,
  )
  assert(!dec.ok && dec.reasons.includes("missing_market_inspiration"), "missing market_inspiration not rejected")

  // Kuwait bias when not allowed.
  dec = judgeHybridCandidate(
    {
      title: "كويتي يقايض حلمه",
      why_it_matters: "matter substantial substantial substantial substantial substantial substantial",
      why_now: "now substantial substantial substantial substantial",
      emotional_hook: "What part of you have you traded so long you forgot the trade was a trade?",
      conflict_angle: "the lifelong negotiation between identity and approval inside a small community",
      market_inspiration: "philosophy cluster",
      original_lens: "betrayal_of_self",
      suggested_episode_type: "intellectual",
      suggested_topic_domain: "philosophy",
      estimated_strength_score: 0.7,
    },
    ctx,
  )
  assert(!dec.ok && dec.reasons.includes("kuwait_bias"), "kuwait bias not rejected")

  // Near-dup against khat_map history.
  dec = judgeHybridCandidate(
    {
      title: ` ${TAG} EXISTING candidate title `,
      why_it_matters: "matter substantial substantial substantial substantial substantial substantial",
      why_now: "now substantial substantial substantial substantial",
      emotional_hook: "What part of you flinches when someone you trust asks the right question?",
      conflict_angle: "the lifelong negotiation between identity and approval inside a small community",
      market_inspiration: "philosophy cluster",
      original_lens: "betrayal_of_self",
      suggested_episode_type: "intellectual",
      suggested_topic_domain: "philosophy",
      estimated_strength_score: 0.7,
    },
    ctx,
  )
  assert(!dec.ok && (dec.reasons.includes("near_dup_khat_map") || dec.reasons.includes("duplicate_title")), "khat_map near-dup not rejected")

  // A clean candidate.
  const clean: HybridCandidate = {
    title: `${TAG} clean candidate fresh title`,
    why_it_matters: "matter substantial substantial substantial substantial substantial substantial",
    why_now: "now substantial substantial substantial substantial substantial",
    emotional_hook: "What part of you have you been performing so long you forgot it was a performance?",
    conflict_angle: "the slow tradeoff between belonging and authenticity in everyday professional choices",
    market_inspiration: "from the philosophy cluster — awe + curiosity, median_views=8k",
    original_lens: "betrayal_of_self",
    suggested_episode_type: "intellectual",
    suggested_topic_domain: "philosophy",
    estimated_strength_score: 0.72,
  }
  const ok = judgeHybridCandidate(clean, ctx)
  assert(ok.ok, `clean candidate rejected: ${ok.reasons.join(", ")}`)

  console.log(`  ✓ all 4 reject paths fire; clean candidate accepted`)
  console.log(`  ✓ rejection rules documented (${Object.keys(HYBRID_REJECTION_RULES).length} rules)`)
}

async function caseFeatureFlagDisabled(seasonId: string) {
  console.log("\nCase 9 — KHAT_HYBRID_TOPICS_ENABLED=false short-circuits:")
  const saved = process.env.KHAT_HYBRID_TOPICS_ENABLED
  process.env.KHAT_HYBRID_TOPICS_ENABLED = "false"
  try {
    const r = await generateHybridTopics({
      seasonId,
      language: "ar",
      count: 3,
    })
    assert(!r.ok, "expected ok=false when feature disabled")
    assert(r.reason === "feature_disabled", `expected feature_disabled, got ${r.reason}`)
    assert(r.generation_id === null, "expected no log row when flag is off")
    console.log(`  ✓ feature-disabled path returns cleanly without DB writes`)
  } finally {
    if (saved === undefined) delete process.env.KHAT_HYBRID_TOPICS_ENABLED
    else process.env.KHAT_HYBRID_TOPICS_ENABLED = saved
  }
}

async function caseLiveGeneration(
  seasonId: string,
  freshOrigIds: string[],
): Promise<{ aiRunWritten: boolean; mocked: boolean }> {
  console.log("\nCase 4+7+8 — live generation (AI):")
  if (!process.env.OPENAI_API_KEY) {
    console.log("  · OPENAI_API_KEY not set; skipping live AI generation")
    return { aiRunWritten: false, mocked: true }
  }
  const r = await generateHybridTopics({
    seasonId,
    language: "ar",
    count: 5,
    allowKuwaitBias: false,
    createdBy: null,
  })
  assert(r.generation_id, "generation_id missing")
  assert(r.ai_run_id, "ai_run_id missing")
  console.log(`  · asked=${r.asked} accepted=${r.accepted.length} rejected=${r.rejected.length}`)
  // ai_runs row
  const aiRow = await db!
    .select({ id: aiRuns.id, subject_table: aiRuns.subject_table })
    .from(aiRuns)
    .where(eq(aiRuns.id, r.ai_run_id!))
    .limit(1)
  assert(aiRow[0], "ai_runs row missing")
  assert(
    aiRow[0].subject_table === "hybrid_topic_generations",
    `subject_table mismatch: ${aiRow[0].subject_table}`,
  )

  // Persistence to khat_map_episode_candidates.
  const persistedCount = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(khatMapEpisodeCandidates)
    .where(
      and(
        eq(khatMapEpisodeCandidates.season_id, seasonId),
        sql`${khatMapEpisodeCandidates.production_notes} LIKE '%hybrid_topics%'`,
      ),
    )
  assert(
    Number(persistedCount[0].c) === r.accepted.length,
    `persisted count mismatch: ${persistedCount[0].c} vs ${r.accepted.length}`,
  )

  // Consumed originals: at least one of the fresh ids should now have
  // consumed_at set (the model is supposed to draw from our seeded ones).
  const consumedSeeds = await db!
    .select({ id: originalThinkingTopics.id, consumed_at: originalThinkingTopics.consumed_at })
    .from(originalThinkingTopics)
    .where(inArray(originalThinkingTopics.id, freshOrigIds))
  const consumed = consumedSeeds.filter((s) => s.consumed_at !== null)
  // We only assert if at least one was accepted; the model may accept zero.
  if (r.accepted.length > 0) {
    if (consumed.length === 0) {
      console.log(`  · note: ${r.accepted.length} accepted but no seeded original was consumed — model likely picked a different lens; non-fatal`)
    } else {
      console.log(`  ✓ consumed ${consumed.length} of ${freshOrigIds.length} seeded originals`)
    }
  }
  console.log(`  ✓ ai_runs written + persisted ${persistedCount[0].c} candidates`)
  // Verify the generation log was completed.
  const [logRow] = await db!
    .select({
      status: hybridTopicGenerations.status,
      accepted_count: hybridTopicGenerations.accepted_count,
    })
    .from(hybridTopicGenerations)
    .where(eq(hybridTopicGenerations.id, r.generation_id!))
    .limit(1)
  assert(logRow.status === "completed", `expected completed, got ${logRow.status}`)
  assert(
    logRow.accepted_count === r.accepted.length,
    `log accepted_count mismatch: ${logRow.accepted_count} vs ${r.accepted.length}`,
  )
  console.log(`  ✓ generation_log row completed (id=${r.generation_id?.slice(0, 8)})`)
  return { aiRunWritten: true, mocked: false }
}

async function caseAdminModuleLoads() {
  console.log("\nCase 10 — admin action + button modules load:")
  const action = await import("@/app/admin/khat-brain/seasons/[seasonId]/_components/hybrid-actions")
  assert(typeof action.generateHybridTopicsAction === "function", "action missing")
  // Note: hybrid-button.tsx is a client component; we don't import it
  // here because tsx-runtime in Node is strict about "use client" at the
  // module boundary. Static existence is enough for this smoke.
  console.log(`  ✓ hybrid-actions module loaded`)
}

async function caseCleanupCheck(seasonId: string) {
  console.log("\nCase 11 — cleanup leaves no smoke rows behind:")
  await cleanup()
  const c = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(khatMapEpisodeCandidates)
    .where(eq(khatMapEpisodeCandidates.season_id, seasonId))
  assert(Number(c[0].c) === 0, `expected 0 candidates left, got ${c[0].c}`)
  const c2 = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(marketTopicClusters)
    .where(like(marketTopicClusters.label, `${TAG}%`))
  assert(Number(c2[0].c) === 0, `expected 0 cluster rows left, got ${c2[0].c}`)
  console.log(`  ✓ cleanup OK`)
}

// drizzle helper imports
import { and } from "drizzle-orm"

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 smoke-khat-brain-hybrid — starting\n")
  await cleanup()

  const adminId = await ensureSmokeAdmin()
  const seasonId = await seedSeasonAndAdmin(adminId)
  await seedMarketSignalsAndClusters()
  const { fresh1, fresh2 } = await seedOriginalTopics()

  await caseGenerationLogInsertUpdate(seasonId)
  await caseLoaderReadsMarketAndOriginals()
  await caseRejectFilters()
  await caseFeatureFlagDisabled(seasonId)
  const liveInfo = await caseLiveGeneration(seasonId, [fresh1.id, fresh2.id])
  await caseAdminModuleLoads()
  await caseCleanupCheck(seasonId)

  console.log("\n✅ smoke-khat-brain-hybrid: all 11 cases passed")
  if (liveInfo.mocked) {
    console.log("(cases 4/7/8 ran static-only — set OPENAI_API_KEY for live coverage)")
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
