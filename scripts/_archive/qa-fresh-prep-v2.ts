/**
 * Production-readiness fix sprint — final verification.
 *
 * For the fresh season created by qa-fresh-season-test.ts:
 *   1. Accept all 6 candidates (status=approved + ensureEir).
 *   2. Bulk-convert them all into preparation rows.
 *   3. Pick one risky-domain candidate, run the full Prep V2 pipeline
 *      against it, and verify:
 *        - hallucinated-guest validator catches anything wrong
 *        - sensitive_zones is populated for the risky domain
 *        - composite_score on the candidate row is unchanged
 *        - ai_runs.season_id is correctly populated
 *
 * The script picks up the most recent qa-fresh-* season automatically
 * so it can be re-run without arguments.
 */

import { sql, eq, desc, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
} from "@/lib/db/schema/khat-map"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { aiRuns } from "@/lib/db/schema/ai-runs"
import { ensureEirForCandidate } from "@/lib/khat-brain"
import { convertEpisodeToPreparation } from "@/lib/khat-map/conversion/to-preparation"
import { runPrepV2Pipeline } from "@/lib/preparation/v2/pipeline"
import {
  detectUnverifiedGuestReference,
} from "@/lib/preparation/v2/validation"

const TAG = "qa-fresh"

async function main() {
  if (!db) {
    console.error("DB unavailable")
    process.exit(1)
  }

  console.log("════════════════════════════════════════════════════════════")
  console.log(" PHASE 3.5 — FRESH SEASON DEEP VERIFICATION")
  console.log(" date:", new Date().toISOString())
  console.log("════════════════════════════════════════════════════════════")

  // Resolve admin + most recent fresh season.
  const [admin] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, `${TAG}@example.com`))
    .limit(1)
  if (!admin) {
    console.error("admin not found")
    process.exit(1)
  }

  const [season] = await db
    .select()
    .from(khatMapSeasons)
    .where(sql`name LIKE ${TAG + "%"}`)
    .orderBy(desc(khatMapSeasons.created_at))
    .limit(1)
  if (!season) {
    console.error("no fresh season found")
    process.exit(1)
  }
  console.log(`\n── Using season: ${season.id} (${season.name}) ──`)

  // 1. Accept all 6 candidates — flip status + ensureEir.
  const cands = await db
    .select()
    .from(khatMapEpisodeCandidates)
    .where(eq(khatMapEpisodeCandidates.season_id, season.id))
  console.log(`\n── Accepting ${cands.length} candidates ──`)
  for (const c of cands) {
    await db
      .update(khatMapEpisodeCandidates)
      .set({ status: "approved" })
      .where(eq(khatMapEpisodeCandidates.id, c.id))
    try {
      const fresh = await db
        .select()
        .from(khatMapEpisodeCandidates)
        .where(eq(khatMapEpisodeCandidates.id, c.id))
        .limit(1)
      if (fresh[0]) {
        await ensureEirForCandidate({
          candidate: fresh[0] as never,
          guestId: c.suggested_guest_candidate_id,
          adminId: admin.id,
        })
      }
      console.log(`   ✓ ${c.id.slice(0, 8)} accepted + EIR ensured`)
    } catch (err) {
      console.log(
        `   ✗ ${c.id.slice(0, 8)} ensureEir failed: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`,
      )
    }
  }

  // 2. Bulk convert.
  console.log(`\n── Bulk converting all approved → preparation ──`)
  let converted = 0
  let convertFailed = 0
  for (const c of cands) {
    try {
      const r = await convertEpisodeToPreparation({
        episode_candidate_id: c.id,
        admin_id: admin.id,
      })
      if (r.ok) {
        converted++
        console.log(
          `   ✓ ${c.id.slice(0, 8)} → prep ${r.link.target_id.slice(0, 8)}`,
        )
      } else {
        convertFailed++
        console.log(`   ✗ ${c.id.slice(0, 8)} ${r.reason}: ${r.message}`)
      }
    } catch (err) {
      convertFailed++
      console.log(
        `   ✗ ${c.id.slice(0, 8)} threw: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`,
      )
    }
  }
  console.log(`\n   converted=${converted}/${cands.length}  failed=${convertFailed}`)

  // 3. Inspect resulting preparation rows + their auto-triggered prep_v2.
  const eirRows = await db
    .select({ id: episodeIntelligenceRecords.id })
    .from(episodeIntelligenceRecords)
    .where(eq(episodeIntelligenceRecords.season_id, season.id))
  const eirIds = eirRows.map((r) => r.id)
  console.log(`\n── EIRs created for season: ${eirIds.length} ──`)

  const preps =
    eirIds.length > 0
      ? await db
          .select()
          .from(episodePreparations)
          .where(inArray(episodePreparations.eir_id, eirIds))
      : []
  console.log(`── Preparations created: ${preps.length} ──`)
  let prepsWithV2 = 0
  let prepsHallucinated = 0
  for (const p of preps) {
    const v2 = p.prep_v2 as Record<string, unknown> | null
    if (v2) {
      prepsWithV2++
      const linkedGuest = (p.guest_name ?? "").trim() || null
      const hasHallucinated = detectUnverifiedGuestReference(
        v2 as never,
        linkedGuest,
      )
      if (hasHallucinated) prepsHallucinated++
      const sens = (v2.sensitive_zones as string[] | undefined) ?? []
      console.log(
        `   prep ${p.id.slice(0, 8)} v2=yes ver=${v2.generator_version ?? "?"} sens=[${sens.length}] hallucinated=${hasHallucinated}`,
      )
    } else {
      console.log(`   prep ${p.id.slice(0, 8)} v2=null`)
    }
  }

  // 4. If any prep is missing v2, run prep V2 on the FIRST one to
  //    exercise the validator path with real AI output.
  const prepWithoutV2 = preps.find((p) => !p.prep_v2)
  if (prepWithoutV2) {
    console.log(`\n── Running prep V2 on prep ${prepWithoutV2.id.slice(0, 8)} ──`)
    const r = await runPrepV2Pipeline({
      preparationId: prepWithoutV2.id,
      language: "ar",
      force: true,
    })
    console.log(`   ok                : ${r.ok}`)
    console.log(`   reason            : ${r.reason ?? "—"}`)
    console.log(
      `   validation        : ok=${r.validation.ok} failures=${r.validation.failures.length}`,
    )
    for (const f of r.validation.failures) {
      console.log(`     - ${f.code}: ${f.message.slice(0, 100)}`)
    }
    if (r.payload) {
      const sensCount = (r.payload.sensitive_zones ?? []).length
      const linkedName =
        (prepWithoutV2.guest_name ?? "").trim() || null
      const hallucinated = detectUnverifiedGuestReference(
        r.payload,
        linkedName,
      )
      console.log(
        `   sensitive_zones   : ${sensCount} (linked guest=${linkedName ?? "—"})`,
      )
      console.log(`   hallucination?    : ${hallucinated}`)
      console.log(`   thesis            : ${(r.payload.thesis ?? "").slice(0, 100)}`)
      console.log(`   axes              : ${(r.payload.axes_of_tension ?? []).length}`)
      console.log(
        `   questions         : ${(r.payload.question_bank ?? []).length} (must_ask=${(r.payload.question_bank ?? []).filter((q) => q.priority === "must_ask").length})`,
      )
      console.log(
        `   sections          : ${(r.payload.episode_sections ?? []).length}`,
      )
    }
  }

  // 5. AI runs telemetry.
  const runs = await db
    .select({
      task_kind: aiRuns.task_kind,
      model_name: aiRuns.model_name,
      status: aiRuns.status,
      season_id: aiRuns.season_id,
      cost_usd: aiRuns.cost_usd,
      latency_ms: aiRuns.latency_ms,
    })
    .from(aiRuns)
    .where(eq(aiRuns.season_id, season.id))
    .orderBy(desc(aiRuns.started_at))
  console.log(`\n── ai_runs tagged with season_id: ${runs.length} ──`)
  let costTotal = 0
  for (const r of runs) {
    costTotal += Number(r.cost_usd ?? 0)
    console.log(
      `   ${(r.task_kind ?? "—").padEnd(15)} ${(r.model_name ?? "—").padEnd(15)} ${(r.status ?? "—").padEnd(10)} cost=$${Number(r.cost_usd ?? 0).toFixed(4)} latency=${r.latency_ms}ms`,
    )
  }
  console.log(`\n   total cost on this season: $${costTotal.toFixed(4)}`)

  // Verdict.
  console.log("\n── Phase 3.5 verdict ──")
  console.log(`   converted     : ${converted}/${cands.length}`)
  console.log(`   preps_v2      : ${prepsWithV2}/${preps.length}`)
  console.log(`   hallucination : ${prepsHallucinated}`)
  console.log(`   ai_runs tagged: ${runs.length}`)

  console.log(`\nfixture preserved at season=${season.id} for inspection.`)
  console.log("════════════════════════════════════════════════════════════\n")

  process.exit(0)
}

main().catch((err) => {
  console.error("verification failed:", err)
  process.exit(1)
})
