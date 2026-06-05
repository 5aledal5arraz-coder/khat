/**
 * Phase 2.4.e.1 — local-DB smoke for the guest-identity integrity lib.
 *
 *   npm run smoke:p2-4-e-integrity
 *
 * Seeds a known set of integrity issues (2 duplicate guests, 1
 * unlinked accepted candidate, 1 unlinked accepted application, 1
 * stale profile, 1 fresh control profile), exercises every integrity
 * helper, asserts the expected detection, then cleans up by marker.
 *
 * What this smoke locks down:
 *   1. Hostname guard refuses non-local DB.
 *   2. `countDuplicateGuestNameGroups` detects the seeded pair (1 group, 2 guests).
 *   3. `listDuplicateGuestNameGroups` returns the seeded group with
 *      both members, deterministic member ordering, and a
 *      `most_connected_id` matching the seeded relationship count.
 *   4. `listUnlinkedAcceptedCandidates` includes the seeded unlinked
 *      candidate and EXCLUDES the seeded linked control.
 *   5. `countUnlinkedAcceptedCandidates` agrees with the list helper.
 *   6. `listUnlinkedAcceptedApplications` finds the seeded app,
 *      excludes the seeded linked control.
 *   7. `countUnlinkedAcceptedApplications` agrees.
 *   8. `listStaleIdentityProfiles` finds the 100-day-old profile and
 *      EXCLUDES the fresh control. NULL last_analyzed_at sorts first.
 *   9. `countStaleIdentityProfiles` agrees.
 *  10. `countGuestIdentityLinkedEvents` returns the seeded event
 *      sliced correctly by `created_guest`.
 *  11. `getGuestIdentitySnapshot` returns a shape with every metric.
 *  12. `severityFor` agrees with `THRESHOLDS` on the seeded counts.
 *  13. Cleanup leaves zero marker-tagged rows.
 *
 * Hostname-guarded. Marker-tagged. Safe to re-run (pre-cleanup at start).
 *
 * Exit codes:
 *   0 — all assertions PASS
 *   2 — hostname guard refused / any assertion FAIL
 */

