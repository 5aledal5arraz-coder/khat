/**
 * Khat Map — closed-loop performance smoke test.
 *
 * Exercises the full Idea → Episode → Performance → Scoring loop without
 * any LLM or YouTube calls. The composite scorer, ETL upserter,
 * domain-aggregation reader, performance-band multiplier, taste-weighted
 * recompute, and card explainability builder are all hit on real data.
 *
 * Cases:
 *   1. composePerformanceScore: views-only path
 *   2. composePerformanceScore: density-only path
 *   3. composePerformanceScore: missing signals renormalize
 *   4. performanceFactor: < min_episodes returns 1.0 (neutral)
 *   5. performanceFactor: high mean → top of band
 *   6. performanceFactor: low mean → bottom of band
 *   7. syncSeasonPerformance: writes one row per converted candidate
 *   8. syncSeasonPerformance: idempotent (second sync updates in place)
 *   9. getDomainPerformanceMap: aggregates by domain
 *  10. getPerformanceByCandidateIds: returns Map keyed on candidate
 *  11. recomputeTasteProfile: high-perf accept moves taste harder than
 *      low-perf accept (epsilon×perfWeight)
 *  12. buildCardExplainability: high-perf domain → "أداءً ممتازًا" reason
 *  13. buildCardExplainability: low-perf + soft_avoid → both risks listed
 *  14. buildCardExplainability: <3 episodes → expected_outcome is null
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/smoke-khat-map-performance.ts
 */

import { eq, sql as drizzleSql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapSeasonDecisions,
} from "@/lib/db/schema/khat-map"
import { episodes } from "@/lib/db/schema/episodes"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  composePerformanceScore,
  syncSeasonPerformance,
  getDomainPerformanceMap,
  getPerformanceByCandidateIds,
} from "@/lib/khat-map/performance"
import {
  performanceFactor,
  PERFORMANCE_BAND,
} from "@/lib/khat-map/scoring/weights"
import { recomputeTasteProfile } from "@/lib/khat-map/learning/taste"
import { buildCardExplainability } from "@/lib/khat-map/v2/explainability"
import type { ScoredCandidate } from "@/lib/khat-map/v2/types"
import { neutralAudienceFit } from "@/lib/khat-map/v2/regional-fit"
import type {
  KhatMapDomainPerformance,
  KhatMapUserTasteProfile,
} from "@/types/khat-map"

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    console.error("❌ Assertion failed:", message)
    process.exit(1)
  }
}

function approx(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps
}

const SEASON_PREFIX = "smoke-perf-"

async function cleanup() {
  // Delete in reverse FK order. Performance rows cascade with candidates.
  const seasons = await db!
    .select({ id: khatMapSeasons.id })
    .from(khatMapSeasons)
    .where(drizzleSql`name LIKE ${SEASON_PREFIX + "%"}`)
  for (const s of seasons) {
    await db!
      .delete(khatMapSeasonDecisions)
      .where(eq(khatMapSeasonDecisions.season_id, s.id))
    await db!
      .delete(khatMapEpisodeCandidates)
      .where(eq(khatMapEpisodeCandidates.season_id, s.id))
    await db!.delete(khatMapSeasons).where(eq(khatMapSeasons.id, s.id))
  }
  // Clean test admin + episodes/preps with our marker prefix
  await db!
    .delete(episodes)
    .where(drizzleSql`title LIKE ${SEASON_PREFIX + "%"}`)
}

