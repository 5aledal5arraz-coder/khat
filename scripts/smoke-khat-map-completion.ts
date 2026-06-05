/**
 * Khat Map v2 — PR4 smoke test.
 *
 * Pure backend — no server actions (they need request context). Covers
 * the three new engine surfaces:
 *   1. Missing-role detection logic (pure function, no I/O)
 *   2. Role prioritization under slot constraints
 *   3. Strict-mode angle-bank query + exhaustion math
 *   4. Strict post-filter drops disallowed codes
 *   5. generateBatch wires required_roles into the extra_system_blocks
 *   6. generateBatch in strict mode throws when the bank can't cover size
 *   7. generateBatch in strict mode filters by angle_code when bank is OK
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/smoke-khat-map-v2-pr4.ts
 */

import { eq, like } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapTopicBank,
  khatMapUserTasteProfile,
} from "@/lib/db/schema/khat-map"
import {
  detectSatisfiedRoles,
  detectMissingRoles,
  prioritizeMissingRoles,
  buildRoleHintBlock,
  ALL_ROLES,
} from "@/lib/khat-map/v2/completion"
import {
  AngleBankExhaustedError,
  listStrictAngleOptions,
  assertStrictBankSufficient,
  buildStrictAngleBlock,
  filterByStrictAngles,
} from "@/lib/khat-map/v2/strict"
import { generateBatch } from "@/lib/khat-map/v2"
import { EMBEDDING_DIMS } from "@/lib/khat-map/learning/embeddings"
import type { EngineAI, RawCandidate } from "@/lib/khat-map/v2/types"

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

function mkCandidate(
  title: string,
  angle_code: string | null,
  domain: RawCandidate["topic"]["topic_domain"] = "philosophy",
): RawCandidate {
  return {
    topic: {
      working_title: title,
      hook: "hook",
      why_matters: "why",
      why_now: "now",
      goal: "goal",
      description: "desc",
      episode_type: "signature_khat",
      topic_domain: domain,
      topic_angle_code: angle_code,
      main_axes: [],
      suggested_questions: [],
      risk_level: "medium",
      effort_level: "medium",
      sponsor_appeal: "medium",
    },
    guest: null,
    editorial_score: 8,
    why_now: "now",
    domain_reasoning: null,
  }
}

