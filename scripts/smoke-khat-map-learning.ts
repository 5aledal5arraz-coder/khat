/**
 * Khat Map v2 — PR1 smoke test.
 *
 * Exercises every new learning-layer module without calling OpenAI.
 * Pure math is tested directly; DB paths use a temporary season that
 * cascades its rows on teardown.
 *
 * Cases:
 *   1. cosineSimilarity math (identical, orthogonal, hand-computed)
 *   2. classifySimilarity thresholds
 *   3. scanAgainstNegatives picks worst verdict + sorts triggers
 *   4. buildFingerprintText canonicalizes title + summary + domain
 *   5. recordDecision + listEffectiveDecisions
 *   6. undoDecision within window succeeds
 *   7. undoDecision past window returns null
 *   8. listEffectiveDecisions drops undone rows
 *   9. countEffectiveDecisions aggregates by kind
 *  10. writeFingerprint + listNegativeFingerprints (precomputed vecs)
 *  11. listPositiveFingerprints
 *  12. removeFingerprintsForDecision
 *  13. recomputeTasteProfile on empty history = neutral seed
 *  14. recomputeTasteProfile with mixed accepts/rejects moves axes
 *  15. getTasteProfile returns persisted row after recompute
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/smoke-khat-map-v2-pr1.ts
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapUserTasteProfile,
} from "@/lib/db/schema/khat-map"
import { eq } from "drizzle-orm"
import {
  cosineSimilarity,
  classifySimilarity,
  scanAgainstNegatives,
  buildFingerprintText,
  EMBEDDING_DIMS,
  SIMILARITY_HARD_BLOCK,
  SIMILARITY_SOFT_AVOID,
} from "@/lib/khat-map/learning/embeddings"
import {
  recordDecision,
  undoDecision,
  listEffectiveDecisions,
  countEffectiveDecisions,
  UNDO_WINDOW_MS,
} from "@/lib/khat-map/learning/decisions"
import {
  writeFingerprint,
  listNegativeFingerprints,
  listPositiveFingerprints,
  removeFingerprintsForDecision,
} from "@/lib/khat-map/learning/fingerprints"
import {
  recomputeTasteProfile,
  getTasteProfile,
} from "@/lib/khat-map/learning/taste"
import type { KhatMapTopicFingerprint } from "@/types/khat-map"

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    console.error("❌ Assertion failed:", message)
    process.exit(1)
  }
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

/** Build a deterministic vector — seed-based, not random. */
function vec(seed: number, shift = 0): number[] {
  const v = new Array<number>(EMBEDDING_DIMS)
  for (let i = 0; i < EMBEDDING_DIMS; i++) {
    v[i] = Math.sin((i + shift) * 0.01 + seed)
  }
  // normalize to unit length
  let mag = 0
  for (const x of v) mag += x * x
  mag = Math.sqrt(mag)
  for (let i = 0; i < v.length; i++) v[i] /= mag
  return v
}