async function main() {
  await cleanup()
  console.log("🧪 smoke-khat-map-performance — starting")

  // ─── 1–3. composePerformanceScore unit tests ───────────────────────────────
  // Views only — renormalized to full weight when no other signal exists.
  // 10k views = view_score 1.0, so the composite is 1.0.
  const viewsOnly = composePerformanceScore({
    view_count: 10_000,
    quote_count: 0,
    has_enrichment: false,
    has_chapters: false,
    has_clips: false,
    like_count: null,
    comment_count: null,
    retention_pct: null,
  })
  assert(
    viewsOnly !== null && viewsOnly > 0.95,
    `Case 1: views=ref renormalizes to ~1.0 (got ${viewsOnly})`,
  )
  console.log(`  ✓ Case 1 — composePerformanceScore views-only = ${viewsOnly?.toFixed(3)}`)

  const densityOnly = composePerformanceScore({
    view_count: null,
    quote_count: 8,
    has_enrichment: true,
    has_chapters: true,
    has_clips: true,
    like_count: null,
    comment_count: null,
    retention_pct: null,
  })
  assert(
    densityOnly !== null && densityOnly > 0.95,
    `Case 2: full-density only path should be near 1.0 (got ${densityOnly})`,
  )
  console.log(`  ✓ Case 2 — composePerformanceScore density-only = ${densityOnly?.toFixed(3)}`)

  // No views and no content signal → null (honest "not enough data").
  const noSignals = composePerformanceScore({
    view_count: null,
    quote_count: 0,
    has_enrichment: false,
    has_chapters: false,
    has_clips: false,
    like_count: null,
    comment_count: null,
    retention_pct: null,
  })
  assert(noSignals === null, `Case 3: zero-signal path should be null (got ${noSignals})`)
  console.log(`  ✓ Case 3 — zero-signal path returns null (honest)`)

  // ─── 4–6. performanceFactor band ───────────────────────────────────────────
  const fewEpisodes = performanceFactor(0.9, 1)
  assert(fewEpisodes === 1.0, `Case 4: < ${PERFORMANCE_BAND.min_episodes} episodes → 1.0 (got ${fewEpisodes})`)
  console.log(`  ✓ Case 4 — < min_episodes returns neutral 1.0`)

  const high = performanceFactor(1.0, 5)
  assert(
    approx(high, PERFORMANCE_BAND.max_factor),
    `Case 5: perf=1 → max_factor (got ${high})`,
  )
  console.log(`  ✓ Case 5 — perf=1.0 → ${high.toFixed(3)} (max)`)

  const low = performanceFactor(0.0, 5)
  assert(
    approx(low, PERFORMANCE_BAND.min_factor),
    `Case 6: perf=0 → min_factor (got ${low})`,
  )
  console.log(`  ✓ Case 6 — perf=0.0 → ${low.toFixed(3)} (min)`)

  // ─── Setup for 7–11: real season + candidates + episodes ───────────────────
  const adminId = await ensureSmokeAdmin()
  const seasonId = `${SEASON_PREFIX}${Date.now()}`
  await db!.insert(khatMapSeasons).values({
    id: seasonId,
    name: `${SEASON_PREFIX}season`,
    season_number: null,
    status: "planning",
    target_episode_count: 6,
    v2_mode: "guided",
    v2_episode_target: 6,
    editorial_controls: {} as never,
    created_by: adminId,
  })

  // 4 published episodes in the same domain — high performance band.
  // 4 published episodes in another domain — low performance band.
  const highDomain = "philosophy"
  const lowDomain = "money_career"
  const highCandIds: string[] = []
  const lowCandIds: string[] = []
  for (let i = 0; i < 4; i++) {
    highCandIds.push(
      await mkConvertedCandidate(seasonId, highDomain, 50_000 + i * 1000, 10),
    )
    lowCandIds.push(
      await mkConvertedCandidate(seasonId, lowDomain, 200 + i * 50, 0),
    )
  }
  // One accept decision per domain — enough signal for the recompute to
  // differentiate weight, but not so many that the squash function
  // saturates both to 1.0.
  await db!.insert(khatMapSeasonDecisions).values({
    season_id: seasonId,
    admin_id: adminId,
    batch_index: 1,
    kind: "accept",
    target: "pair",
    topic_candidate_id: highCandIds[0],
    guest_candidate_id: null,
    reason_category: null,
    reason_text: null,
  })
  await db!.insert(khatMapSeasonDecisions).values({
    season_id: seasonId,
    admin_id: adminId,
    batch_index: 1,
    kind: "accept",
    target: "pair",
    topic_candidate_id: lowCandIds[0],
    guest_candidate_id: null,
    reason_category: null,
    reason_text: null,
  })

  // ─── 7. syncSeasonPerformance writes a row per converted candidate ────────
  const r1 = await syncSeasonPerformance(seasonId)
  assert(
    r1.upserted === 8,
    `Case 7: 8 candidates synced (got upserted=${r1.upserted} walked=${r1.walked} not_yet_published=${r1.not_yet_published})`,
  )
  console.log(`  ✓ Case 7 — syncSeasonPerformance wrote ${r1.upserted} rows`)

  // ─── 8. Idempotent: re-running yields same row count, no duplicates ────────
  const r2 = await syncSeasonPerformance(seasonId)
  const perfCountRows = await db!.execute(drizzleSql`
    SELECT count(*)::int AS c
    FROM khat_map_episode_performance p
    JOIN khat_map_episode_candidates c ON c.id = p.candidate_id
    WHERE c.season_id = ${seasonId}
  `)
  const perfCount = Number((perfCountRows as unknown as { rows: { c: number }[] }).rows[0].c)
  assert(
    r2.upserted === 8 && perfCount === 8,
    `Case 8: re-sync upserts in place (got upserted=${r2.upserted}, total rows=${perfCount})`,
  )
  console.log(`  ✓ Case 8 — re-sync is idempotent (still ${perfCount} rows)`)

  // ─── 9. Domain aggregation reads back grouped means ────────────────────────
  const domMap = await getDomainPerformanceMap()
  const highRow = domMap.get(highDomain)
  const lowRow = domMap.get(lowDomain)
  assert(highRow && highRow.episodes_count >= 4, `Case 9: high domain has count`)
  assert(lowRow && lowRow.episodes_count >= 4, `Case 9: low domain has count`)
  assert(
    highRow!.avg_performance > lowRow!.avg_performance,
    `Case 9: high > low (got high=${highRow?.avg_performance.toFixed(3)} low=${lowRow?.avg_performance.toFixed(3)})`,
  )
  console.log(
    `  ✓ Case 9 — domain map: ${highDomain}=${highRow!.avg_performance.toFixed(3)} > ${lowDomain}=${lowRow!.avg_performance.toFixed(3)}`,
  )

  // ─── 10. getPerformanceByCandidateIds returns a keyed map ──────────────────
  const byId = await getPerformanceByCandidateIds([
    ...highCandIds,
    ...lowCandIds,
  ])
  assert(byId.size === 8, `Case 10: 8 entries in map (got ${byId.size})`)
  const sampleHigh = byId.get(highCandIds[0])
  const sampleLow = byId.get(lowCandIds[0])
  assert(
    sampleHigh && sampleLow && sampleHigh.performance_score! > sampleLow.performance_score!,
    `Case 10: per-candidate scores reflect domain bias`,
  )
  console.log(
    `  ✓ Case 10 — getPerformanceByCandidateIds (${byId.size} entries; high=${sampleHigh!.performance_score!.toFixed(3)} > low=${sampleLow!.performance_score!.toFixed(3)})`,
  )

  // ─── 11. Performance-weighted taste recompute ─────────────────────────────
  // Snapshot taste with current accepts (mix of high + low). Then compare
  // the philosophy weight to a control admin who only accepted philosophy
  // with no synced performance — same number of decisions, but no
  // performance multiplier. The synced admin's philosophy weight should
  // dominate because performanceWeight ranges 0.5×–1.5×.
  const synced = await recomputeTasteProfile(adminId)
  assert(
    synced.total_decisions === 2,
    `Case 11: 2 decisions counted (got ${synced.total_decisions})`,
  )
  const phiWeight = synced.preferred_domains.find((d) => d.domain === highDomain)
  const moneyWeight = synced.preferred_domains.find((d) => d.domain === lowDomain)
  assert(
    phiWeight && moneyWeight && phiWeight.weight > moneyWeight.weight,
    `Case 11: high-perf domain weight > low-perf domain weight (got phi=${phiWeight?.weight.toFixed(3)} money=${moneyWeight?.weight.toFixed(3)})`,
  )
  console.log(
    `  ✓ Case 11 — perf-weighted taste: ${highDomain}=${phiWeight!.weight.toFixed(3)} > ${lowDomain}=${moneyWeight!.weight.toFixed(3)}`,
  )

  // ─── 12–14. buildCardExplainability paths ─────────────────────────────────
  // Isolate the perf-band signal so it's the only reason produced — verifies
  // the explainer reads domain_performance and surfaces it honestly.
  const perfOnly = mkScored({
    editorial: 5,
    taste_alignment: 0.4,
    domain_load: 0.5,
    similarity_verdict: "ok",
    domain: highDomain,
  })
  const baseTaste = mkTaste(15)
  const ex1 = buildCardExplainability({
    scored: perfOnly,
    taste: baseTaste,
    domain_performance: highRow!,
    similarity_trigger_title: null,
  })
  assert(
    ex1.why_suggested.includes("أداءً ممتازًا"),
    `Case 12: high-perf reason surfaces (got ${ex1.why_suggested})`,
  )
  assert(
    ex1.expected_outcome !== null,
    `Case 12: expected_outcome present`,
  )
  console.log(`  ✓ Case 12 — explainability flags excellent perf domain: "${ex1.why_suggested}"`)

  const riskScored = mkScored({
    editorial: 5,
    taste_alignment: 0.15,
    domain_load: 0.7,
    similarity_verdict: "soft_avoid",
    domain: lowDomain,
  })
  const ex2 = buildCardExplainability({
    scored: riskScored,
    taste: baseTaste,
    domain_performance: lowRow!,
    similarity_trigger_title: "حلقة قديمة",
  })
  assert(ex2.risks.length >= 3, `Case 13: multiple risks listed (got ${ex2.risks.length})`)
  assert(
    ex2.risks.some((r) => r.includes("قريبة من حلقة سابقة")),
    `Case 13: similarity risk surfaced`,
  )
  assert(
    ex2.risks.some((r) => r.includes("متكرر")),
    `Case 13: domain-saturation risk surfaced`,
  )
  console.log(`  ✓ Case 13 — explainability lists ${ex2.risks.length} risks`)

  const lowDataPerf: KhatMapDomainPerformance = {
    domain: highDomain,
    episodes_count: 1,
    avg_performance: 0.9,
    avg_views: 100,
  }
  const ex3 = buildCardExplainability({
    scored: perfOnly,
    taste: baseTaste,
    domain_performance: lowDataPerf,
    similarity_trigger_title: null,
  })
  assert(
    ex3.expected_outcome === null,
    `Case 14: expected_outcome should be null when episodes_count < ${PERFORMANCE_BAND.min_episodes} (got ${ex3.expected_outcome})`,
  )
  console.log(`  ✓ Case 14 — expected_outcome null at <${PERFORMANCE_BAND.min_episodes} episodes`)

  await cleanup()
  console.log("\n✅ smoke-khat-map-performance: all 14 cases passed")
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureSmokeAdmin(): Promise<string> {
  const existing = await db!
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, "smoke-perf@example.com"))
    .limit(1)
  if (existing[0]) return existing[0].id
  const [row] = await db!
    .insert(adminUsers)
    .values({
      email: "smoke-perf@example.com",
      password_hash: "x",
      role: "ADMIN",
    })
    .returning({ id: adminUsers.id })
  return row.id
}

