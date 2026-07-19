/**
 * UX-3a — Episode Workspace skeleton smoke (12 cases).
 *
 *   1. /admin/khat-brain/episodes index page module imports
 *   2. listEpisodeWorkspaceIndex respects filters (phase, q)
 *   3. /admin/khat-brain/episodes/[eirId] page module imports
 *   4. loadEpisodeWorkspace returns full snapshot for a real EIR
 *   5. Tab default-by-phase mapping is exhaustive + sane
 *   6. parseTabKey + computeTabStates behave correctly
 *   7. findEirIdByPreparationId resolves linked + unlinked preps
 *   8. Unimplemented tab placeholders carry safe fallback hrefs
 *   9. /admin/preparation/[id] page reads ?legacy=1 escape hatch
 *  10. Season Workspace accepted-link no longer has the UX-3 placeholder
 *      and no longer references a fallback to /admin/preparation
 *  11. Sidebar Episodes link points at /admin/khat-brain/episodes
 *      (or, fallback, /admin/episodes — i.e. NOT broken)
 *  12. cleanup leaves no smoke rows behind
 *
 * Cleans up its own rows on success.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { sql, eq, like } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
} from "@/lib/db/schema/khat-map"
import { episodePreparations } from "@/lib/db/schema/preparation"
import {
  listEpisodeWorkspaceIndex,
  loadEpisodeWorkspace,
  findEirIdByPreparationId,
} from "@/lib/khat-brain/episode-workspace"
import { ensureEirForCandidate } from "@/lib/khat-brain"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"
import {
  TABS,
  TAB_KEYS,
  computeTabStates,
  defaultTabForPhase,
  parseTabKey,
} from "@/app/admin/khat-brain/episodes/[eirId]/tabs"
import { EPISODE_PHASES } from "@/lib/db/schema/eir"

const TAG = "smoke-ux3a"
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
}

// ─── Cases ────────────────────────────────────────────────────────────

async function caseIndexPageImports() {
  console.log("Case 1 — /admin/khat-brain/episodes page module imports:")
  const mod = await import("@/app/admin/khat-brain/episodes/page")
  assert(typeof mod.default === "function", "default export missing")
  console.log(`  ✓ episodes index module loaded`)
}

async function caseIndexFilters(adminId: string) {
  console.log("\nCase 2 — listEpisodeWorkspaceIndex respects filters:")
  // Seed a minimal scenario.
  const [season] = await db!
    .insert(khatMapSeasons)
    .values({
      name: `${TAG}-season-idx`,
      season_number: null,
      status: "planning",
      target_episode_count: 4,
      v2_mode: "guided",
      created_by: adminId,
    })
    .returning()
  const [guest] = await db!
    .insert(khatMapGuestCandidates)
    .values({
      season_id: season.id,
      status: "approved",
      full_name: `${TAG}-guest-idx`,
      bio: "smoke",
      gender: "unknown",
      public_links: [],
      social_accounts: { website: "https://example.com" },
      evidence_citations: [],
      risk_flags: [],
    })
    .returning()
  const [c] = await db!
    .insert(khatMapEpisodeCandidates)
    .values({
      season_id: season.id,
      status: "approved",
      working_title: `${TAG}-the-quiet-cost-of-arrival`,
      hook: "h",
      why_matters: "w",
      why_now: "n",
      goal: "g",
      description: "d",
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
  const fresh = await getEpisodeCandidateById(c.id)
  assert(fresh, "candidate vanished")
  const { eir } = await ensureEirForCandidate({
    candidate: fresh!,
    guestId: guest.id,
    adminId,
  })

  // Filter by season — should include our EIR.
  const bySeason = await listEpisodeWorkspaceIndex({ seasonId: season.id })
  assert(bySeason.some((r) => r.id === eir.id), "season filter missed seeded EIR")

  // Filter by phase — EIR was created at guest_assigned.
  const byPhase = await listEpisodeWorkspaceIndex({
    seasonId: season.id,
    phase: "guest_assigned",
  })
  assert(byPhase.some((r) => r.id === eir.id), "phase filter missed seeded EIR")

  // q-search by partial title.
  const byQ = await listEpisodeWorkspaceIndex({ q: TAG, limit: 20 })
  assert(byQ.some((r) => r.id === eir.id), "q-search missed seeded EIR")

  console.log(`  ✓ filters work (season + phase + q)`)
  return { eirId: eir.id, seasonId: season.id }
}

async function caseWorkspacePageImports() {
  console.log("\nCase 3 — /admin/khat-brain/episodes/[eirId] page imports:")
  const mod = await import("@/app/admin/khat-brain/episodes/[eirId]/page")
  assert(typeof mod.default === "function", "default export missing")
  console.log(`  ✓ workspace page module loaded`)
}

async function caseLoadWorkspace(eirId: string) {
  console.log("\nCase 4 — loadEpisodeWorkspace returns full snapshot:")
  const snap = await loadEpisodeWorkspace(eirId)
  assert(snap, "snapshot null")
  assert(snap!.eir.id === eirId, "wrong eir id")
  assert(snap!.eir.working_title.startsWith(TAG), "title mismatch")
  assert(typeof snap!.eir.phase === "string", "phase missing")
  assert(snap!.eir.season_name, "season_name missing")
  assert(Array.isArray(snap!.transitions), "transitions not array")
  assert(typeof snap!.has_preparation === "boolean", "has_preparation type")
  // Hybrid provenance is null in this seed (candidate has no JSON).
  console.log(
    `  ✓ snapshot: phase=${snap!.eir.phase}, season=${snap!.eir.season_name}, transitions=${snap!.transitions.length}`,
  )
}

async function caseDefaultTabExhaustive() {
  console.log("\nCase 5 — defaultTabForPhase covers every phase:")
  for (const p of EPISODE_PHASES) {
    const t = defaultTabForPhase(p)
    assert(
      (TAB_KEYS as readonly string[]).includes(t),
      `phase ${p} produced unknown tab ${t}`,
    )
  }
  // Spot-check the documented bias. UX-3a only required topic/guest;
  // UX-3b widens the mapping to cover every phase. Both are accepted.
  assert(defaultTabForPhase("guest_discovery") === "guest", "guest_discovery default wrong")
  assert(defaultTabForPhase("idea") === "topic", "idea default wrong")
  // `published` now maps to `performance` (UX-3b). Accept either the
  // UX-3a fallback (`overview`) or the UX-3b destination (`performance`).
  const publishedDefault = defaultTabForPhase("published")
  assert(
    publishedDefault === "overview" || publishedDefault === "performance",
    `published default unexpected: ${publishedDefault}`,
  )
  console.log(`  ✓ default-by-phase mapping is exhaustive + sane`)
}

async function caseParseAndStates() {
  console.log("\nCase 6 — parseTabKey + computeTabStates:")
  assert(parseTabKey("topic") === "topic", "valid tab not parsed")
  assert(parseTabKey("nope") === null, "invalid tab not rejected")
  assert(parseTabKey(undefined) === null, "undefined not handled")

  // For an EIR at phase=approved, with selected=topic:
  const states = computeTabStates("approved", "topic")
  assert(states.topic === "current", "topic should be current")
  assert(states.overview === "available", "overview should be available")
  assert(states.guest === "available", "guest should be available at approved")
  assert(states.preparation === "available", "preparation tab available at approved")
  assert(states.recording === "unavailable", "recording must be unavailable at approved")
  assert(states.studio === "unavailable", "studio must be unavailable at approved")
  console.log(`  ✓ tab states computed correctly`)
}

async function caseFindEirIdByPreparationId(eirId: string, adminId: string) {
  console.log("\nCase 7 — findEirIdByPreparationId resolves linked + unlinked:")
  // Linked prep: insert a prep row with eir_id set.
  const [linkedPrep] = await db!
    .insert(episodePreparations)
    .values({
      title: `${TAG}-linked`,
      guest_name: `${TAG}-guest`,
      status: "draft",
      eir_id: eirId,
      created_by: adminId,
    })
    .returning({ id: episodePreparations.id })
  // Unlinked prep: no eir_id.
  const [orphanPrep] = await db!
    .insert(episodePreparations)
    .values({
      title: `${TAG}-orphan`,
      guest_name: null,
      status: "draft",
      eir_id: null,
      created_by: adminId,
    })
    .returning({ id: episodePreparations.id })

  const linked = await findEirIdByPreparationId(linkedPrep.id)
  assert(linked === eirId, `expected eirId=${eirId}, got ${linked}`)
  const orphan = await findEirIdByPreparationId(orphanPrep.id)
  assert(orphan === null, `unlinked prep should return null, got ${orphan}`)
  console.log(`  ✓ linked → eir; orphan → null`)
}

async function caseUnimplementedTabFallbacks() {
  console.log("\nCase 8 — tab fallback hrefs are safe:")
  const links = {
    preparation_id: "prep-id-stub",
    studio_session_id: "studio-id-stub",
    studio_video_id: "vid-stub",
    episode_id: "ep-id-stub",
  }
  // Preparation fallback: must point at /admin/preparation/<id> with
  // OR without ?legacy=1 (UX-3a used the bare URL; UX-3b appends
  // ?legacy=1 so the redirect doesn't bounce the operator back).
  const prepHref = TABS.preparation.legacy_fallback_href?.("eir", links)
  assert(
    prepHref === "/admin/preparation/prep-id-stub" ||
      prepHref === "/admin/preparation/prep-id-stub?legacy=1",
    `prep fallback wrong: ${prepHref}`,
  )
  // Studio fallback — there is no /admin/studio/[id] page; the studio
  // opens via the ?video= deep-link (falls back to the list when the
  // session has no video id).
  const studioHref = TABS.studio.legacy_fallback_href?.("eir", links)
  assert(
    studioHref === "/admin/studio?video=vid-stub",
    `studio fallback wrong: ${studioHref}`,
  )
  const audioOnlyHref = TABS.studio.legacy_fallback_href?.("eir", {
    ...links,
    studio_video_id: null,
  })
  assert(
    audioOnlyHref === "/admin/studio",
    `audio-only studio fallback wrong: ${audioOnlyHref}`,
  )
  // Performance always falls back to /admin/analytics
  const perfHref = TABS.performance.legacy_fallback_href?.("eir", links)
  assert(perfHref === "/admin/analytics", `perf fallback wrong: ${perfHref}`)
  // When no linked record exists, fallback returns null cleanly.
  const noLinks = {
    preparation_id: null,
    studio_session_id: null,
    studio_video_id: null,
    episode_id: null,
  }
  assert(TABS.preparation.legacy_fallback_href?.("eir", noLinks) === null, "prep no-link should be null")
  console.log(`  ✓ all tabs have a sensible fallback path`)
}

async function casePrepLegacyEscapeHatch() {
  console.log("\nCase 9 — preparation page reads ?legacy=1 escape hatch:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/preparation/[id]/page.tsx"),
    "utf8",
  )
  assert(
    body.includes(`legacy !== "1"`) || body.includes(`legacy === "1"`),
    "preparation page should branch on ?legacy=1",
  )
  assert(
    body.includes(`findEirIdByPreparationId`),
    "preparation page should look up the EIR id",
  )
  assert(
    body.includes(
      "redirect(`/admin/khat-brain/episodes/${eirId}?tab=preparation`)",
    ) ||
      body.includes(
        'redirect(`/admin/khat-brain/episodes/${eirId}?tab=preparation`)',
      ),
    "preparation page must redirect linked preps to the workspace",
  )
  console.log(`  ✓ legacy escape hatch wired`)
}

async function caseSeasonWorkspaceLinks() {
  console.log("\nCase 10 — Season Workspace accepted links updated:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/seasons/[seasonId]/page.tsx"),
    "utf8",
  )
  // The fallbackHref → /admin/preparation pattern must be gone.
  assert(
    !body.includes("? `/admin/preparation`"),
    "Season workspace still uses the /admin/preparation fallback",
  )
  assert(
    !body.includes(`Episode Workspace) قادمة في UX-3 — حالياً`),
    "Season workspace still shows the UX-3 'coming soon' banner verbatim",
  )
  // The CTA href must now use action.href(...).
  assert(
    body.includes("action.href(phaseInfo.eir_id)"),
    "Season workspace must call action.href(phaseInfo.eir_id) directly",
  )
  console.log(`  ✓ accepted-card CTAs land on the new workspace`)
}

async function caseSidebarEpisodesLink() {
  console.log("\nCase 11 — sidebar Episodes link is wired:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/components/admin-sidebar.tsx"),
    "utf8",
  )
  // UX-3a does not REQUIRE the sidebar to point at the new index, but
  // an "الحلقات" link MUST exist somewhere. Either the legacy
  // /admin/episodes (current state) or the new /admin/khat-brain/episodes
  // is acceptable.
  const hasLink =
    body.includes(`href: "/admin/khat-brain/episodes"`) ||
    body.includes(`href: "/admin/episodes"`)
  assert(hasLink, "sidebar must surface an Episodes link")
  console.log(`  ✓ sidebar exposes an Episodes link`)
}

async function caseCleanupLeavesNothing() {
  console.log("\nCase 12 — cleanup leaves no smoke rows:")
  await cleanup()
  const c = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(khatMapSeasons)
    .where(like(khatMapSeasons.name, `${TAG}%`))
  assert(Number(c[0].c) === 0, `expected 0 seasons, got ${c[0].c}`)
  console.log(`  ✓ zero TAG rows after cleanup`)
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 smoke-khat-brain-ux3a — starting\n")
  await cleanup()
  const adminId = await ensureSmokeAdmin()

  await caseIndexPageImports()
  const { eirId } = await caseIndexFilters(adminId)
  await caseWorkspacePageImports()
  await caseLoadWorkspace(eirId)
  await caseDefaultTabExhaustive()
  await caseParseAndStates()
  await caseFindEirIdByPreparationId(eirId, adminId)
  await caseUnimplementedTabFallbacks()
  await casePrepLegacyEscapeHatch()
  await caseSeasonWorkspaceLinks()
  await caseSidebarEpisodesLink()
  await caseCleanupLeavesNothing()

  console.log("\n✅ smoke-khat-brain-ux3a: all 12 cases passed")
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