async function main() {
  const adminId = `smoke-admin-${Date.now()}`
  const seasonId = crypto.randomUUID()

  // Set up a scratch season so cascades clean up on teardown.
  await db!.insert(khatMapSeasons).values({
    id: seasonId,
    name: `smoke-v2-pr1-${Date.now()}`,
    season_number: 9999,
    status: "planning",
    created_by: adminId,
  })

  // One episode candidate per domain we'll touch. topic_domain drives
  // the taste axis mapping.
  const domains: Array<{ id: string; dom: string }> = [
    { id: crypto.randomUUID(), dom: "philosophy" }, // depth
    { id: crypto.randomUUID(), dom: "psychology" }, // depth
    { id: crypto.randomUUID(), dom: "religion" }, // controversy
    { id: crypto.randomUUID(), dom: "emotions_inner_life" }, // emotional
    { id: crypto.randomUUID(), dom: "kuwait_gulf" }, // kuwait
  ]
  for (const [i, d] of domains.entries()) {
    await db!.insert(khatMapEpisodeCandidates).values({
      id: d.id,
      season_id: seasonId,
      working_title: `smoke candidate ${i}`,
      episode_type: "intellectual",
      topic_domain: d.dom as never,
      slot_index: i,
    })
  }

  try {
    // ─── Pure math ─────────────────────────────────────────────────────────
    {
      const v = vec(1)
      assert(approx(cosineSimilarity(v, v), 1), "1. identical vectors cos=1")
      const flipped = v.map((x) => -x)
      assert(
        approx(cosineSimilarity(v, flipped), -1),
        "1. antiparallel cos=-1",
      )
      console.log("  ✓ Case 1 — cosineSimilarity math")
    }
    {
      assert(classifySimilarity(0.9) === "hard_block", "2. 0.9 hard_block")
      assert(classifySimilarity(0.78) === "soft_avoid", "2. 0.78 soft_avoid")
      assert(classifySimilarity(0.5) === "ok", "2. 0.5 ok")
      assert(
        classifySimilarity(SIMILARITY_HARD_BLOCK) === "hard_block",
        "2. boundary inclusive (hard)",
      )
      assert(
        classifySimilarity(SIMILARITY_SOFT_AVOID) === "soft_avoid",
        "2. boundary inclusive (soft)",
      )
      console.log("  ✓ Case 2 — classifySimilarity thresholds")
    }
    {
      const v1 = vec(1)
      const v2 = vec(1, 1) // tiny shift → very similar
      const v3 = vec(100) // very different
      const nearFingerprint: KhatMapTopicFingerprint = {
        id: "np1",
        season_id: seasonId,
        source: "rejected",
        angle_code: null,
        title_ar: "near",
        summary_ar: null,
        domain: null,
        embedding: v2,
        embedding_model: "test",
        topic_candidate_id: null,
        decision_id: null,
        created_at: new Date().toISOString(),
      }
      const farFingerprint: KhatMapTopicFingerprint = {
        ...nearFingerprint,
        id: "np2",
        embedding: v3,
      }
      const scan = scanAgainstNegatives(v1, [farFingerprint, nearFingerprint])
      assert(scan.verdict !== "ok", "3. near match flagged")
      assert(
        scan.triggered_by[0]?.fingerprint.id === "np1",
        "3. closest trigger sorts first",
      )
      assert(scan.max_similarity > 0.9, "3. max_similarity high")
      console.log("  ✓ Case 3 — scanAgainstNegatives worst-of + sort")
    }
    {
      const text = buildFingerprintText(
        "الصداقة في زمن الخوارزميات",
        "لماذا الآن",
        "philosophy",
      )
      assert(text.includes("الصداقة"), "4. title included")
      assert(text.includes("لماذا الآن"), "4. summary included")
      assert(text.includes("#philosophy"), "4. domain tag included")
      console.log("  ✓ Case 4 — buildFingerprintText canonicalizes")
    }

    // ─── Decisions journal ─────────────────────────────────────────────────
    let firstDecisionId = ""
    {
      const d1 = await recordDecision({
        season_id: seasonId,
        admin_id: adminId,
        batch_index: 1,
        kind: "accept",
        target: "pair",
        topic_candidate_id: domains[0].id,
      })
      const d2 = await recordDecision({
        season_id: seasonId,
        admin_id: adminId,
        batch_index: 1,
        kind: "reject",
        target: "pair",
        topic_candidate_id: domains[1].id,
        reason_category: "shallow",
      })
      firstDecisionId = d1.id
      const list = await listEffectiveDecisions(seasonId)
      assert(list.length === 2, "5. two effective decisions")
      assert(
        list.every((d) => d.undone_at === null),
        "5. no undone rows",
      )
      assert(d2.reason_category === "shallow", "5. reason_category persisted")
      console.log("  ✓ Case 5 — recordDecision + listEffectiveDecisions")
    }
    {
      const undone = await undoDecision(firstDecisionId)
      assert(undone !== null, "6. undo within window succeeds")
      assert(undone!.undone_at !== null, "6. undone_at set")
      console.log("  ✓ Case 6 — undoDecision within window")
    }
    {
      // Past-window case: insert a decision then backdate it beyond the
      // window so the caller-visible age > UNDO_WINDOW_MS.
      const old = await recordDecision({
        season_id: seasonId,
        admin_id: adminId,
        kind: "skip",
        target: "pair",
        topic_candidate_id: domains[0].id,
      })
      await db!.execute(
        sql`UPDATE khat_map_season_decisions
            SET created_at = now() - interval '60 seconds'
            WHERE id = ${old.id}`,
      )
      const res = await undoDecision(old.id, { window_ms: UNDO_WINDOW_MS })
      assert(res === null, "7. past-window undo returns null")
      console.log("  ✓ Case 7 — undoDecision past window returns null")
    }
    {
      const list = await listEffectiveDecisions(seasonId)
      // 3 inserted so far (d1 accepted, d2 rejected, old skipped).
      // d1 was undone; 'old' still effective (undo failed).
      assert(
        list.length === 2 && list.every((d) => d.undone_at === null),
        "8. undone row excluded from effective list",
      )
      console.log("  ✓ Case 8 — undone rows excluded from effective list")
    }
    {
      const counts = await countEffectiveDecisions(seasonId)
      // reject=1 (d2), skip=1 (old), accept=0 (d1 undone)
      assert(
        counts.accept === 0 && counts.reject === 1 && counts.skip === 1,
        `9. count aggregation {accept:0, reject:1, skip:1} got ${JSON.stringify(counts)}`,
      )
      console.log("  ✓ Case 9 — countEffectiveDecisions aggregates")
    }

    // ─── Fingerprints (use precomputed vecs to skip OpenAI) ────────────────
    let fpDecisionId = ""
    {
      const rejectDecision = await recordDecision({
        season_id: seasonId,
        admin_id: adminId,
        batch_index: 2,
        kind: "reject",
        target: "pair",
        topic_candidate_id: domains[2].id,
        reason_category: "off_brand",
      })
      fpDecisionId = rejectDecision.id
      await writeFingerprint({
        season_id: seasonId,
        source: "rejected",
        title_ar: "تجربة مرفوضة",
        summary_ar: "تلخيص",
        domain: "religion",
        decision_id: rejectDecision.id,
        precomputed_embedding: vec(7),
      })
      await writeFingerprint({
        season_id: seasonId,
        source: "accepted",
        title_ar: "تجربة مقبولة",
        domain: "philosophy",
        precomputed_embedding: vec(3),
      })
      const negatives = await listNegativeFingerprints(seasonId, {
        include_cross_season: false,
      })
      assert(
        negatives.length === 1 && negatives[0].source === "rejected",
        "10. negatives filtered to rejected",
      )
      assert(
        negatives[0].embedding.length === EMBEDDING_DIMS,
        "10. embedding round-trips via jsonb with full dims",
      )
      console.log("  ✓ Case 10 — writeFingerprint + listNegativeFingerprints")
    }
    {
      const positives = await listPositiveFingerprints(seasonId)
      assert(
        positives.length === 1 && positives[0].source === "accepted",
        "11. positives filtered to accepted",
      )
      console.log("  ✓ Case 11 — listPositiveFingerprints")
    }
    {
      const removed = await removeFingerprintsForDecision(fpDecisionId)
      assert(removed === 1, "12. one fingerprint removed")
      const negativesAfter = await listNegativeFingerprints(seasonId, {
        include_cross_season: false,
      })
      assert(
        negativesAfter.length === 0,
        "12. negative list empty after removal",
      )
      console.log("  ✓ Case 12 — removeFingerprintsForDecision")
    }

    // ─── Taste profile ─────────────────────────────────────────────────────
    {
      // Fresh admin with no signal yet.
      const freshAdmin = `smoke-fresh-${Date.now()}`
      const profile = await getTasteProfile(freshAdmin)
      assert(profile.total_decisions === 0, "13. fresh admin total=0")
      assert(
        profile.depth_score === 0.5 &&
          profile.controversy_tolerance === 0.5 &&
          profile.emotional_preference === 0.5 &&
          profile.kuwait_relevance_weight === 0.5,
        "13. all axes at neutral 0.5",
      )
      console.log("  ✓ Case 13 — getTasteProfile on empty history")
    }
    {
      // Record mixed decisions and recompute. The 'accept' on philosophy
      // + psychology should push depth_score up; the 'reject' on religion
      // should push controversy_tolerance down.
      await recordDecision({
        season_id: seasonId,
        admin_id: adminId,
        batch_index: 3,
        kind: "accept",
        target: "pair",
        topic_candidate_id: domains[0].id, // philosophy
      })
      await recordDecision({
        season_id: seasonId,
        admin_id: adminId,
        batch_index: 3,
        kind: "accept",
        target: "pair",
        topic_candidate_id: domains[1].id, // psychology
      })
      await recordDecision({
        season_id: seasonId,
        admin_id: adminId,
        batch_index: 3,
        kind: "reject",
        target: "pair",
        topic_candidate_id: domains[2].id, // religion
        reason_category: "off_brand",
      })
      await recordDecision({
        season_id: seasonId,
        admin_id: adminId,
        batch_index: 3,
        kind: "accept",
        target: "pair",
        topic_candidate_id: domains[3].id, // emotions_inner_life
      })

      const p = await recomputeTasteProfile(adminId)
      assert(p.total_decisions >= 4, "14. total_decisions counts accept+reject")
      assert(p.depth_score > 0.5, "14. depth_score up after 2 depth accepts")
      assert(
        p.controversy_tolerance < 0.5,
        "14. controversy_tolerance down after religion reject",
      )
      assert(
        p.emotional_preference > 0.5,
        "14. emotional_preference up after emotions accept",
      )
      assert(
        p.preferred_domains.some((d) => d.domain === "philosophy"),
        "14. preferred_domains contains philosophy",
      )
      assert(
        p.rejected_patterns.some((r) => r.reason_category === "off_brand"),
        "14. rejected_patterns carries off_brand",
      )
      console.log("  ✓ Case 14 — recomputeTasteProfile moves axes correctly")
    }
    {
      const p = await getTasteProfile(adminId)
      assert(p.total_decisions > 0, "15. persisted profile non-empty")
      assert(p.last_recomputed_at !== null, "15. last_recomputed_at set")
      console.log("  ✓ Case 15 — getTasteProfile returns persisted row")
    }

    console.log("\n✅ smoke-khat-map-v2-pr1: all 15 cases passed")
  } finally {
    // Teardown — cascades clean decisions + fingerprints + candidates.
    await db!
      .delete(khatMapUserTasteProfile)
      .where(eq(khatMapUserTasteProfile.user_id, adminId))
    await db!.delete(khatMapSeasons).where(eq(khatMapSeasons.id, seasonId))
  }

  process.exit(0)
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