async function mkConvertedCandidate(
  seasonId: string,
  domain: string,
  views: number,
  quoteCount: number,
): Promise<string> {
  const epId = `${SEASON_PREFIX}ep-${crypto.randomUUID()}`
  await db!.insert(episodes).values({
    id: epId,
    title: `${SEASON_PREFIX}episode ${domain}`,
    slug: `smoke-${epId.slice(-8)}-${Math.floor(Math.random() * 1e6)}`,
    season: 1,
    episode_number: Math.floor(Math.random() * 1_000_000),
    status: "published",
    youtube_url: `https://youtu.be/smoke-${epId.slice(-8)}`,
    duration_minutes: 60,
    release_date: "2026-01-01",
    view_count: views,
  } as never)
  const [cand] = await db!
    .insert(khatMapEpisodeCandidates)
    .values({
      season_id: seasonId,
      working_title: `${SEASON_PREFIX}cand ${domain}`,
      hook: null,
      why_matters: null,
      why_now: null,
      goal: null,
      description: null,
      episode_type: "intellectual",
      topic_domain: domain as never,
      topic_angle_code: null,
      suggested_guest_candidate_id: null,
      main_axes: [],
      suggested_questions: [],
      production_notes: null,
      risk_level: null,
      effort_level: null,
      sponsor_appeal: null,
      converted_preparation_id: null,
      converted_episode_id: epId,
      converted_at: new Date(),
      status: "converted_to_episode",
      slot_index: null,
    } as never)
    .returning({ id: khatMapEpisodeCandidates.id })
  // Quote density: write a marker on the candidate's episode via raw SQL
  // since seeding studio outputs is heavy. The composite scorer reads
  // quote_count from `episode_quotes_config` — we insert a stub row when
  // quoteCount > 0 so syncSeasonPerformance picks it up.
  if (quoteCount > 0) {
    await db!.execute(drizzleSql`
      INSERT INTO episode_quotes_config (episode_id, episode_title, quotes)
      VALUES (
        ${epId},
        ${`${SEASON_PREFIX}episode ${domain}`},
        ${JSON.stringify(
          Array.from({ length: quoteCount }, (_, i) => ({
            id: `q${i}`,
            text: `quote ${i}`,
          })),
        )}::jsonb
      )
      ON CONFLICT (episode_id) DO UPDATE SET quotes = EXCLUDED.quotes
    `)
  }
  return cand.id
}

