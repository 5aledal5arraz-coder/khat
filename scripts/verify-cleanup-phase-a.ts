/**
 * Cleanup Phase A — verification script.
 *
 *   1. PREP_V2 default-on: candidate→preparation conversion produces
 *      prep_v2 without setting any env flag (the new default).
 *   2. Manual guest create through createGuest() does NOT duplicate an
 *      existing guest by name.
 *   3. Sidebar component compiles and exports the Khat Brain group.
 *
 * Cleans up its own rows on success.
 */

import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
} from "@/lib/db/schema/khat-map"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { guests } from "@/lib/db/schema/guests"
import { guestIdentityProfiles } from "@/lib/db/schema/guest-identity"
import { convertEpisodeToPreparation } from "@/lib/khat-map/conversion/to-preparation"
import { ensureEirForCandidate } from "@/lib/khat-brain"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"
import { createGuest } from "@/lib/admin/queries"
import { ensureGuest } from "@/lib/guests/canonical"

const TAG = "verify-phaseA"

function ok(msg: string) {
  console.log(`  ✓ ${msg}`)
}
function bad(msg: string): never {
  console.error(`\n❌ ${msg}`)
  process.exit(1)
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
  await db!.execute(sql`
    DELETE FROM guest_identity_profiles WHERE guest_id IN
      (SELECT id FROM guests WHERE name LIKE ${TAG + "%"} OR slug LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM guests WHERE name LIKE ${TAG + "%"} OR slug LIKE ${TAG + "%"}
  `)
}

// ─── Case 1: PREP_V2 default-on through conversion ───────────────────

