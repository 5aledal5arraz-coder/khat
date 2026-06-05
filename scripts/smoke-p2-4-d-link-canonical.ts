/**
 * Phase 2.4.d — local DB smoke for the canonical link-canonical flow.
 *
 *   npm run smoke:p2-4-d-link-canonical
 *
 * Validates the route-handler contract end-to-end against the local
 * Postgres, WITHOUT spinning up the Next.js dev server or driving a
 * browser. The smoke imports the same lib helpers the routes call
 * (`previewEnsureGuest`, `ensureGuest`, `emitSystemEvent`,
 * `buildGuestIdentityLinkedEvent`) and mirrors the routes' decision
 * matrix step-by-step — including the two junction-existence checks
 * the routes perform around the matcher, and the requires_review
 * gating. Asserts on real DB rows after each scenario.
 *
 * What this smoke covers (operator checklist §1–§10):
 *   1. candidate preview path                       (preview shape)
 *   2. candidate confirm `create_new`               (ensureGuest auto)
 *   3. guest_candidate_links row created            (junction insert)
 *   4. duplicate confirm idempotent / already-linked
 *   5. system_events row emitted (source=guest-identity, type=linked)
 *   6. application preview path
 *   7. application confirm `create_new`
 *   8. guest_application_links row created
 *   9. low-confidence / requires_review path does NOT write
 *  10. cleanup removes all smoke-created rows (verified by re-query)
 *
 * What it does NOT cover (deferred):
 *   - HTTP-layer concerns (CSRF header, cookie auth, requireRole).
 *     Those are validated by manual UI walkthrough + Next.js routing.
 *   - The shared LinkCanonicalDialog React component (no DOM here).
 *
 * Hostname-guarded — refuses non-localhost DATABASE_URL unless
 * SMOKE_ALLOW_REMOTE=1. Marker-tagged rows are created and torn down
 * at the end (and on a best-effort failure path). Safe to re-run.
 *
 * Exit codes:
 *   0 — all assertions PASS
 *   2 — hostname guard refused OR any assertion FAILED
 */

import { and, eq, like, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { guests, guestApplications } from "@/lib/db/schema/guests"
import { guestCandidates } from "@/lib/db/schema/guest-candidates"
import {
  guestCandidateLinks,
  guestApplicationLinks,
} from "@/lib/db/schema/guest-identity"
import { systemEvents } from "@/lib/db/schema/system-events"
import {
  ensureGuest,
  previewEnsureGuest,
  type IdentityHints,
} from "@/lib/guests/canonical"
import { emitSystemEvent } from "@/lib/system-events/emit"
import { buildGuestIdentityLinkedEvent } from "@/lib/system-events/builders"

const SMOKE_VERSION = "smoke-p2-4-d-link-canonical-v1.0"

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

// ─── Marker scheme ───────────────────────────────────────────────────
//
// Every row this smoke creates carries the MARKER prefix in a way that
// cleanup can grep for unambiguously:
//   - candidates.full_name             starts with MARKER
//   - applications.name                starts with MARKER
//   - guests.slug + guests.name        start with MARKER
//   - junction.linked_by               equals ACTOR
//   - system_events.actor              equals ACTOR
//
// Cleanup deletes by these markers. Re-running the smoke first does a
// pre-cleanup so an aborted prior run doesn't leak rows.

const MARKER = "smoke-p2-4-d"
const ACTOR = `admin:${MARKER}-actor`

// ─── Assertion plumbing ──────────────────────────────────────────────

interface AssertionResult {
  name: string
  ok: boolean
  detail: string
}

const results: AssertionResult[] = []

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail })
  const tag = ok ? "PASS" : "FAIL"
  console.log(`  [${tag}] ${name} — ${detail}`)
}

// ─── Cleanup ─────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  if (!db) return
  // Order matters — delete the things with FKs to other smoke rows
  // first, then the parents. Junction tables cascade ON DELETE from
  // guests, so deleting guests cascades to junctions, but we still
  // delete junctions explicitly by `linked_by` to also catch any
  // junctions we wrote pointing at non-smoke guests (defensive).
  await db
    .delete(systemEvents)
    .where(eq(systemEvents.actor, ACTOR))
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
  await db
    .delete(guests)
    .where(like(guests.slug, `${MARKER}%`))
}