async function main() {
  // ─── 1. Role detection — signature + emotional ────────────────────────────
  {
    const accepted = [
      { episode_type: "signature_khat" as const, topic_domain: "philosophy" as const, risk_level: null },
      { episode_type: "personal_story" as const, topic_domain: "relationships" as const, risk_level: null },
    ]
    const satisfied = detectSatisfiedRoles(accepted)
    assert(satisfied.has("signature"), "1. signature_khat satisfies signature")
    assert(satisfied.has("personal"), "1. personal_story satisfies personal")
    assert(
      satisfied.has("emotional"),
      "1. relationships domain satisfies emotional",
    )
    console.log("  ✓ Case 1 — satisfied-role detection recognizes key episodes")
  }

  // ─── 2. Missing roles on empty accepted ───────────────────────────────────
  {
    const missing = detectMissingRoles([])
    assert(missing.length === ALL_ROLES.length, "2. empty season misses all roles")
    console.log("  ✓ Case 2 — empty season reports all 5 roles missing")
  }

  // ─── 3. Prioritization clips to the max slot count ────────────────────────
  {
    const ordered = prioritizeMissingRoles(
      ["signature", "emotional", "kuwait", "personal", "controversial"],
      2,
    )
    assert(ordered.length === 2, "3. clipped to max=2")
    assert(ordered[0] === "signature", "3. signature ranked first")
    assert(ordered[1] === "emotional", "3. emotional ranked second")
    console.log("  ✓ Case 3 — role priority preserves constitution order")
  }

  // ─── 4. Role hint block is non-empty + mentions each role ─────────────────
  {
    const block = buildRoleHintBlock(["emotional", "kuwait"])
    assert(block.length > 0, "4. hint block non-empty")
    assert(block.includes("عاطفية"), "4. block mentions emotional label")
    assert(block.includes("كويتية"), "4. block mentions kuwait label")
    console.log("  ✓ Case 4 — role hint block renders Arabic labels")
  }

  // ─── DB-backed setup: scratch season + scratch angle bank rows ────────────
  const adminId = `smoke-pr4-${Date.now()}`
  const seasonId = crypto.randomUUID()
  await db!.insert(khatMapSeasons).values({
    id: seasonId,
    name: `smoke-v2-pr4-${Date.now()}`,
    season_number: 9994,
    status: "planning",
    created_by: adminId,
    v2_mode: "strict",
    v2_episode_target: 10,
  })

  // Defensive: drop any leftover scratch angles from a prior failed run.
  await db!
    .delete(khatMapTopicBank)
    .where(like(khatMapTopicBank.angle_code, "smoke.pr4.%"))

  // Insert 3 fresh active angles with a run-scoped prefix so parallel
  // runs don't collide on the angle_code unique index.
  const runStamp = Date.now()
  const codePrefix = `smoke.pr4.${runStamp}`
  const angleIds: string[] = []
  for (let i = 0; i < 3; i++) {
    const id = crypto.randomUUID()
    angleIds.push(id)
    await db!.insert(khatMapTopicBank).values({
      id,
      title: `angle ${i}`,
      angle_code: `${codePrefix}.${i}`,
      status: "active",
      freshness: "fresh",
      source: "admin_seeded",
      category: "philosophy",
      tags: [],
    })
  }

  try {
    // ─── 5. listStrictAngleOptions returns fresh rows ─────────────────────────
    {
      const opts = await listStrictAngleOptions(seasonId)
      const codes = new Set(opts.map((o) => o.angle_code))
      for (let i = 0; i < 3; i++) {
        const c = `${codePrefix}.${i}`
        assert(codes.has(c), `5. fresh angle ${c} present`)
      }
      console.log(`  ✓ Case 5 — listStrictAngleOptions returns fresh rows (${opts.length})`)
    }

    // ─── 6. assertStrictBankSufficient throws on exhaustion ───────────────────
    {
      const opts = await listStrictAngleOptions(seasonId)
      // Force exhaustion: require more than what exists (the DB may hold
      // Phase-D seeds alongside our 3 scratch angles).
      const required = opts.length + 5
      let threw: unknown = null
      try {
        assertStrictBankSufficient(opts, required)
      } catch (e) {
        threw = e
      }
      assert(
        threw instanceof AngleBankExhaustedError,
        "6. throws AngleBankExhaustedError",
      )
      assert(
        (threw as AngleBankExhaustedError).code === "ANGLE_BANK_EXHAUSTED",
        "6. error code is ANGLE_BANK_EXHAUSTED",
      )
      console.log(
        `  ✓ Case 6 — AngleBankExhaustedError thrown on shortfall (have ${opts.length}, need ${required})`,
      )
    }

    // ─── 7. Strict post-filter drops disallowed codes ─────────────────────────
    {
      const cands = [
        mkCandidate("good", `${codePrefix}.0`),
        mkCandidate("bad — no code", null),
        mkCandidate("bad — wrong code", "some.other.code"),
        mkCandidate("good", `${codePrefix}.1`),
      ]
      const allowed = new Set([`${codePrefix}.0`, `${codePrefix}.1`])
      const { kept, dropped } = filterByStrictAngles(
        cands.map((c) => ({ topic: { topic_angle_code: c.topic.topic_angle_code } })),
        allowed,
      )
      assert(kept.length === 2, "7. two kept")
      assert(dropped.length === 2, "7. two dropped")
      console.log("  ✓ Case 7 — filterByStrictAngles keeps allowed codes only")
    }

    // ─── 8. buildStrictAngleBlock renders prompt-safe Arabic + codes ──────────
    {
      const opts = await listStrictAngleOptions(seasonId)
      const block = buildStrictAngleBlock(opts, 100)
      assert(
        block.includes(`${codePrefix}.0`),
        "8. block includes angle_code verbatim",
      )
      assert(
        block.includes("STRICT mode") || block.includes("Strict"),
        "8. block flags strict mode",
      )
      console.log("  ✓ Case 8 — strict block renders codes + strict marker")
    }

    // ─── 9. generateBatch with required_roles + stub AI ───────────────────────
    {
      let lastInput: Parameters<EngineAI["generateCandidates"]>[0] | null = null
      const stub: EngineAI = {
        generateCandidates: async (input) => {
          lastInput = input
          // Produce exactly one card per requested count.
          return Array.from({ length: input.target_count }, (_, i) =>
            mkCandidate(`role card ${i}`, null, "emotions_inner_life"),
          )
        },
        analyzeGuest: async () => {
          throw new Error("not used in this case")
        },
        generateGuestAnchoredTopics: async () => [],
        embed: async (t) => fakeEmbed(t.length),
      }
      const res = await generateBatch({
        season_id: seasonId,
        admin_id: adminId,
        size: 2,
        ai: stub,
        mode: "guided",
        required_roles: ["emotional", "kuwait"],
        refresh_taste: false,
      })
      assert(
        lastInput !== null &&
          (lastInput as { extra_system_blocks?: string[] }).extra_system_blocks !==
            undefined,
        "9. extra_system_blocks threaded into LLM input",
      )
      const blocks = (lastInput as { extra_system_blocks: string[] }).extra_system_blocks
      assert(
        blocks.some((b) => b.includes("عاطفية")),
        "9. role block is present in LLM prompt",
      )
      assert(res.cards.length <= 2, "9. returns at most `size` cards")
      console.log(
        "  ✓ Case 9 — required_roles surfaces as prompt block to the LLM",
      )
    }

    // ─── 10. generateBatch in strict mode throws when bank insufficient ───────
    {
      // Force exhaustion by asking for more cards than the bank contains.
      const available = (await listStrictAngleOptions(seasonId)).length
      const impossibleSize = available + 1
      let threw: unknown = null
      const stub: EngineAI = {
        generateCandidates: async () => {
          throw new Error("should not reach LLM")
        },
        analyzeGuest: async () => {
          throw new Error("not used")
        },
        generateGuestAnchoredTopics: async () => [],
        embed: async () => fakeEmbed(1),
      }
      try {
        await generateBatch({
          season_id: seasonId,
          admin_id: adminId,
          size: impossibleSize,
          ai: stub,
          mode: "strict",
          refresh_taste: false,
        })
      } catch (e) {
        threw = e
      }
      assert(
        threw instanceof AngleBankExhaustedError,
        "10. strict + insufficient bank throws AngleBankExhaustedError",
      )
      console.log(
        `  ✓ Case 10 — strict hard-stops BEFORE LLM on exhaustion (asked ${impossibleSize}, have ${available})`,
      )
    }

    // ─── 11. generateBatch in strict mode filters candidates by angle code ────
    {
      let generateCalls = 0
      const stub: EngineAI = {
        generateCandidates: async () => {
          generateCalls++
          // Return a mix: 2 good codes, 2 bad.
          return [
            mkCandidate("strict good 1", `${codePrefix}.0`),
            mkCandidate("strict good 2", `${codePrefix}.1`),
            mkCandidate("strict bad 1", null),
            mkCandidate("strict bad 2", "nonsense"),
          ]
        },
        analyzeGuest: async () => {
          throw new Error("not used")
        },
        generateGuestAnchoredTopics: async () => [],
        embed: async (t) => fakeEmbed(t.length),
      }
      const res = await generateBatch({
        season_id: seasonId,
        admin_id: adminId,
        size: 2,
        ai: stub,
        mode: "strict",
        refresh_taste: false,
      })
      assert(generateCalls === 1, "11. LLM called exactly once")
      for (const c of res.cards) {
        assert(
          c.topic_candidate.topic_angle_code === `${codePrefix}.0` ||
            c.topic_candidate.topic_angle_code === `${codePrefix}.1`,
          "11. only allowed angle_codes survive",
        )
      }
      console.log("  ✓ Case 11 — strict mode filters returned candidates")
    }

    console.log("\n✅ smoke-khat-map-v2-pr4: all 11 cases passed")
  } finally {
    await db!
      .delete(khatMapUserTasteProfile)
      .where(eq(khatMapUserTasteProfile.user_id, adminId))
    for (const id of angleIds) {
      await db!.delete(khatMapTopicBank).where(eq(khatMapTopicBank.id, id))
    }
    await db!.delete(khatMapSeasons).where(eq(khatMapSeasons.id, seasonId))
  }
  process.exit(0)
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
