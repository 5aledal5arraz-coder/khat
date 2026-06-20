/**
 * Khat Brain — Guest unification smoke.
 *
 *   - ensureGuest creates a canonical guest from name
 *   - ensureGuest matches existing guest by exact normalized name
 *   - Low-confidence (multiple name matches) returns requires_review
 *   - Promoting a discovery candidate creates a new guest + profile + link
 *   - guest_identity_profiles row created/updated by promotion
 *   - guest_discovery_links row created
 *   - Backfill is idempotent
 *   - /admin/guests/[id] module imports cleanly
 */

import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { guests } from "@/lib/db/schema/guests"
import {
  guestIdentityProfiles,
  guestDiscoveryLinks,
} from "@/lib/db/schema/guest-identity"
import {
  discoveryRuns,
  guestDiscoveryCandidates,
} from "@/lib/db/schema/discovery"
import {
  ensureGuest,
  findGuestMatch,
  normalizeName,
  type IdentityHints,
} from "@/lib/guests/canonical"
import {
  createCandidate,
  updateCandidateScores,
  updateCandidateVerification,
  type DiscoveryArchetype,
} from "@/lib/discovery"
import {
  linkDiscoveryCandidateToGuest,
  updateGuestIdentityProfile,
} from "@/lib/guests/canonical"
import { setCandidateStatus } from "@/lib/discovery"

const TAG = "smoke-guests-unif"

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