// ─── Route confirm-path simulator ────────────────────────────────────
//
// The smoke does NOT cross the HTTP boundary. Instead, this function
// mirrors the candidate-route's POST handler EXACTLY (modulo
// requireRole + CSRF) so we exercise the same matcher + junction +
// emit code path the route does. Any drift between this simulator and
// the real route is a code-review concern, not a smoke concern.
//
// The route's contract:
//   1. Pre-check existing junction → return "already_linked" if found.
//   2. Run previewEnsureGuest; if requires_review or confidence==='low',
//      return 409 — NO write.
//   3. Run ensureGuest({acceptance:"auto"}); same gating as step 2.
//   4. Re-check existing junction (race window); same handling.
//   5. INSERT junction row, await emitSystemEvent (smoke awaits to
//      assert, the real route fire-and-forgets).
//
// Return shape matches the route's JSON response so the smoke can
// assert on it.

type ConfirmKind = "candidate" | "application"

type ConfirmOutcome =
  | { status: "linked"; junction_id: string; guest_id: string; created_guest: boolean; confidence: "high" | "medium" }
  | { status: "already_linked"; junction_id: string; guest_id: string }
  | { status: "needs_review"; reasons: string[]; confidence: "low" | "medium" | "none" | "high" }

async function simulateConfirm(
  kind: ConfirmKind,
  sourceId: string,
  hints: IdentityHints,
): Promise<ConfirmOutcome> {
  if (!db) throw new Error("db is null")

  // Step 1 — pre-check junction.
  if (kind === "candidate") {
    const existing = await db
      .select({
        id: guestCandidateLinks.id,
        guest_id: guestCandidateLinks.guest_id,
      })
      .from(guestCandidateLinks)
      .where(eq(guestCandidateLinks.candidate_id, sourceId))
      .limit(1)
    if (existing[0]) {
      return {
        status: "already_linked",
        junction_id: existing[0].id,
        guest_id: existing[0].guest_id,
      }
    }
  } else {
    const existing = await db
      .select({
        id: guestApplicationLinks.id,
        guest_id: guestApplicationLinks.guest_id,
      })
      .from(guestApplicationLinks)
      .where(eq(guestApplicationLinks.application_id, sourceId))
      .limit(1)
    if (existing[0]) {
      return {
        status: "already_linked",
        junction_id: existing[0].id,
        guest_id: existing[0].guest_id,
      }
    }
  }

  // Step 2 — preview + gate.
  const preview = await previewEnsureGuest(hints)
  if (preview.requires_review || preview.confidence === "low") {
    return {
      status: "needs_review",
      reasons: preview.reasons,
      confidence: preview.confidence,
    }
  }

  // Step 3 — ensure + same gate (belt + suspenders, mirrors route).
  const ensure = await ensureGuest(hints, { acceptance: "auto" })
  if (ensure.requires_review) {
    return {
      status: "needs_review",
      reasons: ensure.reasons,
      confidence: ensure.confidence,
    }
  }

  // Step 4 — race-window re-check.
  if (kind === "candidate") {
    const reCheck = await db
      .select({
        id: guestCandidateLinks.id,
        guest_id: guestCandidateLinks.guest_id,
      })
      .from(guestCandidateLinks)
      .where(eq(guestCandidateLinks.candidate_id, sourceId))
      .limit(1)
    if (reCheck[0]) {
      return {
        status: "already_linked",
        junction_id: reCheck[0].id,
        guest_id: reCheck[0].guest_id,
      }
    }
  } else {
    const reCheck = await db
      .select({
        id: guestApplicationLinks.id,
        guest_id: guestApplicationLinks.guest_id,
      })
      .from(guestApplicationLinks)
      .where(eq(guestApplicationLinks.application_id, sourceId))
      .limit(1)
    if (reCheck[0]) {
      return {
        status: "already_linked",
        junction_id: reCheck[0].id,
        guest_id: reCheck[0].guest_id,
      }
    }
  }

  // Step 5 — insert + emit.
  const confidence: "high" | "medium" =
    ensure.confidence === "medium" ? "medium" : "high"

  let junctionId: string
  if (kind === "candidate") {
    const [row] = await db
      .insert(guestCandidateLinks)
      .values({
        guest_id: ensure.guest_id,
        candidate_id: sourceId,
        link_type: "manual_link",
        confidence: ensure.confidence,
        linked_by: ACTOR,
      })
      .returning({ id: guestCandidateLinks.id })
    junctionId = row.id
  } else {
    const [row] = await db
      .insert(guestApplicationLinks)
      .values({
        guest_id: ensure.guest_id,
        application_id: sourceId,
        link_type: "manual_link",
        linked_by: ACTOR,
      })
      .returning({ id: guestApplicationLinks.id })
    junctionId = row.id
  }

  // Smoke awaits so we can assert in the next step; the real route
  // `void`-discards. Functionally identical contract.
  await emitSystemEvent(
    buildGuestIdentityLinkedEvent({
      kind,
      junction_id: junctionId,
      source_id: sourceId,
      guest_id: ensure.guest_id,
      confidence,
      created_guest: ensure.created,
      actor: ACTOR,
    }),
  )

  return {
    status: "linked",
    junction_id: junctionId,
    guest_id: ensure.guest_id,
    created_guest: ensure.created,
    confidence,
  }
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
        `[${SMOKE_VERSION}] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override (NOT recommended).`,
      )
      process.exit(2)
    }
    record(
      "0. hostname guard refuses non-local DB",
      true,
      "DATABASE_URL is local",
    )
  } else {
    record(
      "0. hostname guard refuses non-local DB",
      true,
      "bypassed via SMOKE_ALLOW_REMOTE=1",
    )
  }

  if (!db) {
    console.error(`[${SMOKE_VERSION}] db is null — refusing`)
    process.exit(2)
  }

  // Pre-cleanup — wipe any leftover rows from a prior aborted run.
  await cleanup()

  // Seed data:
  //   - candidateA   : unique marker name → none confidence → create new
  //   - applicationA : different marker name → none confidence → create new
  //   - guestColA, guestColB : two canonical guests with IDENTICAL name
  //     to force a name-collision → confidence === "low" for any
  //     candidate sharing that name (no tiebreaker available).
  //   - candidateLow : same name as colliding guests → low confidence
  const uniqA = `${MARKER}-cand-${Date.now().toString(36)}`
  const uniqB = `${MARKER}-app-${Date.now().toString(36)}`
  const colName = `${MARKER}-collide-${Date.now().toString(36)}`

  const [candidateA] = await db
    .insert(guestCandidates)
    .values({
      full_name: uniqA,
      display_name: null,
      bio: "smoke-candidate-bio",
      country: null,
      status: "new",
    })
    .returning({ id: guestCandidates.id, full_name: guestCandidates.full_name })

  const [applicationA] = await db
    .insert(guestApplications)
    .values({
      name: uniqB,
      email: `${MARKER}-${Date.now().toString(36)}@example.test`,
      phone: "0",
      country: "KW",
      story_idea: "smoke-application-story",
      beyond_job_title: "x",
      life_changing_moment: "x",
      hope_people_understand: "x",
      unasked_question: "x",
      why_khat: "x",
      prefer_dialogue_or_story: "story",
      status: "accepted",
    })
    .returning({ id: guestApplications.id, name: guestApplications.name })

  // Two canonical guests sharing the same name — force low-confidence
  // for any new candidate with that name. Slugs are unique so we
  // disambiguate via suffix; the matcher only cares about
  // normalized_name (the DB-generated column) which is identical for
  // both rows.
  await db
    .insert(guests)
    .values([
      { name: colName, slug: `${colName}-1`, bio: null, external_links: {} },
      { name: colName, slug: `${colName}-2`, bio: null, external_links: {} },
    ])

  const [candidateLow] = await db
    .insert(guestCandidates)
    .values({
      full_name: colName,
      display_name: null,
      bio: "smoke-low-conf-bio",
      country: null,
      status: "new",
    })
    .returning({ id: guestCandidates.id })

  // Test scope is wide enough that any failure should be reported with
  // context — wrap in try/finally so cleanup always runs.
  try {
    // ─── §1. Candidate preview ────────────────────────────────────────
    const hintsA: IdentityHints = {
      name: candidateA.full_name,
      country: null,
      bio: "smoke-candidate-bio",
    }
    const previewA = await previewEnsureGuest(hintsA)
    record(
      "1. candidate preview returns none-confidence with new slug",
      previewA.confidence === "none" &&
        previewA.requires_review === false &&
        !!previewA.would_create_slug,
      `confidence=${previewA.confidence} requires_review=${previewA.requires_review} would_create_slug=${previewA.would_create_slug ?? "null"}`,
    )

    // ─── §2. Candidate confirm create_new ─────────────────────────────
    const confirmA = await simulateConfirm("candidate", candidateA.id, hintsA)
    const confirmA_ok =
      confirmA.status === "linked" &&
      confirmA.created_guest === true &&
      confirmA.confidence === "high"
    record(
      "2. candidate confirm create_new returns linked + created_guest",
      confirmA_ok,
      `status=${confirmA.status} ${confirmA.status === "linked" ? `created_guest=${confirmA.created_guest} confidence=${confirmA.confidence}` : ""}`,
    )

    // ─── §3. guest_candidate_links row created ────────────────────────
    const gclRows = await db
      .select()
      .from(guestCandidateLinks)
      .where(eq(guestCandidateLinks.candidate_id, candidateA.id))
    record(
      "3. guest_candidate_links row exists for candidate",
      gclRows.length === 1 &&
        gclRows[0].link_type === "manual_link" &&
        gclRows[0].linked_by === ACTOR,
      `rows=${gclRows.length} link_type=${gclRows[0]?.link_type ?? "-"} linked_by=${gclRows[0]?.linked_by ?? "-"}`,
    )

    // ─── §4. Duplicate confirm idempotent ─────────────────────────────
    const confirmA2 = await simulateConfirm("candidate", candidateA.id, hintsA)
    const dupRows = await db
      .select({ id: guestCandidateLinks.id })
      .from(guestCandidateLinks)
      .where(eq(guestCandidateLinks.candidate_id, candidateA.id))
    record(
      "4. duplicate candidate confirm is idempotent (already_linked + no dup row)",
      confirmA2.status === "already_linked" && dupRows.length === 1,
      `status=${confirmA2.status} junction_rows=${dupRows.length}`,
    )

    // ─── §5. system_events row emitted ────────────────────────────────
    const events = await db
      .select()
      .from(systemEvents)
      .where(
        and(
          eq(systemEvents.actor, ACTOR),
          eq(systemEvents.source, "guest-identity"),
          eq(systemEvents.event_type, "linked"),
        ),
      )
    // Exactly one event from §2 — §4's already_linked path does NOT
    // emit (the route exits before reaching the emit; the simulator
    // matches that behavior).
    const candidateEvents = events.filter((e) => {
      const payload = (e.payload ?? {}) as Record<string, unknown>
      return payload.kind === "candidate" && payload.source_id === candidateA.id
    })
    record(
      "5. system_events row emitted (source=guest-identity event_type=linked)",
      candidateEvents.length === 1 &&
        candidateEvents[0].severity === "info" &&
        ((candidateEvents[0].payload ?? {}) as { created_guest?: boolean }).created_guest === true,
      `events=${candidateEvents.length} severity=${candidateEvents[0]?.severity ?? "-"} payload.created_guest=${((candidateEvents[0]?.payload ?? {}) as { created_guest?: boolean }).created_guest ?? "-"}`,
    )

    // ─── §6. Application preview ──────────────────────────────────────
    const hintsB: IdentityHints = {
      name: applicationA.name,
      country: "KW",
      bio: "smoke-application-story",
      social_accounts: null,
    }
    const previewB = await previewEnsureGuest(hintsB)
    record(
      "6. application preview returns none-confidence with new slug",
      previewB.confidence === "none" &&
        previewB.requires_review === false &&
        !!previewB.would_create_slug,
      `confidence=${previewB.confidence} requires_review=${previewB.requires_review} would_create_slug=${previewB.would_create_slug ?? "null"}`,
    )

    // ─── §7. Application confirm create_new ───────────────────────────
    const confirmB = await simulateConfirm("application", applicationA.id, hintsB)
    record(
      "7. application confirm create_new returns linked + created_guest",
      confirmB.status === "linked" &&
        confirmB.created_guest === true &&
        confirmB.confidence === "high",
      `status=${confirmB.status} ${confirmB.status === "linked" ? `created_guest=${confirmB.created_guest} confidence=${confirmB.confidence}` : ""}`,
    )

    // ─── §8. guest_application_links row created ──────────────────────
    const galRows = await db
      .select()
      .from(guestApplicationLinks)
      .where(eq(guestApplicationLinks.application_id, applicationA.id))
    record(
      "8. guest_application_links row exists for application",
      galRows.length === 1 &&
        galRows[0].link_type === "manual_link" &&
        galRows[0].linked_by === ACTOR,
      `rows=${galRows.length} link_type=${galRows[0]?.link_type ?? "-"} linked_by=${galRows[0]?.linked_by ?? "-"}`,
    )

    // ─── §9. Low-confidence path does NOT write ───────────────────────
    const hintsLow: IdentityHints = {
      name: colName,
      country: null,
      bio: "smoke-low-conf-bio",
    }
    const previewLow = await previewEnsureGuest(hintsLow)
    const confirmLow = await simulateConfirm(
      "candidate",
      candidateLow.id,
      hintsLow,
    )
    const lowJunctions = await db
      .select({ id: guestCandidateLinks.id })
      .from(guestCandidateLinks)
      .where(eq(guestCandidateLinks.candidate_id, candidateLow.id))
    const lowEventsCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(systemEvents)
      .where(
        and(
          eq(systemEvents.actor, ACTOR),
          sql`(${systemEvents.payload}->>'source_id') = ${candidateLow.id}`,
        ),
      )
    record(
      "9. low-confidence requires_review path writes nothing",
      previewLow.confidence === "low" &&
        previewLow.requires_review === true &&
        confirmLow.status === "needs_review" &&
        lowJunctions.length === 0 &&
        Number(lowEventsCount[0]?.n ?? 0) === 0,
      `preview.confidence=${previewLow.confidence} preview.requires_review=${previewLow.requires_review} confirm.status=${confirmLow.status} junctions=${lowJunctions.length} events=${lowEventsCount[0]?.n ?? 0}`,
    )

    // ─── §10. Cleanup verification ────────────────────────────────────
    // Run cleanup and then re-query to confirm zero rows remain.
    await cleanup()
    const leftoverCandidates = await db
      .select({ id: guestCandidates.id })
      .from(guestCandidates)
      .where(like(guestCandidates.full_name, `${MARKER}%`))
    const leftoverApps = await db
      .select({ id: guestApplications.id })
      .from(guestApplications)
      .where(like(guestApplications.name, `${MARKER}%`))
    const leftoverGuests = await db
      .select({ id: guests.id })
      .from(guests)
      .where(like(guests.slug, `${MARKER}%`))
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
    const totalLeftover =
      leftoverCandidates.length +
      leftoverApps.length +
      leftoverGuests.length +
      leftoverGcl.length +
      leftoverGal.length +
      leftoverEvents.length
    record(
      "10. cleanup removes every smoke-tagged row",
      totalLeftover === 0,
      `candidates=${leftoverCandidates.length} apps=${leftoverApps.length} guests=${leftoverGuests.length} gcl=${leftoverGcl.length} gal=${leftoverGal.length} events=${leftoverEvents.length}`,
    )
  } catch (err) {
    // Best-effort cleanup on any unhandled failure inside the try block.
    console.error(`[${SMOKE_VERSION}] unexpected error during smoke run:`, err)
    record(
      "fatal. smoke crashed mid-run",
      false,
      err instanceof Error ? err.message : String(err),
    )
    try {
      await cleanup()
    } catch (cleanupErr) {
      console.error(
        `[${SMOKE_VERSION}] cleanup also failed:`,
        cleanupErr,
      )
    }
  }

  // ─── Final tally ────────────────────────────────────────────────────
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
