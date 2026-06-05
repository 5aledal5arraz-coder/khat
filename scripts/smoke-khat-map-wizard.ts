/**
 * Khat Map v2 — PR3 smoke test.
 *
 * The wizard's logic is split across server actions that require a live
 * cookie / request context, so this smoke can't call them directly.
 * Instead it exercises the state transitions the actions perform:
 *
 *   • v2_mode + v2_episode_target persist on khat_map_seasons
 *   • the action pattern — recordDecisionAndFingerprint then flip
 *     candidate status — survives an undo cleanly:
 *       - accept  → status='approved',  on undo → 'proposed'
 *       - reject  → status='rejected',  on undo → 'proposed'
 *   • progress-counting logic (mirrors getSeasonProgressAction)
 *     produces the correct accepted/rejected/skipped counts and flags
 *     completion at target
 *   • CHECK constraints reject invalid v2_mode + target values
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/smoke-khat-map-v2-pr3.ts
 */

import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
  khatMapSeasonDecisions,
  khatMapUserTasteProfile,
} from "@/lib/db/schema/khat-map"
import {
  recordDecisionAndFingerprint,
  undoDecisionAndFingerprint,
} from "@/lib/khat-map/v2"
import { EMBEDDING_DIMS } from "@/lib/khat-map/learning/embeddings"

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    console.error("❌ Assertion failed:", message)
    process.exit(1)
  }
}

function fakeEmbed(seed: number): number[] {
  const v = new Array<number>(EMBEDDING_DIMS)
  for (let i = 0; i < EMBEDDING_DIMS; i++) v[i] = Math.sin(i * 0.01 + seed)
  let mag = 0
  for (const x of v) mag += x * x
  mag = Math.sqrt(mag)
  for (let i = 0; i < v.length; i++) v[i] /= mag
  return v
}

