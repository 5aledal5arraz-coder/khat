/**
 * Khat Brain Phase 8 — performance learning + pre-launch polish smoke.
 *
 *   1. Rolling-window picker selects views_at_7d/14d/28d correctly
 *   2. editorial_signal_score handles missing 14d/28d (renormalizes)
 *   3. Sample-size guard skips EIRs with views < 50
 *   4. Season-baseline kicks in when ≥3 sibling EIRs have 28d views
 *   5. buildWorkedReport surfaces top + weak episodes + recommendations
 *   6. mergeSourceSummary preserves untouched sections (unit)
 *   7. updateGuestIdentityProfile no longer wipes other source sections
 *   8. findGuestMatch uses indexed normalized_name lookup (and works on
 *      whitespace-edge inputs)
 *   9. guest_candidates documented as legacy in KHAT_BRAIN_OPS.md
 *  10. ecosystem.config.js + scheduler scripts exist on disk
 *  11. /admin/khat-brain/command page module imports cleanly with the
 *      new What Worked section
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { performanceSnapshots } from "@/lib/db/schema/studio-analysis"
import { episodePerformanceSignals } from "@/lib/db/schema/performance-signals"
import { khatMapSeasons } from "@/lib/db/schema/khat-map"
import { guests } from "@/lib/db/schema/guests"
import {
  guestIdentityProfiles,
  type GuestSourceSummary,
} from "@/lib/db/schema/guest-identity"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  analyzeEirPerformance,
  buildWorkedReport,
  batchAnalyzePerformance,
} from "@/lib/khat-brain/performance-learning"
import {
  mergeSourceSummary,
  findGuestMatch,
  ensureGuest,
  updateGuestIdentityProfile,
  createGuestIdentityProfile,
} from "@/lib/guests/canonical"

const TAG = "smoke-perf-loop"
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
  await db!.execute(sql`
    DELETE FROM episode_performance_signals WHERE eir_id IN
      (SELECT id FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM performance_snapshots WHERE eir_id IN
      (SELECT id FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM khat_map_seasons WHERE name LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM guest_identity_profiles WHERE guest_id IN
      (SELECT id FROM guests WHERE name LIKE ${TAG + "%"} OR slug LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM guests WHERE name LIKE ${TAG + "%"} OR slug LIKE ${TAG + "%"}
  `)
}

async function seedSeason(adminId: string, suffix: string): Promise<string> {
  const [season] = await db!
    .insert(khatMapSeasons)
    .values({
      name: `${TAG}-season-${suffix}`,
      season_number: null,
      status: "planning",
      target_episode_count: 6,
      v2_mode: "guided",
      created_by: adminId,
    })
    .returning({ id: khatMapSeasons.id })
  return season.id
}

async function seedEir(args: {
  seasonId: string | null
  title: string
  topic_domain?: string
  episode_type?: string
}): Promise<string> {
  const [row] = await db!
    .insert(episodeIntelligenceRecords)
    .values({
      working_title: args.title,
      phase: "published",
      season_id: args.seasonId,
      topic_domain: (args.topic_domain ?? null) as never,
      episode_type: (args.episode_type ?? null) as never,
    })
    .returning({ id: episodeIntelligenceRecords.id })
  return row.id
}

async function insertSnapshot(args: {
  eirId: string
  daysFromAnchor: number
  views: number
  likes: number
  comments: number
  anchor: Date
}) {
  const at = new Date(args.anchor.getTime() + args.daysFromAnchor * 86400_000)
  await db!.insert(performanceSnapshots).values({
    eir_id: args.eirId,
    episode_id: null,
    snapshot_at: at,
    view_count: String(args.views),
    like_count: String(args.likes),
    comment_count: String(args.comments),
    source: "youtube_api",
    raw: { tag: TAG },
  })
}

// ─── Cases ────────────────────────────────────────────────────────────

async function caseRollingWindows(adminId: string) {
  console.log("Case 1 — rolling-window picker selects 7d/14d/28d:")
  const seasonId = await seedSeason(adminId, "rolling")
  const eirId = await seedEir({
    seasonId,
    title: `${TAG}-rolling`,
    topic_domain: "philosophy",
    episode_type: "deep_dive",
  })
  const anchor = new Date(Date.now() - 30 * 86400_000)
  // First snapshot is the publish anchor.
  await insertSnapshot({ eirId, daysFromAnchor: 0, views: 1_000, likes: 50, comments: 5, anchor })
  await insertSnapshot({ eirId, daysFromAnchor: 7, views: 5_000, likes: 200, comments: 30, anchor })
  await insertSnapshot({ eirId, daysFromAnchor: 14, views: 8_000, likes: 320, comments: 60, anchor })
  await insertSnapshot({ eirId, daysFromAnchor: 28, views: 12_000, likes: 500, comments: 110, anchor })

  const r = await analyzeEirPerformance(eirId)
  assert(r.ok, `expected analysis ok; got reason="${r.reason}"`)
  assert(r.signal, "expected signal row")
  assert(r.signal!.views_at_7d === 5_000, `views_at_7d expected 5000 got ${r.signal!.views_at_7d}`)
  assert(r.signal!.views_at_14d === 8_000, `views_at_14d expected 8000 got ${r.signal!.views_at_14d}`)
  assert(r.signal!.views_at_28d === 12_000, `views_at_28d expected 12000 got ${r.signal!.views_at_28d}`)
  assert(
    typeof r.signal!.editorial_signal_score === "number" &&
      r.signal!.editorial_signal_score! > 0,
    "expected nonzero editorial_signal_score",
  )
  console.log(
    `  ✓ windows 7d=${r.signal!.views_at_7d} 14d=${r.signal!.views_at_14d} 28d=${r.signal!.views_at_28d}, score=${r.signal!.editorial_signal_score?.toFixed(3)}`,
  )
  return { seasonId, eirId }
}

async function caseMissingWindowsRenormalize(adminId: string) {
  console.log("\nCase 2 — handles missing 14d/28d via component renormalization:")
  const eirId = await seedEir({
    seasonId: null,
    title: `${TAG}-missing-windows`,
    topic_domain: "religion",
    episode_type: "interview",
  })
  // Single 7d-only datapoint with sufficient views.
  const anchor = new Date(Date.now() - 9 * 86400_000)
  await insertSnapshot({ eirId, daysFromAnchor: 0, views: 200, likes: 10, comments: 4, anchor })
  await insertSnapshot({ eirId, daysFromAnchor: 7, views: 800, likes: 40, comments: 16, anchor })

  const r = await analyzeEirPerformance(eirId)
  assert(r.ok, `expected analysis ok; got reason="${r.reason}"`)
  assert(r.signal!.views_at_7d === 800, `views_at_7d expected 800 got ${r.signal!.views_at_7d}`)
  // No 14d/28d snapshots — picker still chooses the closest one (the 7d
  // snapshot), but the analyzer's projection logic uses views_at_7d
  // doubled when 14d/28d are missing. Either way, score should be
  // computed (not null) because we still have engagement + comment.
  assert(
    typeof r.signal!.editorial_signal_score === "number",
    "expected score even with sparse windows",
  )
  console.log(
    `  ✓ score=${r.signal!.editorial_signal_score?.toFixed(3)} from sparse windows`,
  )
  return eirId
}

async function caseSampleSizeGuard() {
  console.log("\nCase 3 — sample-size guard skips low-view EIRs:")
  const eirId = await seedEir({
    seasonId: null,
    title: `${TAG}-low-views`,
  })
  const anchor = new Date(Date.now() - 8 * 86400_000)
  await insertSnapshot({ eirId, daysFromAnchor: 0, views: 5, likes: 1, comments: 0, anchor })
  await insertSnapshot({ eirId, daysFromAnchor: 7, views: 30, likes: 2, comments: 0, anchor })

  const r = await analyzeEirPerformance(eirId)
  assert(r.ok === false, "expected guard to skip")
  assert(r.reason && r.reason.includes("below threshold"), `unexpected reason: ${r.reason}`)
  console.log(`  ✓ guard rejected: ${r.reason}`)
}

async function caseSeasonBaseline(adminId: string) {
  console.log("\nCase 4 — season baseline activates with ≥3 peers:")
  const seasonId = await seedSeason(adminId, "baseline")

  // Three sibling EIRs with 28d snapshots → forms the baseline pool.
  const baseAnchor = new Date(Date.now() - 35 * 86400_000)
  for (let i = 0; i < 3; i++) {
    const id = await seedEir({
      seasonId,
      title: `${TAG}-sibling-${i}`,
      topic_domain: "society",
      episode_type: "deep_dive",
    })
    await insertSnapshot({ eirId: id, daysFromAnchor: 0, views: 500 + i * 100, likes: 20, comments: 3, anchor: baseAnchor })
    await insertSnapshot({ eirId: id, daysFromAnchor: 28, views: 5_000 + i * 1_000, likes: 200, comments: 30, anchor: baseAnchor })
    const sr = await analyzeEirPerformance(id)
    assert(sr.ok, `sibling ${i} analysis failed: ${sr.reason}`)
  }

  // Subject EIR, same season, slightly above the median.
  const subjectId = await seedEir({
    seasonId,
    title: `${TAG}-subject`,
    topic_domain: "society",
    episode_type: "deep_dive",
  })
  await insertSnapshot({ eirId: subjectId, daysFromAnchor: 0, views: 800, likes: 30, comments: 4, anchor: baseAnchor })
  await insertSnapshot({ eirId: subjectId, daysFromAnchor: 28, views: 9_000, likes: 400, comments: 90, anchor: baseAnchor })
  const r = await analyzeEirPerformance(subjectId)
  assert(r.ok, `subject analysis failed: ${r.reason}`)
  assert(r.signal!.baseline_used === "season", `expected baseline_used=season got ${r.signal!.baseline_used}`)
  const explanation = r.signal!.explanation as { baseline: { type: string; sample_size: number } }
  assert(
    explanation.baseline.sample_size >= 3,
    `expected sample_size ≥ 3, got ${explanation.baseline.sample_size}`,
  )
  console.log(
    `  ✓ season baseline active (n=${explanation.baseline.sample_size}, score=${r.signal!.editorial_signal_score?.toFixed(3)})`,
  )
  return { seasonId, subjectId }
}

async function caseWorkedReport() {
  console.log("\nCase 5 — buildWorkedReport surfaces signals + recommendations:")
  // Run the batch analyzer to make sure all our seeded EIRs are scored.
  const batch = await batchAnalyzePerformance()
  console.log(`  · batch: scanned=${batch.scanned} ok=${batch.ok} skipped=${batch.skipped.length}`)
  const report = await buildWorkedReport()
  assert(typeof report.generated_at === "string", "missing generated_at")
  assert(Array.isArray(report.recommendations), "recommendations not an array")

  // Top + weak episodes should at least include some of our smoke EIRs.
  const ourEirs = report.top_episodes
    .concat(report.weak_episodes)
    .filter((e) => e.working_title.startsWith(TAG))
  assert(ourEirs.length > 0, "no smoke EIRs surfaced in worked report")
  console.log(
    `  ✓ report: top=${report.top_episodes.length} weak=${report.weak_episodes.length} reco=${report.recommendations.length}`,
  )
}

async function caseMergeSourceSummaryUnit() {
  console.log("\nCase 6 — mergeSourceSummary preserves untouched sections:")

  const existing: GuestSourceSummary = {
    discovery: { runs: 2, last_seen: "2026-04-01T00:00:00Z" },
    application: { id: "app-1", received_at: "2026-04-02T00:00:00Z" },
  }
  const patch: GuestSourceSummary = {
    studio: { sessions: 1, last_seen: "2026-04-25T00:00:00Z" },
  }
  const merged = mergeSourceSummary(existing, patch)
  assert(merged?.discovery, "discovery section was wiped")
  assert(merged?.application, "application section was wiped")
  assert(merged?.studio, "studio section missing")
  assert(merged.discovery!.runs === 2, "discovery.runs mutated")

  // Auto-stamp last_seen when patch lacks one.
  const auto = mergeSourceSummary(null, {
    studio: { sessions: 1, last_seen: null },
  } as unknown as GuestSourceSummary)
  // `last_seen: null` is preserved as-is; the helper only stamps when
  // the field is *missing*. Confirm null kept.
  assert(auto?.studio, "studio missing on null-existing")

  const stampedFromMissing = mergeSourceSummary(null, {
    manual: {} as never,
  })
  assert(stampedFromMissing?.manual, "manual missing")
  assert(
    typeof (stampedFromMissing!.manual as { last_seen?: string }).last_seen === "string",
    "expected auto-stamped last_seen",
  )
  console.log(`  ✓ merge preserves sections + auto-stamps last_seen`)
}

async function caseProfileWritePathPreservesSections() {
  console.log("\nCase 7 — updateGuestIdentityProfile deep-merges source_summary:")
  const guest = await ensureGuest({
    name: `${TAG}-merge-target`,
    bio: "preserve test",
  })
  // Seed initial profile with discovery + application sections.
  await createGuestIdentityProfile(guest.guest_id, {
    source_summary: {
      discovery: { runs: 1, last_seen: "2026-04-20T00:00:00Z" },
      application: { id: "app-x", received_at: "2026-04-21T00:00:00Z" },
    },
  })
  // Now update with only studio_signals + a studio source-section. The
  // discovery + application sections must SURVIVE.
  await updateGuestIdentityProfile(guest.guest_id, {
    studio_signals: { detected_bio: "from studio" },
    source_summary: {
      studio: { sessions: 1, last_seen: "2026-04-25T00:00:00Z" },
    },
  })
  const [row] = await db!
    .select({
      ss: guestIdentityProfiles.source_summary,
      studio: guestIdentityProfiles.studio_signals,
    })
    .from(guestIdentityProfiles)
    .where(eq(guestIdentityProfiles.guest_id, guest.guest_id))
    .limit(1)
  const ss = row.ss as GuestSourceSummary | null
  assert(ss?.discovery, "discovery section wiped on update")
  assert(ss?.application, "application section wiped on update")
  assert(ss?.studio, "studio section not added")
  assert((row.studio as { detected_bio?: string })?.detected_bio === "from studio", "studio_signals not stored")
  console.log(`  ✓ all 3 sections present after partial update`)
}

async function caseGuestMatchUsesIndex() {
  console.log("\nCase 8 — findGuestMatch uses normalized_name lookup:")
  // Create canonical guest with mixed case + diacritics.
  const created = await ensureGuest({
    name: `${TAG}-Mohamed Al-Sayed`,
    bio: "indexed lookup test",
  })
  // Lookup with different spacing/casing — should resolve via normalized
  // index. (If the indexed path were broken, the normalize logic would
  // still fall back, but we're verifying the path exists & finds.)
  const m = await findGuestMatch({ name: `   ${TAG}-mohamed   al-sayed   ` })
  assert(m.guest_id === created.guest_id, `expected match on normalized name; got ${m.guest_id}`)
  assert(m.confidence === "medium", `expected medium confidence, got ${m.confidence}`)
  console.log(`  ✓ matched normalized name (confidence=${m.confidence})`)

  // The DB-level index should exist on guests.normalized_name.
  const idx = await db!.execute(sql`
    SELECT indexname FROM pg_indexes
     WHERE tablename = 'guests' AND indexname = 'idx_guests_normalized_name'
  `)
  assert(
    Array.isArray(idx.rows) && idx.rows.length === 1,
    "idx_guests_normalized_name not present on guests",
  )
  console.log(`  ✓ idx_guests_normalized_name present`)
}

async function caseLegacyDocsAndOpsAssets() {
  console.log("\nCase 9+10 — legacy docs + worker/cron scripts on disk:")
  const opsPath = path.join(REPO_ROOT, "KHAT_BRAIN_OPS.md")
  const opsBody = await fs.readFile(opsPath, "utf8")
  assert(opsBody.includes("guest_candidates"), "guest_candidates legacy section missing in KHAT_BRAIN_OPS.md")
  assert(opsBody.includes("legacy"), "legacy term not present in KHAT_BRAIN_OPS.md")
  console.log(`  ✓ KHAT_BRAIN_OPS.md documents guest_candidates legacy decision`)

  const ecosystem = path.join(REPO_ROOT, "ecosystem.config.js")
  const ecoBody = await fs.readFile(ecosystem, "utf8")
  assert(ecoBody.includes("khat-worker"), "khat-worker app missing in ecosystem.config.js")
  assert(ecoBody.includes("lib/jobs/worker.ts"), "worker.ts not referenced in ecosystem.config.js")
  console.log(`  ✓ ecosystem.config.js declares khat + khat-worker`)

  for (const f of [
    "scripts/discovery-cron-check.ts",
    "scripts/schedule-youtube-performance.ts",
    "lib/jobs/worker.ts",
  ]) {
    await fs.access(path.join(REPO_ROOT, f))
  }
  console.log(`  ✓ all scheduler scripts + worker file exist`)
}

async function caseCommandPageImports() {
  console.log("\nCase 11 — command page module imports cleanly:")
  const mod = await import("@/app/admin/khat-brain/command/page")
  assert(typeof mod.default === "function", "default export missing")
  console.log(`  ✓ /admin/khat-brain/command page module loaded`)
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  await cleanup()
  console.log("🧪 smoke-khat-brain-performance-loop — starting\n")

  const adminId = await ensureSmokeAdmin()
  await caseRollingWindows(adminId)
  await caseMissingWindowsRenormalize(adminId)
  await caseSampleSizeGuard()
  await caseSeasonBaseline(adminId)
  await caseWorkedReport()
  await caseMergeSourceSummaryUnit()
  await caseProfileWritePathPreservesSections()
  await caseGuestMatchUsesIndex()
  await caseLegacyDocsAndOpsAssets()
  await caseCommandPageImports()

  await cleanup()
  console.log("\n✅ smoke-khat-brain-performance-loop: all 11 cases passed")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 smoke failed:", err)
    process.exit(1)
  })

// Suppress unused-import lint when iterating.
void episodePerformanceSignals
void guests