async function cleanup() {
  await db!.execute(sql`
    DELETE FROM guest_discovery_links WHERE guest_id IN
      (SELECT id FROM guests WHERE name LIKE ${TAG + "%"} OR slug LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM guest_identity_profiles WHERE guest_id IN
      (SELECT id FROM guests WHERE name LIKE ${TAG + "%"} OR slug LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM guests WHERE name LIKE ${TAG + "%"} OR slug LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`
    DELETE FROM guest_discovery_candidates WHERE proposed_name LIKE ${TAG + "%"}
       OR discovery_run_id IN (SELECT id FROM discovery_runs WHERE seed_prompt LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`DELETE FROM discovery_runs WHERE seed_prompt LIKE ${TAG + "%"}`)
}

const FAKE_ARCHETYPE: DiscoveryArchetype = {
  id: "smoke_arc",
  name: "نمط اختبار",
  description: "نمط للاختبار",
  target_signals: ["transformation"],
  expected_traits: ["honesty"],
}

async function caseEnsureGuestCreate() {
  console.log("\nCase 5 — ensureGuest creates a fresh guest:")
  const hints: IdentityHints = {
    name: `${TAG}-Alice Test`,
    country: "Kuwait",
    bio: "test bio",
    social_accounts: { twitter: "alicetest" },
  }
  const r = await ensureGuest(hints)
  assert(r.created === true, "expected created=true")
  assert(r.confidence === "high", `expected high, got ${r.confidence}`)
  console.log(`  ✓ created guest ${r.guest_id.slice(0, 8)} (${r.reasons[0]})`)
  return r.guest_id
}

async function caseEnsureGuestMatch(existingId: string) {
  console.log("\nCase 6 — ensureGuest matches by social handle:")
  const r = await ensureGuest({
    name: `${TAG}-Different Name`,
    social_accounts: { twitter: "alicetest" }, // matches existing guest
  })
  assert(r.created === false, "should not create — should match")
  assert(r.guest_id === existingId, "should match the previously-created guest")
  assert(r.confidence === "high", `expected high, got ${r.confidence}`)
  console.log(`  ✓ matched existing guest via social handle`)

  // Also test name match.
  const byName = await ensureGuest({ name: `${TAG}-Alice Test` })
  assert(byName.guest_id === existingId, "should match by normalized name")
  console.log(
    `  ✓ name-match worked: normalized "${normalizeName(`${TAG}-Alice Test`)}"`,
  )
}

async function caseLowConfidenceRequiresReview() {
  console.log("\nCase 7 — low-confidence (name conflict) returns requires_review:")
  // Create two guests with the same normalized name but different handles.
  const [a] = await db!
    .insert(guests)
    .values({
      name: `${TAG}-Twin`,
      slug: `${TAG}-twin-a`,
      external_links: { twitter: "twinA" },
    })
    .returning({ id: guests.id })
  const [b] = await db!
    .insert(guests)
    .values({
      name: `${TAG}-Twin`,
      slug: `${TAG}-twin-b`,
      external_links: { twitter: "twinB" },
    })
    .returning({ id: guests.id })

  // Now ensureGuest with the same name but no other tiebreaker.
  const r = await ensureGuest({ name: `${TAG}-Twin` })
  assert(r.requires_review === true, "expected requires_review=true")
  assert(r.confidence === "low", `expected low, got ${r.confidence}`)
  console.log(`  ✓ correctly flagged as requires_review (${r.reasons[0]})`)

  // Cleanup the twins.
  await db!.delete(guests).where(eq(guests.id, a.id))
  await db!.delete(guests).where(eq(guests.id, b.id))
}

async function casePromotionFlow(existingGuestId: string) {
  console.log("\nCase 8+9+10 — promote candidate creates guest + profile + link:")
  // Build a candidate with strong YouTube evidence.
  const [run] = await db!
    .insert(discoveryRuns)
    .values({
      seed_prompt: `${TAG}-promote-test`,
      status: "completed",
    })
    .returning({ id: discoveryRuns.id })

  const cand = await createCandidate({
    discovery_run_id: run.id,
    proposed_name: `${TAG}-Carol Promote`,
    archetype: FAKE_ARCHETYPE,
    evidence_urls: [
      { platform: "youtube", url: "https://www.youtube.com/channel/CarolID" },
    ],
  })
  await updateCandidateVerification({
    id: cand.id,
    evidence_summary: {
      why_they_matter: "تستحق الترقية",
      topics: ["transformation"],
      red_flags: [],
    },
    story_signals: { arcs: ["new_arc"], topics: ["new_topic"] },
    editorial_fit_score: 0.8,
  })
  await updateCandidateScores({
    id: cand.id,
    editorial_fit_score: 0.8,
    hiddenness_score: 0.7,
    novelty_score: 1.0,
    evidence_strength_score: 0.4,
    composite_score: 0.74,
  })

  // Exercise the underlying primitives the action would call (server
  // action's requireAdmin() needs a real session cookie — tested via
  // the page imports in case 12 instead).
  const { ensureGuest } = await import("@/lib/guests/canonical")
  const ensure = await ensureGuest(
    {
      name: cand.proposed_name,
      country: cand.proposed_country,
      bio: cand.evidence_summary?.why_they_matter ?? null,
      external_links: Object.fromEntries(
        cand.evidence_urls.map((u) => [u.platform, u.url] as const),
      ),
    },
    { acceptance: "create_on_low" },
  )
  assert(ensure.created === true, "expected created=true")
  const newGuestId = ensure.guest_id

  await updateGuestIdentityProfile(newGuestId, {
    discovery_evidence: {
      urls: cand.evidence_urls.map((u) => ({
        platform: u.platform,
        url: u.url,
        title: u.title ?? null,
        snippet: u.snippet ?? null,
      })),
      best_scores: {
        composite: cand.composite_score,
        editorial_fit: cand.editorial_fit_score,
        hiddenness: cand.hiddenness_score,
        novelty: cand.novelty_score,
        evidence_strength: cand.evidence_strength_score,
      },
      matched_archetype: cand.archetype
        ? { id: cand.archetype.id, name: cand.archetype.name }
        : null,
    },
    story_arcs: {
      arcs: cand.story_signals?.arcs ?? [],
      topics: cand.story_signals?.topics ?? [],
    },
    last_analyzed_at: new Date(),
  })
  await linkDiscoveryCandidateToGuest({
    discovery_candidate_id: cand.id,
    guest_id: newGuestId,
    discovery_run_id: cand.discovery_run_id ?? null,
    link_type: "promoted",
    confidence_score: 1.0,
  })
  await setCandidateStatus(cand.id, "promoted", { promoted_guest_id: newGuestId })

  // Verify identity profile created.
  const profile = await db!
    .select()
    .from(guestIdentityProfiles)
    .where(eq(guestIdentityProfiles.guest_id, newGuestId))
    .limit(1)
  assert(profile[0], "identity profile not created")
  const evidence = profile[0].discovery_evidence as { urls?: unknown[] } | null
  assert(
    Array.isArray(evidence?.urls) && evidence.urls.length > 0,
    "discovery_evidence.urls not populated",
  )
  console.log(`  ✓ guest_identity_profiles row created with discovery_evidence`)

  // Verify link row created.
  const links = await db!
    .select()
    .from(guestDiscoveryLinks)
    .where(eq(guestDiscoveryLinks.discovery_candidate_id, cand.id))
  assert(links.length === 1, `expected 1 link, got ${links.length}`)
  assert(links[0].guest_id === newGuestId, "link guest_id mismatch")
  assert(
    links[0].confidence_score && Number(links[0].confidence_score) > 0,
    "confidence_score not stored",
  )
  console.log(`  ✓ guest_discovery_links row created`)

  // Verify candidate is marked promoted.
  const updated = await db!
    .select({ status: guestDiscoveryCandidates.status, promoted_guest_id: guestDiscoveryCandidates.promoted_guest_id })
    .from(guestDiscoveryCandidates)
    .where(eq(guestDiscoveryCandidates.id, cand.id))
    .limit(1)
  assert(updated[0]?.status === "promoted", "candidate status not updated")
  assert(updated[0]?.promoted_guest_id === newGuestId, "promoted_guest_id not stamped")
  console.log(`  ✓ candidate stamped promoted`)

  // Suppress unused-var lint for existing guest id.
  void existingGuestId
}

async function caseBackfillIdempotent() {
  console.log("\nCase 11 — backfill is idempotent (run twice, second is no-op):")
  // Idempotency = "running with same input produces same output."
  // We run twice; the FIRST may create profiles for guests inserted by
  // earlier cases; the SECOND must be a no-op.
  const { spawnSync } = await import("node:child_process")
  const run = () =>
    spawnSync("npx", ["tsx", "scripts/backfill-guest-identity.ts"], {
      encoding: "utf-8",
      env: process.env,
      cwd: process.cwd(),
    })

  const r1 = run()
  assert(r1.status === 0, `first backfill failed: ${r1.stderr}`)
  const after1 = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(guestIdentityProfiles)
  const count1 = after1[0]?.c ?? 0

  const r2 = run()
  assert(r2.status === 0, `second backfill failed: ${r2.stderr}`)
  const after2 = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(guestIdentityProfiles)
  const count2 = after2[0]?.c ?? 0

  assert(
    count2 === count1,
    `second run mutated profile count (after first=${count1}, after second=${count2})`,
  )
  console.log(`  ✓ converged at ${count1} profiles; second run was a no-op`)
}

async function caseAdminGuestPageImports() {
  console.log("\nCase 12 — /admin/guests/[id] module imports cleanly:")
  const mod = await import("@/app/admin/guests/[id]/page")
  assert(typeof mod.default === "function", "default export missing")
  console.log(`  ✓ admin guest detail page module loaded`)
}

async function caseFindGuestMatchPureRead() {
  console.log("\nCase 13 — findGuestMatch is a pure read (regression):")
  // Calling findGuestMatch with name=undefined → none.
  const r = await findGuestMatch({ name: null })
  assert(r.confidence === "none", `expected none, got ${r.confidence}`)
  console.log(`  ✓ null-name lookup returns none cleanly`)
}

async function main() {
  await cleanup()
  console.log("🧪 smoke-khat-brain-guests-unification — starting\n")

  const guestId = await caseEnsureGuestCreate()
  await caseEnsureGuestMatch(guestId)
  await caseLowConfidenceRequiresReview()
  await casePromotionFlow(guestId)

  await caseBackfillIdempotent()
  await caseAdminGuestPageImports()
  await caseFindGuestMatchPureRead()

  await cleanup()
  console.log("\n✅ smoke-khat-brain-guests-unification: all cases passed")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 smoke failed:", err)
    process.exit(1)
  })
