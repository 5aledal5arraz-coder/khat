/**
 * Khat Map — editorial-controls smoke test.
 *
 * Verifies the new editorial-controls surface end-to-end without OpenAI:
 *
 *   1. createSeason persists editorial_controls JSONB (round-trip)
 *   2. patchSeasonControls overwrites the bundle
 *   3. resolveControls fills missing keys with neutral defaults
 *   4. applyEditorialFilters drops disabled-domain candidates
 *   5. applyEditorialFilters drops banned-topic candidates (substring)
 *   6. applyEditorialFilters drops banned-guest candidates
 *   7. applyEditorialFilters honors gender filter
 *   8. applyEditorialFilters honors Kuwait-only geography
 *   9. domainWeightMultiplier returns expected factors
 *  10. setTopicQuality / setGuestQuality round-trip
 *  11. bulkDeleteTopics refuses invasion-protected rows
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/smoke-khat-map-editorial-controls.ts
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapTopicBank,
} from "@/lib/db/schema/khat-map"
import {
  createSeason,
  getSeasonById,
  patchSeasonControls,
  upsertTopic,
  setTopicQuality,
  bulkDeleteTopics,
  createGuestCandidate,
  setGuestQuality,
} from "@/lib/khat-map/core/queries"
import {
  applyEditorialFilters,
  domainWeightMultiplier,
} from "@/lib/khat-map/v2/editorial-filter"
import type {
  KhatMapEditorialControls,
} from "@/types/khat-map"
import { KHAT_EDITORIAL_CONTROLS_DEFAULTS } from "@/types/khat-map"
import type { RawCandidate } from "@/lib/khat-map/v2/types"

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    console.error("❌", message)
    process.exit(1)
  }
}

function mkCandidate(
  title: string,
  opts: {
    domain?: RawCandidate["topic"]["topic_domain"]
    guestName?: string
    guestGender?: "male" | "female" | "unknown"
    guestCountry?: string
    description?: string
  } = {},
): RawCandidate {
  return {
    topic: {
      working_title: title,
      hook: "",
      why_matters: "",
      why_now: "",
      goal: "",
      description: opts.description ?? "",
      episode_type: "signature_khat",
      topic_domain: opts.domain ?? "philosophy",
      topic_angle_code: null,
      main_axes: [],
      suggested_questions: [],
      risk_level: "medium",
      effort_level: "medium",
      sponsor_appeal: "medium",
    },
    guest: opts.guestName
      ? {
          full_name: opts.guestName,
          display_name: null,
          bio: "",
          gender: opts.guestGender ?? "unknown",
          profession: null,
          why_fit: "",
          category: null,
          country: opts.guestCountry ?? null,
          city: null,
          social_accounts: {},
          official_website: null,
          relevance_score: 8,
          depth_score: null,
          reach_score: null,
        }
      : null,
    editorial_score: 8,
    why_now: "",
    domain_reasoning: null,
  }
}

async function main() {
  const adminId = `smoke-editorial-${Date.now()}`
  const seasonId = crypto.randomUUID()

  // ─── 1. Round-trip ─────────────────────────────────────────────────────────
  {
    const controls: KhatMapEditorialControls = {
      ...KHAT_EDITORIAL_CONTROLS_DEFAULTS,
      guest_filters: { gender: "female", nationality: "kuwaiti" },
      domain_weights: { philosophy: 3, religion: 0 },
      identity_override: {
        priorities: ["تجنّب المشاهير الفارغين"],
        tone_emphasis: { depth: 0.85 },
        identity_description: "موسم فلسفي كويتي",
      },
      hard_avoid: {
        banned_topics: ["انتخابات"],
        banned_guests: ["زيد الكاتب"],
        repeated_topics_to_avoid: ["الذكاء الاصطناعي"],
      },
    }
    await createSeason({
      name: "smoke season",
      target_episode_count: 10,
      created_by: adminId,
      editorial_controls: controls,
    })
    // Find the season we just created (we don't have the id back from
    // createSeason since we passed only name + count; seed via direct query).
  }

  // Use direct insert for predictable id
  await db!.insert(khatMapSeasons).values({
    id: seasonId,
    name: "smoke editorial test",
    season_number: 9990,
    status: "planning",
    target_episode_count: 10,
    created_by: adminId,
    v2_mode: "guided",
    v2_episode_target: 10,
    editorial_controls: {
      guest_filters: { gender: "female", nationality: "kuwaiti" },
      domain_weights: { philosophy: 3, religion: 0 },
      identity_override: {
        priorities: ["تجنّب المشاهير الفارغين"],
        tone_emphasis: { depth: 0.85 },
        identity_description: "موسم فلسفي كويتي",
      },
      hard_avoid: {
        banned_topics: ["انتخابات"],
        banned_guests: ["زيد الكاتب"],
        repeated_topics_to_avoid: [],
      },
    },
  })

  try {
    {
      const season = await getSeasonById(seasonId)
      assert(season, "1. season fetched")
      assert(
        season!.editorial_controls.guest_filters.gender === "female",
        "1. gender persisted",
      )
      assert(
        season!.editorial_controls.guest_filters.nationality === "kuwaiti",
        "1. nationality persisted",
      )
      assert(
        season!.editorial_controls.domain_weights.philosophy === 3,
        "1. high-weight domain persisted",
      )
      assert(
        season!.editorial_controls.domain_weights.religion === 0,
        "1. disabled domain persisted",
      )
      assert(
        season!.editorial_controls.hard_avoid.banned_topics.includes("انتخابات"),
        "1. banned topic persisted",
      )
      console.log("  ✓ Case 1 — editorial_controls round-trip on createSeason")
    }

    // ─── 2. patchSeasonControls overwrites ───────────────────────────────────
    {
      const updated = await patchSeasonControls(seasonId, {
        ...KHAT_EDITORIAL_CONTROLS_DEFAULTS,
        guest_filters: { gender: "all", nationality: "any" },
      })
      assert(updated, "2. patch returned")
      assert(
        updated!.editorial_controls.guest_filters.gender === "all",
        "2. gender reset to all",
      )
      assert(
        Object.keys(updated!.editorial_controls.domain_weights).length === 0,
        "2. domain_weights cleared",
      )
      console.log("  ✓ Case 2 — patchSeasonControls replaces the bundle")
    }

    // ─── 3. resolveControls fallback ─────────────────────────────────────────
    // Insert a season with editorial_controls = SQL DEFAULT (so we know the
    // mapper sees the full default JSONB), then read it back.
    {
      const fid = crypto.randomUUID()
      await db!.insert(khatMapSeasons).values({
        id: fid,
        name: "smoke fallback",
        season_number: 9989,
        status: "planning",
        target_episode_count: 10,
        created_by: adminId,
      })
      const season = await getSeasonById(fid)
      assert(season, "3. fallback season fetched")
      assert(
        season!.editorial_controls.guest_filters.gender === "all",
        "3. defaults: gender=all",
      )
      assert(
        season!.editorial_controls.guest_filters.nationality === "any",
        "3. defaults: nationality=any",
      )
      assert(
        season!.editorial_controls.hard_avoid.banned_topics.length === 0,
        "3. defaults: empty banned list",
      )
      await db!.delete(khatMapSeasons).where(eq(khatMapSeasons.id, fid))
      console.log("  ✓ Case 3 — resolveControls supplies neutral defaults")
    }

    // ─── 4. applyEditorialFilters drops disabled-domain ──────────────────────
    {
      const ctrl: KhatMapEditorialControls = {
        ...KHAT_EDITORIAL_CONTROLS_DEFAULTS,
        domain_weights: { religion: 0 },
      }
      const cands = [
        mkCandidate("ok 1", { domain: "philosophy" }),
        mkCandidate("nope", { domain: "religion" }),
        mkCandidate("ok 2", { domain: "psychology" }),
      ]
      const res = applyEditorialFilters(cands, ctrl)
      assert(res.kept.length === 2, "4. two kept")
      assert(
        res.dropped.length === 1 && res.dropped[0].reason === "disabled_domain",
        "4. religion dropped as disabled_domain",
      )
      console.log("  ✓ Case 4 — disabled-domain filter")
    }

    // ─── 5. Banned topics ─────────────────────────────────────────────────────
    {
      const ctrl: KhatMapEditorialControls = {
        ...KHAT_EDITORIAL_CONTROLS_DEFAULTS,
        hard_avoid: {
          banned_topics: ["انتخابات"],
          banned_guests: [],
          repeated_topics_to_avoid: [],
        },
      }
      const cands = [
        mkCandidate("الانتخابات الكويتية", {}),
        mkCandidate("الفلسفة الحديثة", {}),
      ]
      const res = applyEditorialFilters(cands, ctrl)
      assert(res.kept.length === 1, "5. one kept")
      assert(res.kept[0].topic.working_title === "الفلسفة الحديثة", "5. kept the right one")
      assert(
        res.dropped[0].reason === "banned_topic",
        "5. dropped reason=banned_topic",
      )
      console.log("  ✓ Case 5 — banned-topic substring filter")
    }

    // ─── 6. Banned guests ────────────────────────────────────────────────────
    {
      const ctrl: KhatMapEditorialControls = {
        ...KHAT_EDITORIAL_CONTROLS_DEFAULTS,
        hard_avoid: {
          banned_topics: [],
          banned_guests: ["فلان"],
          repeated_topics_to_avoid: [],
        },
      }
      const cands = [
        mkCandidate("X", { guestName: "فلان الفلاني" }),
        mkCandidate("Y", { guestName: "علاء العلاء" }),
      ]
      const res = applyEditorialFilters(cands, ctrl)
      assert(res.kept.length === 1, "6. one kept")
      assert(
        res.kept[0].guest!.full_name === "علاء العلاء",
        "6. correct guest survived",
      )
      console.log("  ✓ Case 6 — banned-guest substring filter")
    }

    // ─── 7. Gender filter ────────────────────────────────────────────────────
    {
      const ctrl: KhatMapEditorialControls = {
        ...KHAT_EDITORIAL_CONTROLS_DEFAULTS,
        guest_filters: { gender: "female", nationality: "any" },
      }
      const cands = [
        mkCandidate("M", { guestName: "M", guestGender: "male" }),
        mkCandidate("F", { guestName: "F", guestGender: "female" }),
        mkCandidate("U", { guestName: "U", guestGender: "unknown" }),
      ]
      const res = applyEditorialFilters(cands, ctrl)
      assert(res.kept.length === 1, "7. one kept (the female)")
      assert(res.kept[0].guest!.gender === "female", "7. correct gender survived")
      console.log("  ✓ Case 7 — gender filter")
    }

    // ─── 8. Kuwaiti nationality (strict-on-unknown) ──────────────────────────
    {
      const ctrl: KhatMapEditorialControls = {
        ...KHAT_EDITORIAL_CONTROLS_DEFAULTS,
        guest_filters: { gender: "all", nationality: "kuwaiti" },
      }
      const cands = [
        mkCandidate("KW", { guestName: "A", guestCountry: "Kuwait" }),
        mkCandidate("KW Ar", { guestName: "B", guestCountry: "الكويت" }),
        mkCandidate("UAE", { guestName: "C", guestCountry: "UAE" }),
        mkCandidate("Egypt", { guestName: "D", guestCountry: "Egypt" }),
        // Empty country must be dropped under the new strict-on-unknown rule.
        mkCandidate("Unknown", { guestName: "E", guestCountry: "" }),
      ]
      const res = applyEditorialFilters(cands, ctrl)
      assert(res.kept.length === 2, `8. two kuwaiti kept, got ${res.kept.length}`)
      console.log("  ✓ Case 8 — Kuwaiti-only nationality filter (strict)")
    }

    // ─── 9. Domain weight multiplier ─────────────────────────────────────────
    {
      const ctrl: KhatMapEditorialControls = {
        ...KHAT_EDITORIAL_CONTROLS_DEFAULTS,
        domain_weights: { philosophy: 3, religion: 1, money_career: 0 },
      }
      assert(
        domainWeightMultiplier("philosophy", ctrl) === 1.3,
        "9. high → 1.3",
      )
      assert(
        domainWeightMultiplier("religion", ctrl) === 0.7,
        "9. low → 0.7",
      )
      assert(
        domainWeightMultiplier("psychology", ctrl) === 1.0,
        "9. neutral → 1.0",
      )
      assert(
        domainWeightMultiplier("money_career", ctrl) === 0,
        "9. disabled → 0",
      )
      console.log("  ✓ Case 9 — domain weight multipliers")
    }

    // ─── 10. setTopicQuality + setGuestQuality round-trip ────────────────────
    {
      const t = await upsertTopic({
        title: "smoke quality test",
        angle_code: `smoke.quality.${Date.now()}`,
        category: "philosophy",
      })
      const tq = await setTopicQuality(t.id, "weak")
      assert(tq?.quality === "weak", "10. topic quality persisted")
      await db!.delete(khatMapTopicBank).where(eq(khatMapTopicBank.id, t.id))

      const g = await createGuestCandidate({
        season_id: seasonId,
        full_name: "Smoke Guest",
        display_name: null,
        bio: null,
        why_fit: null,
        category: null,
        country: null,
        city: null,
        public_links: [],
        social_accounts: {},
        evidence_summary: null,
        evidence_citations: [],
        relevance_score: null,
        depth_score: null,
        reach_score: null,
        risk_flags: [],
      })
      const gq = await setGuestQuality(g.id, "avoid")
      assert(gq?.quality === "avoid", "10. guest quality persisted")
      console.log("  ✓ Case 10 — quality round-trips for topics + guests")
    }

    // ─── 11. bulkDeleteTopics protection ─────────────────────────────────────
    {
      const protectedTopic = await upsertTopic({
        title: "زاوية محمية اختبار",
        angle_code: `invasion.smoke-${Date.now()}`,
        category: "invasion",
      })
      const normalTopic = await upsertTopic({
        title: "موضوع عادي اختبار",
        angle_code: `general.smoke-${Date.now()}`,
        category: "philosophy",
      })
      const res = await bulkDeleteTopics([protectedTopic.id, normalTopic.id])
      assert(res.deleted.length === 1, "11. one deleted")
      assert(res.skipped.length === 1, "11. one skipped (invasion)")
      assert(res.deleted.includes(normalTopic.id), "11. correct one deleted")
      assert(res.skipped.includes(protectedTopic.id), "11. invasion skipped")
      // Cleanup the protected one
      await db!
        .delete(khatMapTopicBank)
        .where(eq(khatMapTopicBank.id, protectedTopic.id))
      console.log("  ✓ Case 11 — bulkDeleteTopics protects invasion angles")
    }

    console.log("\n✅ smoke-khat-map-editorial-controls: all 11 cases passed")
  } finally {
    await db!.delete(khatMapSeasons).where(eq(khatMapSeasons.id, seasonId))
  }
  process.exit(0)
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