function mkScored(opts: {
  editorial: number
  taste_alignment: number
  domain_load: number
  similarity_verdict: "ok" | "soft_avoid"
  domain: string
}): ScoredCandidate {
  return {
    raw: {
      topic: {
        working_title: "test",
        hook: "",
        why_matters: "",
        why_now: "",
        goal: "",
        description: "",
        episode_type: "intellectual",
        topic_domain: opts.domain as never,
        topic_angle_code: null,
        main_axes: [],
        suggested_questions: [],
        risk_level: null,
        effort_level: null,
        sponsor_appeal: null,
        category: null,
        audience_fit: neutralAudienceFit(),
        regional_note: null,
        viral_angle: null,
        debate_axis: null,
      },
      guest: null,
      editorial_score: opts.editorial,
      why_now: "x",
      domain_reasoning: null,
    },
    embedding: [],
    similarity_verdict: opts.similarity_verdict,
    similarity_max: opts.similarity_verdict === "soft_avoid" ? 0.78 : 0.2,
    similarity_trigger_title: null,
    taste_alignment: opts.taste_alignment,
    domain_load: opts.domain_load,
    final_score: opts.editorial,
  }
}

function mkTaste(decisions: number): KhatMapUserTasteProfile {
  const now = new Date().toISOString()
  return {
    user_id: "smoke",
    preferred_domains: [],
    rejected_patterns: [],
    depth_score: 0.5,
    controversy_tolerance: 0.5,
    emotional_preference: 0.5,
    kuwait_relevance_weight: 0.5,
    total_decisions: decisions,
    last_recomputed_at: now,
    created_at: now,
    updated_at: now,
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("💥 smoke-khat-map-performance failed:", e)
    process.exit(1)
  })