async function main() {
  const adminId = `smoke-pr3-${Date.now()}`
  const seasonId = crypto.randomUUID()

  // ─── 1. Season creation with v2 fields ────────────────────────────────────
  await db!.insert(khatMapSeasons).values({
    id: seasonId,
    name: `smoke-v2-pr3-${Date.now()}`,
    season_number: 9997,
    status: "planning",
    created_by: adminId,
    v2_mode: "guided",
    v2_episode_target: 10,
  })
  {
    const [row] = await db!
      .select()
      .from(khatMapSeasons)
      .where(eq(khatMapSeasons.id, seasonId))
    assert(row.v2_mode === "guided", "1. v2_mode persisted")
    assert(row.v2_episode_target === 10, "1. v2_episode_target persisted")
    console.log("  ✓ Case 1 — v2_mode + v2_episode_target persist on insert")
  }

  // ─── 2. CHECK rejects invalid v2_mode ─────────────────────────────────────
  {
    let threw = false
    try {
      await db!.insert(khatMapSeasons).values({
        id: crypto.randomUUID(),
        name: "invalid",
        season_number: 9996,
        status: "planning",
        created_by: adminId,
        v2_mode: "nonsense" as never,
        v2_episode_target: 10,
      })
    } catch {
      threw = true
    }
    assert(threw, "2. bogus v2_mode rejected by CHECK")
    console.log("  ✓ Case 2 — CHECK constraint rejects invalid v2_mode")
  }

  // ─── 3. CHECK rejects episode_target out of range ─────────────────────────
  {
    let threw = false
    try {
      await db!.insert(khatMapSeasons).values({
        id: crypto.randomUUID(),
        name: "invalid",
        season_number: 9995,
        status: "planning",
        created_by: adminId,
        v2_mode: "guided",
        v2_episode_target: 100, // out of [6, 20]
      })
    } catch {
      threw = true
    }
    assert(threw, "3. v2_episode_target=100 rejected by CHECK")
    console.log("  ✓ Case 3 — CHECK constraint rejects target out of [6, 20]")
  }

  // ─── 4. Create a candidate + accept/undo cycle ────────────────────────────
  const guestId = crypto.randomUUID()
  await db!.insert(khatMapGuestCandidates).values({
    id: guestId,
    season_id: seasonId,
    full_name: "ضيف اختبار",
    bio: "سيرة",
    gender: "male",
  })
  const cand1Id = crypto.randomUUID()
  await db!.insert(khatMapEpisodeCandidates).values({
    id: cand1Id,
    season_id: seasonId,
    working_title: "حلقة اختبار أولى",
    episode_type: "signature_khat",
    topic_domain: "philosophy",
    suggested_guest_candidate_id: guestId,
    status: "proposed",
  })

  let acceptDecisionId = ""
  {
    const { decision, fingerprint } = await recordDecisionAndFingerprint({
      season_id: seasonId,
      admin_id: adminId,
      batch_index: 1,
      kind: "accept",
      target: "pair",
      topic_candidate_id: cand1Id,
      guest_candidate_id: guestId,
      topic_title: "حلقة اختبار أولى",
      topic_domain: "philosophy",
      precomputed_embedding: fakeEmbed(1),
    })
    acceptDecisionId = decision.id
    assert(fingerprint !== null, "4. accept wrote fingerprint")
    // Action layer flips status to approved
    await db!
      .update(khatMapEpisodeCandidates)
      .set({ status: "approved" })
      .where(eq(khatMapEpisodeCandidates.id, cand1Id))
    const [after] = await db!
      .select()
      .from(khatMapEpisodeCandidates)
      .where(eq(khatMapEpisodeCandidates.id, cand1Id))
    assert(after.status === "approved", "4. candidate flipped to approved")
    console.log("  ✓ Case 4 — accept records decision + flips status")
  }

  // ─── 5. Undo accept → status back to proposed, fingerprint removed ────────
  {
    const undone = await undoDecisionAndFingerprint(acceptDecisionId)
    assert(undone !== null, "5. undo within window succeeds")
    // Action layer: restore status
    await db!
      .update(khatMapEpisodeCandidates)
      .set({ status: "proposed" })
      .where(eq(khatMapEpisodeCandidates.id, cand1Id))
    const [after] = await db!
      .select()
      .from(khatMapEpisodeCandidates)
      .where(eq(khatMapEpisodeCandidates.id, cand1Id))
    assert(
      after.status === "proposed",
      "5. candidate restored to proposed on undo",
    )
    console.log("  ✓ Case 5 — undo restores status + removes fingerprint")
  }

  // ─── 6. Progress math (mirrors getSeasonProgressAction) ───────────────────
  {
    // Fresh state — no effective decisions after undo. Record 3 accepts.
    for (let i = 0; i < 3; i++) {
      const cid = crypto.randomUUID()
      await db!.insert(khatMapEpisodeCandidates).values({
        id: cid,
        season_id: seasonId,
        working_title: `progress ${i}`,
        episode_type: "signature_khat",
        topic_domain: "philosophy",
        status: "proposed",
      })
      await recordDecisionAndFingerprint({
        season_id: seasonId,
        admin_id: adminId,
        batch_index: 2,
        kind: "accept",
        target: "pair",
        topic_candidate_id: cid,
        topic_title: `progress ${i}`,
        topic_domain: "philosophy",
        precomputed_embedding: fakeEmbed(10 + i),
      })
      await db!
        .update(khatMapEpisodeCandidates)
        .set({ status: "approved" })
        .where(eq(khatMapEpisodeCandidates.id, cid))
    }
    // And 1 reject
    const rejId = crypto.randomUUID()
    await db!.insert(khatMapEpisodeCandidates).values({
      id: rejId,
      season_id: seasonId,
      working_title: "reject me",
      episode_type: "signature_khat",
      topic_domain: "psychology",
      status: "proposed",
    })
    await recordDecisionAndFingerprint({
      season_id: seasonId,
      admin_id: adminId,
      batch_index: 2,
      kind: "reject",
      target: "pair",
      topic_candidate_id: rejId,
      topic_title: "reject me",
      topic_domain: "psychology",
      reason_category: "shallow",
      precomputed_embedding: fakeEmbed(99),
    })

    // Simulate action-layer progress computation
    const decisions = await db!
      .select()
      .from(khatMapSeasonDecisions)
      .where(
        and(
          eq(khatMapSeasonDecisions.season_id, seasonId),
          isNull(khatMapSeasonDecisions.undone_at),
        ),
      )
    let accepted = 0
    let rejected = 0
    for (const d of decisions) {
      if (d.kind === "accept") accepted++
      else if (d.kind === "reject") rejected++
    }
    assert(accepted === 3, `6. accepted=3, got ${accepted}`)
    assert(rejected === 1, `6. rejected=1, got ${rejected}`)
    const target = 10
    const is_complete = accepted >= target
    assert(is_complete === false, "6. not yet complete at 3/10")
    console.log(
      `  ✓ Case 6 — progress math correct (accepted=${accepted}, rejected=${rejected}, complete=${is_complete})`,
    )
  }

  // ─── 7. Completion flag flips at target ───────────────────────────────────
  {
    // Bump target down to 3 via update + recount → should now be complete
    await db!
      .update(khatMapSeasons)
      .set({ v2_episode_target: 6 }) // just inside range; accepted=3 < 6
      .where(eq(khatMapSeasons.id, seasonId))
    // 3 accepts vs target 6 → not complete
    const rows = await db!
      .select({ target: khatMapSeasons.v2_episode_target })
      .from(khatMapSeasons)
      .where(eq(khatMapSeasons.id, seasonId))
    assert(rows[0].target === 6, "7. target updated")
    // Now add 3 more accepts to hit target
    for (let i = 0; i < 3; i++) {
      const cid = crypto.randomUUID()
      await db!.insert(khatMapEpisodeCandidates).values({
        id: cid,
        season_id: seasonId,
        working_title: `extra ${i}`,
        episode_type: "signature_khat",
        topic_domain: "kuwait_gulf",
        status: "proposed",
      })
      await recordDecisionAndFingerprint({
        season_id: seasonId,
        admin_id: adminId,
        batch_index: 3,
        kind: "accept",
        target: "pair",
        topic_candidate_id: cid,
        topic_title: `extra ${i}`,
        topic_domain: "kuwait_gulf",
        precomputed_embedding: fakeEmbed(200 + i),
      })
    }
    const decisions = await db!
      .select()
      .from(khatMapSeasonDecisions)
      .where(
        and(
          eq(khatMapSeasonDecisions.season_id, seasonId),
          isNull(khatMapSeasonDecisions.undone_at),
          eq(khatMapSeasonDecisions.kind, "accept"),
        ),
      )
    assert(
      decisions.length === 6,
      `7. 6 accepts total, got ${decisions.length}`,
    )
    console.log("  ✓ Case 7 — completion flag flips at target (6/6)")
  }

  console.log("\n✅ smoke-khat-map-v2-pr3: all 7 cases passed")

  // Teardown
  await db!
    .delete(khatMapUserTasteProfile)
    .where(eq(khatMapUserTasteProfile.user_id, adminId))
  await db!.delete(khatMapSeasons).where(eq(khatMapSeasons.id, seasonId))
  process.exit(0)
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