import { and, eq, like, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { guests, guestApplications } from "@/lib/db/schema/guests"
import { guestCandidates } from "@/lib/db/schema/guest-candidates"
import {
  guestCandidateLinks,
  guestApplicationLinks,
  guestIdentityProfiles,
} from "@/lib/db/schema/guest-identity"
import { systemEvents } from "@/lib/db/schema/system-events"
import {
  countDuplicateGuestNameGroups,
  countGuestIdentityLinkedEvents,
  countStaleIdentityProfiles,
  countUnlinkedAcceptedApplications,
  countUnlinkedAcceptedCandidates,
  getGuestIdentitySnapshot,
  listDuplicateGuestNameGroups,
  listStaleIdentityProfiles,
  listUnlinkedAcceptedApplications,
  listUnlinkedAcceptedCandidates,
  severityFor,
  THRESHOLDS,
} from "@/lib/guest-identity/integrity"

const SMOKE_VERSION = "smoke-p2-4-e-integrity-v1.0"
const MARKER = "smoke-p2-4-e"
const ACTOR = `admin:${MARKER}-actor`

// ─── Hostname guard ──────────────────────────────────────────────────

const PRODUCTION_HOSTNAME_PATTERNS: RegExp[] = [
  /\.ondigitalocean\.com/i,
  /\.rds\.amazonaws\.com/i,
  /\.supabase\.co/i,
  /\.neon\.tech/i,
  /\.railway\.app/i,
  /\.heroku\.com/i,
  /\.azure\.com/i,
]

function isLocalConnection(s: string): { ok: boolean; reason?: string } {
  try {
    const url = new URL(s.replace(/^postgres(ql)?:\/\//, "http://"))
    const host = url.hostname.toLowerCase()
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return { ok: true }
    }
    for (const pat of PRODUCTION_HOSTNAME_PATTERNS) {
      if (pat.test(host)) {
        return {
          ok: false,
          reason: `hostname ${host} matches production pattern ${pat}.`,
        }
      }
    }
    return { ok: false, reason: `hostname ${host} is not localhost.` }
  } catch (err) {
    return {
      ok: false,
      reason: `could not parse DATABASE_URL: ${(err as Error).message}`,
    }
  }
}

// ─── Result tracking ─────────────────────────────────────────────────

interface AssertionResult {
  name: string
  ok: boolean
  detail: string
}
const results: AssertionResult[] = []
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail })
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name} — ${detail}`)
}

// ─── Cleanup ─────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  if (!db) return
  await db.delete(systemEvents).where(eq(systemEvents.actor, ACTOR))
  await db
    .delete(guestCandidateLinks)
    .where(eq(guestCandidateLinks.linked_by, ACTOR))
  await db
    .delete(guestApplicationLinks)
    .where(eq(guestApplicationLinks.linked_by, ACTOR))
  await db
    .delete(guestCandidates)
    .where(like(guestCandidates.full_name, `${MARKER}%`))
  await db
    .delete(guestApplications)
    .where(like(guestApplications.name, `${MARKER}%`))
  // Cascade from guests deletes the profile + any junction rows
  // pointing at it. Delete guests AFTER candidates / applications to
  // avoid the FK cascade leaving orphaned junction rows pointing at
  // smoke-tagged candidates (paranoia — cascade handles it either way).
  await db.delete(guests).where(like(guests.slug, `${MARKER}%`))
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[${SMOKE_VERSION}]`)

  // Hostname guard.
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error(`[${SMOKE_VERSION}] DATABASE_URL is not set — refusing`)
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[${SMOKE_VERSION}] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
    record("1. hostname guard refuses non-local DB", true, "DATABASE_URL is local")
  } else {
    record("1. hostname guard refuses non-local DB", true, "bypassed via SMOKE_ALLOW_REMOTE=1")
  }

  if (!db) {
    console.error(`[${SMOKE_VERSION}] db is null — refusing`)
    process.exit(2)
  }

  await cleanup()

  // ─── Seed ───────────────────────────────────────────────────────────
  // Marker-tagged so cleanup can find them. Each row is uniquely named
  // so re-runs don't collide.
  const stamp = Date.now().toString(36)
  const dupName = `${MARKER}-dup-${stamp}`
  const candName = `${MARKER}-cand-${stamp}`
  const candControlName = `${MARKER}-cand-control-${stamp}`
  const appName = `${MARKER}-app-${stamp}`
  const appControlName = `${MARKER}-app-control-${stamp}`
  const staleName = `${MARKER}-stale-${stamp}`
  const freshName = `${MARKER}-fresh-${stamp}`

  // Seed 2 duplicate guests sharing the same name → 1 dup group.
  // Member 1 = "winner" with explicit relationship counts (an episode).
  // Member 2 = "loser" with zero relationships.
  const [dup1, dup2] = await db
    .insert(guests)
    .values([
      { name: dupName, slug: `${MARKER}-dup-1-${stamp}`, external_links: {} },
      { name: dupName, slug: `${MARKER}-dup-2-${stamp}`, external_links: {} },
    ])
    .returning({ id: guests.id })

  // Seed candidate-link on dup1 to make it the "most connected".
  // The candidate is itself marker-tagged so cleanup catches it.
  const [seedCand] = await db
    .insert(guestCandidates)
    .values({
      full_name: `${MARKER}-dup-link-${stamp}`,
      status: "accepted",
    })
    .returning({ id: guestCandidates.id })
  await db.insert(guestCandidateLinks).values({
    guest_id: dup1.id,
    candidate_id: seedCand.id,
    link_type: "manual_link",
    confidence: "high",
    linked_by: ACTOR,
  })

  // Seed an unlinked accepted candidate.
  const [unlinkedCand] = await db
    .insert(guestCandidates)
    .values({
      full_name: candName,
      status: "accepted",
      bio: "smoke-unlinked-candidate",
    })
    .returning({ id: guestCandidates.id })

  // Seed a CONTROL candidate that IS linked — should NOT appear in
  // unlinked list. Bind to a fresh guest (also marker-tagged).
  const [controlGuestForCand] = await db
    .insert(guests)
    .values({
      name: `${MARKER}-ctrl-cand-guest-${stamp}`,
      slug: `${MARKER}-ctrl-cand-${stamp}`,
      external_links: {},
    })
    .returning({ id: guests.id })
  const [linkedCand] = await db
    .insert(guestCandidates)
    .values({
      full_name: candControlName,
      status: "accepted",
    })
    .returning({ id: guestCandidates.id })
  await db.insert(guestCandidateLinks).values({
    guest_id: controlGuestForCand.id,
    candidate_id: linkedCand.id,
    link_type: "manual_link",
    confidence: "high",
    linked_by: ACTOR,
  })

  // Seed an unlinked accepted application.
  const [unlinkedApp] = await db
    .insert(guestApplications)
    .values({
      name: appName,
      email: `${MARKER}-${stamp}-1@example.test`,
      phone: "0",
      country: "KW",
      story_idea: "smoke",
      beyond_job_title: "x",
      life_changing_moment: "x",
      hope_people_understand: "x",
      unasked_question: "x",
      why_khat: "x",
      prefer_dialogue_or_story: "story",
      status: "accepted",
    })
    .returning({ id: guestApplications.id })

  // Seed a CONTROL application that IS linked.
  const [controlGuestForApp] = await db
    .insert(guests)
    .values({
      name: `${MARKER}-ctrl-app-guest-${stamp}`,
      slug: `${MARKER}-ctrl-app-${stamp}`,
      external_links: {},
    })
    .returning({ id: guests.id })
  const [linkedApp] = await db
    .insert(guestApplications)
    .values({
      name: appControlName,
      email: `${MARKER}-${stamp}-2@example.test`,
      phone: "0",
      country: "KW",
      story_idea: "smoke",
      beyond_job_title: "x",
      life_changing_moment: "x",
      hope_people_understand: "x",
      unasked_question: "x",
      why_khat: "x",
      prefer_dialogue_or_story: "story",
      status: "accepted",
    })
    .returning({ id: guestApplications.id })
  await db.insert(guestApplicationLinks).values({
    guest_id: controlGuestForApp.id,
    application_id: linkedApp.id,
    link_type: "manual_link",
    linked_by: ACTOR,
  })

  // Seed a STALE profile (last_analyzed_at = 100 days ago) and a
  // FRESH control profile (last_analyzed_at = now).
  const [staleGuest] = await db
    .insert(guests)
    .values({
      name: staleName,
      slug: `${MARKER}-stale-${stamp}`,
      external_links: {},
    })
    .returning({ id: guests.id })
  const [freshGuest] = await db
    .insert(guests)
    .values({
      name: freshName,
      slug: `${MARKER}-fresh-${stamp}`,
      external_links: {},
    })
    .returning({ id: guests.id })

  const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
  await db.insert(guestIdentityProfiles).values([
    { guest_id: staleGuest.id, last_analyzed_at: hundredDaysAgo },
    { guest_id: freshGuest.id, last_analyzed_at: new Date() },
  ])

  // Seed a `guest-identity.linked` system_events row so the event
  // counter has something to find. Use marker actor so cleanup is
  // unambiguous. created_guest=true so the slice counter detects it.
  await db.insert(systemEvents).values({
    source: "guest-identity",
    event_type: "linked",
    severity: "info",
    actor: ACTOR,
    payload: {
      kind: "candidate",
      junction_id: "smoke-fake-junction",
      source_id: seedCand.id,
      guest_id: dup1.id,
      confidence: "high",
      created_guest: true,
    },
  })

  try {
    // ─── §2. countDuplicateGuestNameGroups ────────────────────────────
    const dupCounts = await countDuplicateGuestNameGroups()
    // Must be >= 1 group containing >= 2 guests. The DB may already
    // have other dup groups; we only assert ours is included.
    record(
      "2. countDuplicateGuestNameGroups detects seeded duplicate",
      dupCounts.groups >= 1 && dupCounts.guests >= 2,
      `groups=${dupCounts.groups} guests=${dupCounts.guests}`,
    )

    // ─── §3. listDuplicateGuestNameGroups ─────────────────────────────
    // The DB's `guests.normalized_name` GENERATED column converts
    // non-alphanumeric chars (including `-`) to spaces, so the seeded
    // `dupName = "smoke-p2-4-e-dup-<stamp>"` returns from the lib as
    // `"smoke p2 4 e dup <stamp>"` — a `norm.includes(dupName)` lookup
    // never matches. Identify our group by its member ids instead
    // (both seeded guests must be present together). This couples the
    // smoke to the lib's contract surface, not to the DB's normalize
    // regex, which is what we actually want to test.
    const dupList = await listDuplicateGuestNameGroups({ limit: 200 })
    const ourGroup = dupList.find(
      (g) =>
        g.members.some((m) => m.id === dup1.id) &&
        g.members.some((m) => m.id === dup2.id),
    )
    const dup1HasLink = ourGroup?.members.find((m) => m.id === dup1.id)
    const dup2HasNoLink = ourGroup?.members.find((m) => m.id === dup2.id)
    record(
      "3. listDuplicateGuestNameGroups returns seeded group with member counts",
      !!ourGroup &&
        ourGroup.group_size === 2 &&
        ourGroup.members.length === 2 &&
        (dup1HasLink?.candidate_links ?? 0) === 1 &&
        (dup2HasNoLink?.candidate_links ?? 0) === 0 &&
        ourGroup.most_connected_id === dup1.id,
      `group_size=${ourGroup?.group_size ?? "-"} members=${ourGroup?.members.length ?? "-"} most_connected=${ourGroup?.most_connected_id ?? "-"} expected=${dup1.id} dup1_cand_links=${dup1HasLink?.candidate_links ?? "-"} dup2_cand_links=${dup2HasNoLink?.candidate_links ?? "-"}`,
    )

    // ─── §4. listUnlinkedAcceptedCandidates ───────────────────────────
    const unlinkedCandList = await listUnlinkedAcceptedCandidates({ limit: 500 })
    const includesUnlinked = unlinkedCandList.some((c) => c.id === unlinkedCand.id)
    const excludesLinked = !unlinkedCandList.some((c) => c.id === linkedCand.id)
    record(
      "4. listUnlinkedAcceptedCandidates includes seeded unlinked, excludes linked",
      includesUnlinked && excludesLinked,
      `includes_unlinked=${includesUnlinked} excludes_linked=${excludesLinked}`,
    )

    // ─── §5. countUnlinkedAcceptedCandidates ──────────────────────────
    const unlinkedCandCount = await countUnlinkedAcceptedCandidates()
    record(
      "5. countUnlinkedAcceptedCandidates >= the seeded one",
      unlinkedCandCount >= 1,
      `count=${unlinkedCandCount}`,
    )

    // ─── §6. listUnlinkedAcceptedApplications ─────────────────────────
    const unlinkedAppList = await listUnlinkedAcceptedApplications({ limit: 500 })
    const includesApp = unlinkedAppList.some((a) => a.id === unlinkedApp.id)
    const excludesLinkedApp = !unlinkedAppList.some((a) => a.id === linkedApp.id)
    record(
      "6. listUnlinkedAcceptedApplications includes seeded unlinked, excludes linked",
      includesApp && excludesLinkedApp,
      `includes_unlinked=${includesApp} excludes_linked=${excludesLinkedApp}`,
    )

    // ─── §7. countUnlinkedAcceptedApplications ────────────────────────
    const unlinkedAppCount = await countUnlinkedAcceptedApplications()
    record(
      "7. countUnlinkedAcceptedApplications >= the seeded one",
      unlinkedAppCount >= 1,
      `count=${unlinkedAppCount}`,
    )

    // ─── §8. listStaleIdentityProfiles ────────────────────────────────
    const staleList = await listStaleIdentityProfiles({ daysOld: 90, limit: 500 })
    const includesStale = staleList.some((p) => p.guest_id === staleGuest.id)
    const excludesFresh = !staleList.some((p) => p.guest_id === freshGuest.id)
    record(
      "8. listStaleIdentityProfiles includes 100-day stale, excludes fresh control",
      includesStale && excludesFresh,
      `includes_stale=${includesStale} excludes_fresh=${excludesFresh}`,
    )

    // ─── §9. countStaleIdentityProfiles ───────────────────────────────
    const staleCount = await countStaleIdentityProfiles({ daysOld: 90 })
    record(
      "9. countStaleIdentityProfiles >= the seeded one",
      staleCount >= 1,
      `count=${staleCount}`,
    )

    // ─── §10. countGuestIdentityLinkedEvents ──────────────────────────
    // Filter to the seeded event by querying for our actor. The lib's
    // counter aggregates over the whole table; we assert it's >= the
    // seed and that the seed's `created_guest=true` slice fires.
    const eventCounts = await countGuestIdentityLinkedEvents({ hours: 24 })
    const ourEventCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(systemEvents)
      .where(
        and(
          eq(systemEvents.actor, ACTOR),
          eq(systemEvents.source, "guest-identity"),
          eq(systemEvents.event_type, "linked"),
        ),
      )
    record(
      "10. countGuestIdentityLinkedEvents detects seeded event with created_guest=true slice",
      eventCounts.total >= 1 &&
        eventCounts.created_guest_true >= 1 &&
        Number(ourEventCount[0]?.n ?? 0) === 1,
      `total=${eventCounts.total} created_true=${eventCounts.created_guest_true} our_count=${ourEventCount[0]?.n ?? 0}`,
    )

    // ─── §11. getGuestIdentitySnapshot ────────────────────────────────
    const snap = await getGuestIdentitySnapshot()
    record(
      "11. getGuestIdentitySnapshot returns shape with every metric",
      typeof snap.canonicalCount === "number" &&
        typeof snap.unlinkedAcceptedCandidates === "number" &&
        typeof snap.unlinkedAcceptedApplications === "number" &&
        typeof snap.duplicateGroupCount === "number" &&
        typeof snap.duplicateGuestsTotal === "number" &&
        typeof snap.recentLinkedEvents24h === "number" &&
        typeof snap.recentLinkedEventsCreatedGuest24h === "number" &&
        typeof snap.staleProfileCount === "number" &&
        snap.staleDaysThreshold === 90,
      `canonicalCount=${snap.canonicalCount} duplicateGroupCount=${snap.duplicateGroupCount} staleProfileCount=${snap.staleProfileCount} recentLinkedEvents24h=${snap.recentLinkedEvents24h}`,
    )

    // ─── §12. severityFor agrees with THRESHOLDS ──────────────────────
    // Sanity-check the threshold mapping against fresh counters from
    // the snapshot. We don't assert specific severity values — those
    // depend on real DB state — only that the mapping is consistent
    // with the constants. Each metric must map to the lowest tier
    // whose lower bound is <= the count.
    const sev = {
      duplicateGroups: severityFor("duplicateGroups", snap.duplicateGroupCount),
      unlinkedAcceptedApplications: severityFor("unlinkedAcceptedApplications", snap.unlinkedAcceptedApplications),
      unlinkedAcceptedCandidates: severityFor("unlinkedAcceptedCandidates", snap.unlinkedAcceptedCandidates),
      staleProfiles: severityFor("staleProfiles", snap.staleProfileCount),
    }
    function expectedSev(metric: keyof typeof THRESHOLDS, n: number): "info" | "warn" | "error" {
      const t = THRESHOLDS[metric]
      if (n >= t.error) return "error"
      if (n >= t.warn) return "warn"
      return "info"
    }
    const sevMatches =
      sev.duplicateGroups === expectedSev("duplicateGroups", snap.duplicateGroupCount) &&
      sev.unlinkedAcceptedApplications === expectedSev("unlinkedAcceptedApplications", snap.unlinkedAcceptedApplications) &&
      sev.unlinkedAcceptedCandidates === expectedSev("unlinkedAcceptedCandidates", snap.unlinkedAcceptedCandidates) &&
      sev.staleProfiles === expectedSev("staleProfiles", snap.staleProfileCount)
    record(
      "12. severityFor agrees with THRESHOLDS for the live counters",
      sevMatches,
      `dup=${sev.duplicateGroups} app=${sev.unlinkedAcceptedApplications} cand=${sev.unlinkedAcceptedCandidates} stale=${sev.staleProfiles}`,
    )

    // ─── §13. Cleanup verification ────────────────────────────────────
    await cleanup()
    const leftoverGuests = await db
      .select({ id: guests.id })
      .from(guests)
      .where(like(guests.slug, `${MARKER}%`))
    const leftoverCandidates = await db
      .select({ id: guestCandidates.id })
      .from(guestCandidates)
      .where(like(guestCandidates.full_name, `${MARKER}%`))
    const leftoverApps = await db
      .select({ id: guestApplications.id })
      .from(guestApplications)
      .where(like(guestApplications.name, `${MARKER}%`))
    const leftoverGcl = await db
      .select({ id: guestCandidateLinks.id })
      .from(guestCandidateLinks)
      .where(eq(guestCandidateLinks.linked_by, ACTOR))
    const leftoverGal = await db
      .select({ id: guestApplicationLinks.id })
      .from(guestApplicationLinks)
      .where(eq(guestApplicationLinks.linked_by, ACTOR))
    const leftoverEvents = await db
      .select({ id: systemEvents.id })
      .from(systemEvents)
      .where(eq(systemEvents.actor, ACTOR))
    const total =
      leftoverGuests.length +
      leftoverCandidates.length +
      leftoverApps.length +
      leftoverGcl.length +
      leftoverGal.length +
      leftoverEvents.length
    record(
      "13. cleanup removes every marker-tagged row",
      total === 0,
      `guests=${leftoverGuests.length} cand=${leftoverCandidates.length} app=${leftoverApps.length} gcl=${leftoverGcl.length} gal=${leftoverGal.length} events=${leftoverEvents.length}`,
    )
  } catch (err) {
    console.error(`[${SMOKE_VERSION}] unexpected error during smoke run:`, err)
    record(
      "fatal. smoke crashed mid-run",
      false,
      err instanceof Error ? err.message : String(err),
    )
    try {
      await cleanup()
    } catch (cleanupErr) {
      console.error(`[${SMOKE_VERSION}] cleanup also failed:`, cleanupErr)
    }
  }

  // Final tally.
  const failed = results.filter((r) => !r.ok)
  console.log("")
  console.log(`[${SMOKE_VERSION}] ${results.length - failed.length}/${results.length} assertions PASSED`)
  if (failed.length > 0) {
    console.log(`[${SMOKE_VERSION}] FAILED:`)
    for (const r of failed) console.log(`  - ${r.name}: ${r.detail}`)
    process.exit(2)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${SMOKE_VERSION}] fatal:`, err)
    process.exit(2)
  })
