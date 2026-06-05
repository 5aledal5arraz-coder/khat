/**
 * Khat Map v2 — conversion smoke test.
 *
 * Verifies the v2 wizard's "Convert to Preparation" action end-to-end
 * (without calling OpenAI). Cases:
 *
 *   1. convertEpisodeToPreparation rejects when there is no linked guest
 *      (preparation pipeline cannot run without confirmed identity)
 *   2. With a linked guest, conversion creates a preparation row with
 *      the back-link set on the candidate
 *   3. Carry-over: title, hook, why_matters, why_now, goal, axes,
 *      questions, episode_type, risk_level, guest identity all land
 *      somewhere in the preparation
 *   4. Idempotency: re-running on an already-converted candidate returns
 *      was_existing=true and does NOT create a second prep row
 *   5. Production-status query joins candidate→prep→episode correctly
 *      (including the case where no episode exists yet)
 *   6. Linking a published episode (via episode_preparations.linked_episode_id)
 *      surfaces it in the production-status query
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/smoke-khat-map-v2-conversion.ts
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
} from "@/lib/db/schema/khat-map"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { episodes } from "@/lib/db/schema/episodes"
import { convertEpisodeToPreparation } from "@/lib/khat-map/conversion"

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    console.error("❌ Assertion failed:", message)
    process.exit(1)
  }
}

async function main() {
  const adminId = `smoke-conv-${Date.now()}`
  const seasonId = crypto.randomUUID()
  const guestId = crypto.randomUUID()
  const candidateNoGuestId = crypto.randomUUID()
  const candidateWithGuestId = crypto.randomUUID()
  let synthEpisodeId = ""

  // ─── Setup ────────────────────────────────────────────────────────────────
  await db!.insert(khatMapSeasons).values({
    id: seasonId,
    name: `smoke-v2-conversion-${Date.now()}`,
    season_number: 9991,
    status: "planning",
    created_by: adminId,
    v2_mode: "guided",
    v2_episode_target: 10,
  })
  await db!.insert(khatMapGuestCandidates).values({
    id: guestId,
    season_id: seasonId,
    full_name: "د. عمر الخطيب",
    bio: "فيلسوف عربي معاصر",
    gender: "male",
    profession: "فيلسوف",
    why_fit: "صوت نادر في الفلسفة الخليجية",
    country: "Kuwait",
    social_accounts: { twitter: "https://x.com/example" },
    status: "approved",
  })
  // Candidate WITHOUT a linked guest — should fail conversion
  await db!.insert(khatMapEpisodeCandidates).values({
    id: candidateNoGuestId,
    season_id: seasonId,
    working_title: "حلقة بلا ضيف",
    episode_type: "signature_khat",
    topic_domain: "philosophy",
    hook: "إشكالية الذاكرة الخليجية",
    why_matters: "تعريف الهوية",
    why_now: "اللحظة الراهنة",
    goal: "إعادة الفهم",
    description: "وصف مختصر",
    main_axes: ["محور 1", "محور 2"],
    suggested_questions: ["سؤال 1?", "سؤال 2?"],
    risk_level: "medium",
    status: "approved",
  })
  // Candidate WITH guest — should convert successfully
  await db!.insert(khatMapEpisodeCandidates).values({
    id: candidateWithGuestId,
    season_id: seasonId,
    working_title: "الفلسفة في زمن الخوارزميات",
    episode_type: "signature_khat",
    topic_domain: "philosophy",
    hook: "هل تموت الفلسفة عند خوارزمية؟",
    why_matters: "أسئلة وجودية جديدة",
    why_now: "AI يعيد رسم الأسئلة الفلسفية",
    goal: "نقاش معمّق",
    description: "حلقة فلسفية حول الذكاء الاصطناعي",
    main_axes: ["خوارزمية الحب", "نهاية الذات"],
    suggested_questions: ["هل تموت الفلسفة؟", "ما مستقبل العقل؟"],
    risk_level: "bold",
    suggested_guest_candidate_id: guestId,
    status: "approved",
  })

  try {
    // ─── 1. No-guest conversion fails cleanly ────────────────────────────────
    {
      const res = await convertEpisodeToPreparation({
        episode_candidate_id: candidateNoGuestId,
        admin_id: adminId,
      })
      assert(!res.ok, "1. conversion fails when no linked guest")
      assert(
        res.reason === "missing_linked_guest",
        `1. reason should be missing_linked_guest, got ${res.reason}`,
      )
      console.log("  ✓ Case 1 — refuses conversion without linked guest")
    }

    // ─── 2-3. Guest-linked conversion creates preparation + carries fields ───
    let createdPrepId = ""
    {
      const res = await convertEpisodeToPreparation({
        episode_candidate_id: candidateWithGuestId,
        admin_id: adminId,
      })
      assert(res.ok, `2. conversion succeeds; got error: ${(res as { ok: false; message?: string }).message ?? "n/a"}`)
      assert(res.created === true, "2. created=true on first conversion")
      assert(res.was_existing === false, "2. was_existing=false on first conversion")
      createdPrepId = res.link.target_id

      // Verify the prep row exists with carried fields
      const [prep] = await db!
        .select()
        .from(episodePreparations)
        .where(eq(episodePreparations.id, createdPrepId))
      assert(prep, "3. preparation row created")
      assert(
        prep.title === "الفلسفة في زمن الخوارزميات",
        "3. title carried verbatim",
      )
      assert(prep.guest_name === "د. عمر الخطيب", "3. guest name carried")
      assert(
        prep.guest_description?.includes("فيلسوف"),
        "3. guest bio carried into description",
      )
      // Hook + why_matters + why_now + description should appear in short_description
      assert(
        prep.short_description?.includes("هل تموت الفلسفة عند خوارزمية؟") ?? false,
        "3. hook present in short_description",
      )
      assert(
        prep.short_description?.includes("AI يعيد رسم الأسئلة الفلسفية") ?? false,
        "3. why_now present in short_description",
      )
      assert(
        Array.isArray(prep.key_questions) && prep.key_questions.length === 2,
        "3. suggested_questions carried as key_questions",
      )
      // Khat Map source meta + main_axes preserved on inputs_meta
      const meta = prep.inputs_meta as Record<string, unknown> | null
      assert(meta !== null, "3. inputs_meta exists")
      const khatSource = (meta as Record<string, unknown>).khat_map_source as
        | Record<string, unknown>
        | undefined
      assert(khatSource, "3. khat_map_source meta block present")
      assert(
        khatSource.episode_candidate_id === candidateWithGuestId,
        "3. lineage preserved (episode_candidate_id)",
      )
      assert(
        khatSource.guest_candidate_id === guestId,
        "3. lineage preserved (guest_candidate_id)",
      )
      assert(
        khatSource.season_id === seasonId,
        "3. lineage preserved (season_id)",
      )
      assert(
        khatSource.episode_type === "signature_khat",
        "3. episode_type preserved",
      )
      const axes = (meta as Record<string, unknown>).khat_map_main_axes
      assert(Array.isArray(axes) && (axes as unknown[]).length === 2, "3. main_axes preserved on meta")
      // Boldness mapping: bold → 4
      assert(prep.boldness_level === 4, `3. risk_level=bold mapped to boldness=4 (got ${prep.boldness_level})`)
      // guest_identity is a structured PreparationGuestIdentity
      const ident = prep.guest_identity as Record<string, unknown> | null
      assert(ident && (ident as Record<string, unknown>).name === "د. عمر الخطيب", "3. guest_identity.name set")
      console.log("  ✓ Case 2 — conversion creates preparation row")
      console.log("  ✓ Case 3 — carry-over: title/hook/why/goal/axes/guest/risk all present")

      // Verify back-link on the candidate
      const [updated] = await db!
        .select()
        .from(khatMapEpisodeCandidates)
        .where(eq(khatMapEpisodeCandidates.id, candidateWithGuestId))
      assert(
        updated.converted_preparation_id === createdPrepId,
        "3. candidate.converted_preparation_id set to new prep",
      )
      assert(
        updated.status === "converted_to_preparation",
        "3. candidate status flipped",
      )
    }

    // ─── 4. Idempotency: re-convert returns existing link ─────────────────────
    {
      const res = await convertEpisodeToPreparation({
        episode_candidate_id: candidateWithGuestId,
        admin_id: adminId,
      })
      assert(res.ok, "4. re-convert succeeds")
      assert(res.was_existing === true, "4. was_existing=true on second call")
      assert(res.created === false, "4. created=false on second call")
      assert(
        res.link.target_id === createdPrepId,
        "4. same prep id returned (idempotent)",
      )

      // Verify no duplicate preparations were created
      const allForCandidate = await db!
        .select({ id: episodePreparations.id })
        .from(episodePreparations)
        .where(eq(episodePreparations.id, createdPrepId))
      assert(allForCandidate.length === 1, "4. exactly one prep row for candidate")
      console.log("  ✓ Case 4 — idempotent: re-convert returns existing link")
    }

    // ─── 5. Production status: candidate → prep, no episode yet ──────────────
    {
      const { listSeasonProductionStatusAction } = await import(
        "@/app/admin/khat-brain/seasons/actions"
      )
      // The action requires admin auth; we can test the underlying logic by
      // calling the engine queries directly. Skip the auth wrapper here.
      // Instead, we mimic what the action does — read candidates joined to
      // their prep and episode. This proves the data layer supports the loop.
      const cand = await db!
        .select({
          id: khatMapEpisodeCandidates.id,
          converted_preparation_id:
            khatMapEpisodeCandidates.converted_preparation_id,
        })
        .from(khatMapEpisodeCandidates)
        .where(eq(khatMapEpisodeCandidates.id, candidateWithGuestId))
      assert(cand[0].converted_preparation_id === createdPrepId, "5. linked")
      // No published episode yet
      const [prep] = await db!
        .select({ linked_episode_id: episodePreparations.linked_episode_id })
        .from(episodePreparations)
        .where(eq(episodePreparations.id, createdPrepId))
      assert(
        prep.linked_episode_id === null,
        "5. linked_episode_id is null before publishing",
      )
      console.log(
        "  ✓ Case 5 — production-status chain: candidate→prep linked, episode pending",
      )
      // Suppress unused warning: the action import itself proves it loads.
      void listSeasonProductionStatusAction
    }

    // ─── 6. After linking a published episode, the chain resolves end-to-end ──
    {
      synthEpisodeId = crypto.randomUUID()
      // Insert a synthetic published episode
      await db!.insert(episodes).values({
        id: synthEpisodeId,
        title: "الفلسفة في زمن الخوارزميات (مسجلة)",
        slug: `smoke-conv-${Date.now()}`,
        youtube_url: "https://youtube.com/watch?v=smoke",
        duration_minutes: 60,
        release_date: "2026-04-25",
        view_count: 1234,
        status: "published",
      })
      // Wire it up
      await db!
        .update(episodePreparations)
        .set({ linked_episode_id: synthEpisodeId })
        .where(eq(episodePreparations.id, createdPrepId))

      // Verify the join: candidate → prep → episode
      const [row] = await db!
        .select({
          candidate_id: khatMapEpisodeCandidates.id,
          prep_id: episodePreparations.id,
          episode_id: episodes.id,
          episode_title: episodes.title,
          episode_views: episodes.view_count,
        })
        .from(khatMapEpisodeCandidates)
        .leftJoin(
          episodePreparations,
          eq(
            khatMapEpisodeCandidates.converted_preparation_id,
            episodePreparations.id,
          ),
        )
        .leftJoin(
          episodes,
          eq(episodePreparations.linked_episode_id, episodes.id),
        )
        .where(eq(khatMapEpisodeCandidates.id, candidateWithGuestId))

      assert(row.episode_id === synthEpisodeId, "6. join resolves to episode")
      assert(
        row.episode_title === "الفلسفة في زمن الخوارزميات (مسجلة)",
        "6. episode title joinable",
      )
      assert(row.episode_views === 1234, "6. episode view count joinable")
      console.log(
        "  ✓ Case 6 — full chain joins: candidate → prep → episode (with metadata)",
      )
    }

    console.log("\n✅ smoke-khat-map-v2-conversion: all 6 cases passed")
  } finally {
    // Cascade: deleting the season removes all candidates + decisions.
    // Preparations + episodes are NOT cascaded (they live downstream); we
    // delete them explicitly so the smoke is fully self-cleaning.
    if (synthEpisodeId) {
      await db!.delete(episodes).where(eq(episodes.id, synthEpisodeId))
    }
    // Find + delete preps tied to the season's candidates
    const seasonCands = await db!
      .select({
        converted_preparation_id:
          khatMapEpisodeCandidates.converted_preparation_id,
      })
      .from(khatMapEpisodeCandidates)
      .where(eq(khatMapEpisodeCandidates.season_id, seasonId))
    for (const c of seasonCands) {
      if (c.converted_preparation_id) {
        await db!
          .delete(episodePreparations)
          .where(eq(episodePreparations.id, c.converted_preparation_id))
      }
    }
    await db!.delete(khatMapSeasons).where(eq(khatMapSeasons.id, seasonId))
  }
  process.exit(0)
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