async function caseConversionTriggersPrepV2(adminId: string) {
  console.log("\nCase 1 — conversion triggers prep_v2 by default (no flag set):")

  // Make sure no opt-out flag is in effect for this run.
  const saved = process.env.PREP_V2_ENABLED
  delete process.env.PREP_V2_ENABLED

  if (!process.env.OPENAI_API_KEY) {
    console.log("  · OPENAI_API_KEY not set; skipping live AI run for this case")
    if (saved) process.env.PREP_V2_ENABLED = saved
    return
  }

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
    .returning()
  const [guest] = await db!
    .insert(khatMapGuestCandidates)
    .values({
      season_id: season.id,
      status: "approved",
      full_name: `${TAG}-guest`,
      bio: "verify",
      gender: "unknown",
      public_links: [],
      social_accounts: { website: "https://example.com" },
      evidence_citations: [],
      risk_flags: [],
    })
    .returning()
  const [cand] = await db!
    .insert(khatMapEpisodeCandidates)
    .values({
      season_id: season.id,
      status: "approved",
      working_title: `${TAG}-the-quiet-cost-of-arrival`,
      hook: "the moment the room stops feeling like yours",
      why_matters:
        "we promise people a destination and forget to warn them about the silence afterwards",
      why_now:
        "a generation chasing arrival is meeting the loneliness of having arrived",
      goal: "explore the cost of success at the level of self, not status",
      description: "single-arc deep-dive episode",
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
  const fresh = await getEpisodeCandidateById(cand.id)
  if (!fresh) bad("candidate vanished")
  await ensureEirForCandidate({
    candidate: fresh!,
    guestId: guest.id,
    adminId,
  })

  const conv = await convertEpisodeToPreparation({
    episode_candidate_id: cand.id,
    admin_id: adminId,
  })
  if (!conv.ok) bad(`conversion failed: ${conv.reason}`)
  const prepId = conv.link!.target_id

  const [row] = await db!
    .select({ prep_v2: episodePreparations.prep_v2 })
    .from(episodePreparations)
    .where(eq(episodePreparations.id, prepId))
    .limit(1)
  if (!row.prep_v2) {
    bad("prep_v2 NOT populated — default-on path is broken")
  }
  const payload = row.prep_v2 as { episode_sections: unknown[]; question_bank: unknown[] }
  if (payload.episode_sections.length !== 6) {
    bad(`prep_v2 sections wrong shape: ${payload.episode_sections.length}`)
  }
  if (payload.question_bank.length < 24) {
    bad(`prep_v2 question_bank too small: ${payload.question_bank.length}`)
  }
  ok(
    `conversion produced prep_v2 with ${payload.episode_sections.length} sections + ${payload.question_bank.length} questions`,
  )

  if (saved) process.env.PREP_V2_ENABLED = saved
}

// ─── Case 2: createGuest dedup via ensureGuest ────────────────────────

async function caseCreateGuestDedup() {
  console.log("\nCase 2 — manual createGuest goes through ensureGuest:")

  // Seed an existing guest via ensureGuest (the canonical entry point).
  const seed = await ensureGuest({
    name: `${TAG}-Existing Guest Person`,
    bio: "seeded for dedup test",
  })
  if (!seed.created) bad("seed guest should have been created")
  ok(`seeded guest ${seed.guest_id.slice(0, 8)}`)

  // Now call createGuest with the same name + a similar slug. The new
  // path should detect the existing guest and NOT create a duplicate.
  const r = await createGuest({
    name: `${TAG}-Existing Guest Person`,
    slug: `${TAG}-existing-guest-person-collision`,
    bio: null,
    photo_url: null,
    testimonial: null,
    external_links: {},
  })
  if (!r.success) bad(`createGuest failed: ${r.error}`)
  if (r.existing !== true) {
    bad("createGuest should have returned existing=true; instead created a new guest")
  }
  if (r.data?.id !== seed.guest_id) {
    bad(`createGuest returned a different guest id (${r.data?.id} vs ${seed.guest_id})`)
  }
  ok("createGuest reused the existing guest (no duplicate)")

  // Verify only ONE row exists with that name.
  const rows = await db!
    .select({ id: guests.id })
    .from(guests)
    .where(eq(guests.name, `${TAG}-Existing Guest Person`))
  if (rows.length !== 1) {
    bad(`expected exactly 1 row with that name, got ${rows.length}`)
  }
  ok("DB confirms exactly one row")

  // Verify guest_identity_profiles row exists for that guest.
  const profiles = await db!
    .select({ id: guestIdentityProfiles.id })
    .from(guestIdentityProfiles)
    .where(eq(guestIdentityProfiles.guest_id, seed.guest_id))
  if (profiles.length !== 1) {
    bad(`expected 1 identity profile, got ${profiles.length}`)
  }
  ok("guest_identity_profiles row present")
}

// ─── Case 3: Sidebar component exports the Khat Brain group ──────────

async function caseSidebarHasKhatBrain() {
  console.log("\nCase 3 — admin sidebar surfaces Khat Brain group:")
  const fs = await import("node:fs/promises")
  const body = await fs.readFile(
    `${process.cwd()}/app/admin/components/admin-sidebar.tsx`,
    "utf8",
  )
  if (!body.includes(`title: "Khat Brain"`)) {
    bad("Sidebar does not declare a Khat Brain nav group")
  }
  // UX-1: Command Center moved from /admin/khat-brain/command (Phase A
  // location) to /admin/khat-brain (the new home). Accept either.
  const hasCommandHref =
    body.includes(`href: "/admin/khat-brain"`) ||
    body.includes(`href: "/admin/khat-brain/command"`)
  if (!hasCommandHref) {
    bad("Sidebar Khat Brain group missing Command Center link")
  }
  if (!body.includes(`/admin/khat-brain/original-thinking`)) {
    bad("Sidebar Khat Brain group missing Original Thinking link")
  }
  if (!body.includes(`/admin/discovery`)) {
    bad("Sidebar Khat Brain group missing Discovery link")
  }
  ok("Sidebar declares Khat Brain group with command + original-thinking + discovery")
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🔎 verify-cleanup-phase-a — starting")
  await cleanup()
  const adminId = await ensureSmokeAdmin()

  await caseConversionTriggersPrepV2(adminId)
  await caseCreateGuestDedup()
  await caseSidebarHasKhatBrain()

  await cleanup()
  console.log("\n✅ Cleanup Phase A — verification passed")
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("\n💥 verification failed:", err)
    try {
      await cleanup()
    } catch {}
    process.exit(1)
  })
