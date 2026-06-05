/**
 * Phase 2.4.b — Guest identity backfill script.
 *
 *   npm run backfill:guest-identity                     (dry-run, default)
 *   npm run backfill:guest-identity -- --confirm        (apply writes; no
 *                                                        canonical creation)
 *   npm run backfill:guest-identity -- --confirm \
 *                            --confirm-create-canonicals (apply + create
 *                                                        new canonicals)
 *   npm run backfill:guest-identity -- --pass=1         (single pass)
 *   npm run backfill:guest-identity -- --output=path.json
 *
 * Three passes, all idempotent and independent:
 *   1. guest_candidates       → guest_candidate_links
 *   2. guest_applications     → guest_application_links
 *   3. guest_identity_profiles.source_summary (merge — preserves
 *      sections this backfill doesn't own, e.g. studio/preparation)
 *
 * Dry-run is the default. NO writes ever happen without `--confirm`.
 * Creating new canonical `guests` rows requires the additional
 * `--confirm-create-canonicals` flag — defense-in-depth for the
 * riskiest mutation (operator §10 Q4 of P2.4 plan).
 *
 * Hostname-guarded. Refuses managed-DB hostnames unless
 * SMOKE_ALLOW_REMOTE=1.
 *
 * Exit codes:
 *   0 — script completed (dry-run or apply); see report `errors` array
 *       for per-row failures (those don't abort the whole script).
 *   2 — hostname guard refused OR fatal setup error.
 *   3 — DB unavailable / invariant violation.
 */

import { eq, and, isNull, sql } from "drizzle-orm"
import { writeFile } from "node:fs/promises"
import { db, closeDb } from "@/lib/db"
import { guests } from "@/lib/db/schema/guests"
import { guestApplications } from "@/lib/db/schema/guests"
import {
  guestCandidates,
  guestCandidateSocialLinks,
} from "@/lib/db/schema/guest-candidates"
import {
  guestIdentityProfiles,
  type GuestSocialAccounts,
  type GuestSourceSummary,
} from "@/lib/db/schema/guest-identity"
import type { IdentityHints } from "@/lib/guests/canonical"
import {
  previewEnsureGuest,
  ensureGuest,
  mergeSourceSummary,
} from "@/lib/guests/canonical"
import {
  routeOutcome,
  parseSocialLinksBlob,
  buildSourceSummary,
} from "@/lib/backfill/guest-identity-helpers"

const SCRIPT_VERSION = "backfill-guest-identity-links-v1.0"
const REPORT_LIST_CAP = 20

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
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return { ok: true }
    for (const pat of PRODUCTION_HOSTNAME_PATTERNS) {
      if (pat.test(host)) {
        return { ok: false, reason: `hostname ${host} matches production pattern ${pat}.` }
      }
    }
    return { ok: false, reason: `hostname ${host} is not localhost.` }
  } catch (err) {
    return { ok: false, reason: `could not parse DATABASE_URL: ${(err as Error).message}` }
  }
}

// ─── Flags ────────────────────────────────────────────────────────────

interface Flags {
  confirm: boolean
  confirmCreateCanonicals: boolean
  passes: Array<1 | 2 | 3>
  outputFile: string | null
}

function parseFlags(argv: string[]): Flags {
  const confirm = argv.includes("--confirm")
  const confirmCreate = argv.includes("--confirm-create-canonicals")
  const outArg = argv.find((a) => a.startsWith("--output="))
  const passArgs = argv.filter((a) => a.startsWith("--pass="))
  let passes: Array<1 | 2 | 3>
  if (passArgs.length === 0) {
    passes = [1, 2, 3]
  } else {
    const set = new Set<number>()
    for (const a of passArgs) {
      const v = Number(a.split("=")[1])
      if (v === 1 || v === 2 || v === 3) set.add(v)
    }
    passes = Array.from(set).sort() as Array<1 | 2 | 3>
  }
  return {
    confirm,
    confirmCreateCanonicals: confirmCreate,
    passes,
    outputFile: outArg ? outArg.split("=")[1] : null,
  }
}

// ─── Report shape ─────────────────────────────────────────────────────

interface ReviewRow {
  candidate_id?: string
  application_id?: string
  name: string
  matched_guest_id: string | null
  confidence: string
  reasons: string[]
}

interface NewCanonicalProposal {
  candidate_id?: string
  application_id?: string
  name: string
  would_create_guest_with_slug: string
  reasons: string[]
}

interface PassOutcome {
  scanned: number
  already_linked: number
  outcomes: {
    high_auto_link: number
    medium_auto_link: number
    low_requires_review: number
    none_would_create_canonical: number
  }
  writes_planned: { junction_inserts: number; guests_inserts: number }
  writes_actual: { junction_inserts: number; guests_inserts: number }
  review_queue: ReviewRow[]
  new_canonical_proposals: NewCanonicalProposal[]
}

interface Pass3Outcome {
  guests_scanned: number
  profiles_upserts_planned: number
  profiles_upserts_actual: number
}

interface Report {
  script_version: string
  started_at: string
  duration_ms: number
  mode: "dry-run" | "confirm" | "confirm-with-create"
  flags: Flags
  filters: { candidate_status: string; application_status: string }
  pass_1_candidates?: PassOutcome
  pass_2_applications?: PassOutcome
  pass_3_source_summary?: Pass3Outcome
  totals: {
    writes_planned: { guest_candidate_links: number; guest_application_links: number; guests: number; guest_identity_profiles: number }
    writes_actual:  { guest_candidate_links: number; guest_application_links: number; guests: number; guest_identity_profiles: number }
  }
  new_canonical_guest_ids: string[]
  errors: Array<{ pass: 1 | 2 | 3; row_id: string; error: string }>
}

function emptyPassOutcome(): PassOutcome {
  return {
    scanned: 0,
    already_linked: 0,
    outcomes: {
      high_auto_link: 0,
      medium_auto_link: 0,
      low_requires_review: 0,
      none_would_create_canonical: 0,
    },
    writes_planned: { junction_inserts: 0, guests_inserts: 0 },
    writes_actual: { junction_inserts: 0, guests_inserts: 0 },
    review_queue: [],
    new_canonical_proposals: [],
  }
}

// ─── Pass 1 — guest_candidates ────────────────────────────────────────

async function runPass1(flags: Flags, report: Report): Promise<void> {
  const out: PassOutcome = emptyPassOutcome()
  // Default filter: archived_at IS NULL AND deleted_at IS NULL (operator §12 Q1).
  const candidatesRes = await db!
    .select()
    .from(guestCandidates)
    .where(
      and(
        isNull(guestCandidates.archived_at),
        isNull(guestCandidates.deleted_at),
      ),
    )
  const candidates = candidatesRes
  out.scanned = candidates.length

  for (const c of candidates) {
    try {
      // Skip if junction already exists (idempotent re-run).
      const existing = await db!.execute(sql`
        SELECT 1 FROM guest_candidate_links WHERE candidate_id = ${c.id} LIMIT 1
      `) as unknown as { rows: unknown[] }
      if (existing.rows.length > 0) {
        out.already_linked++
        continue
      }

      // Build identity hints.
      const socials = await db!
        .select({
          platform: guestCandidateSocialLinks.platform,
          url: guestCandidateSocialLinks.url,
        })
        .from(guestCandidateSocialLinks)
        .where(eq(guestCandidateSocialLinks.candidate_id, c.id))
      const socialAccounts: GuestSocialAccounts = {}
      for (const s of socials) {
        const k = s.platform.toLowerCase()
        if (
          k === "twitter" || k === "instagram" || k === "youtube" ||
          k === "linkedin" || k === "tiktok" || k === "facebook" ||
          k === "website" || k === "podcast"
        ) {
          ;(socialAccounts as Record<string, string>)[k] = s.url
        }
      }
      const hints: IdentityHints = {
        name: c.full_name,
        slug: c.slug ?? null,
        country: c.country ?? null,
        bio: c.bio ?? null,
        social_accounts: socialAccounts,
      }

      // Preview the outcome — no writes.
      const preview = await previewEnsureGuest(hints)
      const action = routeOutcome(preview.confidence, {
        confirm: flags.confirm,
        confirmCreateCanonicals: flags.confirmCreateCanonicals,
      })

      // Tally outcomes.
      if (preview.confidence === "high") out.outcomes.high_auto_link++
      else if (preview.confidence === "medium") out.outcomes.medium_auto_link++
      else if (preview.confidence === "low") out.outcomes.low_requires_review++
      else if (preview.confidence === "none") out.outcomes.none_would_create_canonical++

      if (action === "requires_review") {
        if (out.review_queue.length < REPORT_LIST_CAP) {
          out.review_queue.push({
            candidate_id: c.id,
            name: c.full_name,
            matched_guest_id: preview.guest_id,
            confidence: preview.confidence,
            reasons: preview.reasons,
          })
        }
        continue
      }

      if (action === "would_create_canonical_skip") {
        if (out.new_canonical_proposals.length < REPORT_LIST_CAP) {
          out.new_canonical_proposals.push({
            candidate_id: c.id,
            name: c.full_name,
            would_create_guest_with_slug: preview.would_create_slug ?? "(unknown)",
            reasons: preview.reasons,
          })
        }
        out.writes_planned.guests_inserts++
        out.writes_planned.junction_inserts++
        continue
      }

      // auto_link (high or medium)
      out.writes_planned.junction_inserts++

      if (action === "auto_link" && flags.confirm) {
        // Existing canonical. preview.guest_id is set.
        if (!preview.guest_id) {
          report.errors.push({ pass: 1, row_id: c.id, error: "auto_link with null guest_id" })
          continue
        }
        await db!.execute(sql`
          INSERT INTO guest_candidate_links
            (id, guest_id, candidate_id, link_type, confidence, linked_by)
          VALUES
            (gen_random_uuid()::text, ${preview.guest_id}, ${c.id},
             'backfill', ${preview.confidence}, 'backfill-script')
          ON CONFLICT (candidate_id) DO NOTHING
        `)
        out.writes_actual.junction_inserts++
      } else if (action === "create_canonical_and_link") {
        // Create guest + write junction.
        const result = await ensureGuest(hints, { acceptance: "auto" })
        if (!result.guest_id) {
          report.errors.push({ pass: 1, row_id: c.id, error: "ensureGuest returned null guest_id on create" })
          continue
        }
        if (result.created) {
          out.writes_actual.guests_inserts++
          report.new_canonical_guest_ids.push(result.guest_id)
        }
        await db!.execute(sql`
          INSERT INTO guest_candidate_links
            (id, guest_id, candidate_id, link_type, confidence, linked_by)
          VALUES
            (gen_random_uuid()::text, ${result.guest_id}, ${c.id},
             'backfill', 'high', 'backfill-script')
          ON CONFLICT (candidate_id) DO NOTHING
        `)
        out.writes_actual.junction_inserts++
        out.new_canonical_proposals.push({
          candidate_id: c.id,
          name: c.full_name,
          would_create_guest_with_slug: preview.would_create_slug ?? "(applied)",
          reasons: preview.reasons,
        })
      }
    } catch (err) {
      report.errors.push({
        pass: 1,
        row_id: c.id,
        error: (err as Error).message ?? "unknown error",
      })
    }
  }

  report.pass_1_candidates = out
}

// ─── Pass 2 — guest_applications ──────────────────────────────────────

async function runPass2(flags: Flags, report: Report): Promise<void> {
  const out: PassOutcome = emptyPassOutcome()
  const applications = await db!
    .select()
    .from(guestApplications)
    .where(eq(guestApplications.status, "accepted"))
  out.scanned = applications.length

  for (const a of applications) {
    try {
      const existing = await db!.execute(sql`
        SELECT 1 FROM guest_application_links WHERE application_id = ${a.id} LIMIT 1
      `) as unknown as { rows: unknown[] }
      if (existing.rows.length > 0) {
        out.already_linked++
        continue
      }

      const parsed = parseSocialLinksBlob(a.social_links)
      const hints: IdentityHints = {
        name: a.name,
        country: a.country ?? null,
        social_accounts: parsed.social_accounts,
      }

      const preview = await previewEnsureGuest(hints)
      const action = routeOutcome(preview.confidence, {
        confirm: flags.confirm,
        confirmCreateCanonicals: flags.confirmCreateCanonicals,
      })

      if (preview.confidence === "high") out.outcomes.high_auto_link++
      else if (preview.confidence === "medium") out.outcomes.medium_auto_link++
      else if (preview.confidence === "low") out.outcomes.low_requires_review++
      else if (preview.confidence === "none") out.outcomes.none_would_create_canonical++

      if (action === "requires_review") {
        if (out.review_queue.length < REPORT_LIST_CAP) {
          out.review_queue.push({
            application_id: a.id,
            name: a.name,
            matched_guest_id: preview.guest_id,
            confidence: preview.confidence,
            reasons: preview.reasons,
          })
        }
        continue
      }

      if (action === "would_create_canonical_skip") {
        if (out.new_canonical_proposals.length < REPORT_LIST_CAP) {
          out.new_canonical_proposals.push({
            application_id: a.id,
            name: a.name,
            would_create_guest_with_slug: preview.would_create_slug ?? "(unknown)",
            reasons: preview.reasons,
          })
        }
        out.writes_planned.guests_inserts++
        out.writes_planned.junction_inserts++
        continue
      }

      out.writes_planned.junction_inserts++

      if (action === "auto_link" && flags.confirm) {
        if (!preview.guest_id) {
          report.errors.push({ pass: 2, row_id: a.id, error: "auto_link with null guest_id" })
          continue
        }
        await db!.execute(sql`
          INSERT INTO guest_application_links
            (id, guest_id, application_id, link_type, linked_by)
          VALUES
            (gen_random_uuid()::text, ${preview.guest_id}, ${a.id},
             'accepted', 'backfill-script')
          ON CONFLICT (application_id) DO NOTHING
        `)
        out.writes_actual.junction_inserts++
      } else if (action === "create_canonical_and_link") {
        const result = await ensureGuest(hints, { acceptance: "auto" })
        if (!result.guest_id) {
          report.errors.push({ pass: 2, row_id: a.id, error: "ensureGuest returned null guest_id on create" })
          continue
        }
        if (result.created) {
          out.writes_actual.guests_inserts++
          report.new_canonical_guest_ids.push(result.guest_id)
        }
        await db!.execute(sql`
          INSERT INTO guest_application_links
            (id, guest_id, application_id, link_type, linked_by)
          VALUES
            (gen_random_uuid()::text, ${result.guest_id}, ${a.id},
             'accepted', 'backfill-script')
          ON CONFLICT (application_id) DO NOTHING
        `)
        out.writes_actual.junction_inserts++
      }
    } catch (err) {
      report.errors.push({
        pass: 2,
        row_id: a.id,
        error: (err as Error).message ?? "unknown error",
      })
    }
  }

  report.pass_2_applications = out
}

// ─── Pass 3 — source_summary rebuild (merge, owned sections only) ─────

async function runPass3(flags: Flags, report: Report): Promise<void> {
  const out: Pass3Outcome = {
    guests_scanned: 0,
    profiles_upserts_planned: 0,
    profiles_upserts_actual: 0,
  }

  const allGuests = await db!.select({ id: guests.id, created_at: guests.created_at }).from(guests)
  out.guests_scanned = allGuests.length

  for (const g of allGuests) {
    try {
      // Compute the 4 sections this backfill owns.
      const discRes = (await db!.execute(sql`
        SELECT COUNT(*)::int AS n, MAX(created_at) AS last_seen
          FROM guest_discovery_links
         WHERE guest_id = ${g.id}
      `)) as unknown as { rows: Array<{ n: number; last_seen: Date | null }> }
      const candRes = (await db!.execute(sql`
        SELECT COUNT(*)::int AS n, MAX(linked_at) AS last_seen
          FROM guest_candidate_links
         WHERE guest_id = ${g.id}
      `)) as unknown as { rows: Array<{ n: number; last_seen: Date | null }> }
      const appRes = (await db!.execute(sql`
        SELECT gal.application_id, ga.created_at
          FROM guest_application_links gal
          JOIN guest_applications ga ON ga.id = gal.application_id
         WHERE gal.guest_id = ${g.id}
         ORDER BY gal.linked_at ASC
         LIMIT 1
      `)) as unknown as { rows: Array<{ application_id: string; created_at: Date | null }> }

      const ownedSections = buildSourceSummary({
        discovery: {
          runs: discRes.rows[0]?.n ?? 0,
          last_seen: discRes.rows[0]?.last_seen
            ? new Date(discRes.rows[0].last_seen).toISOString()
            : null,
        },
        application: {
          id: appRes.rows[0]?.application_id ?? null,
          received_at: appRes.rows[0]?.created_at
            ? new Date(appRes.rows[0].created_at).toISOString()
            : null,
        },
        candidates: {
          count: candRes.rows[0]?.n ?? 0,
          last_seen: candRes.rows[0]?.last_seen
            ? new Date(candRes.rows[0].last_seen).toISOString()
            : null,
        },
        studio: { sessions: 0, last_seen: null },
        preparation: { records: 0, last_seen: null },
        manual_last_seen: g.created_at ? g.created_at.toISOString() : null,
      })

      // Merge with existing source_summary so we don't clobber studio
      // / preparation sections written by other writers.
      const existingProfile = await db!
        .select({ id: guestIdentityProfiles.id, source_summary: guestIdentityProfiles.source_summary })
        .from(guestIdentityProfiles)
        .where(eq(guestIdentityProfiles.guest_id, g.id))
        .limit(1)
      const existing = existingProfile[0]?.source_summary as GuestSourceSummary | null
      const merged = mergeSourceSummary(existing ?? undefined, ownedSections)

      out.profiles_upserts_planned++
      if (flags.confirm) {
        if (existingProfile[0]) {
          await db!
            .update(guestIdentityProfiles)
            .set({
              source_summary: merged,
              updated_at: new Date(),
            })
            .where(eq(guestIdentityProfiles.id, existingProfile[0].id))
        } else {
          await db!.insert(guestIdentityProfiles).values({
            guest_id: g.id,
            source_summary: merged,
          })
        }
        out.profiles_upserts_actual++
      }
    } catch (err) {
      report.errors.push({
        pass: 3,
        row_id: g.id,
        error: (err as Error).message ?? "unknown error",
      })
    }
  }

  report.pass_3_source_summary = out
}

// ─── Report I/O ───────────────────────────────────────────────────────

function totalsFromReport(report: Report): void {
  const totals = report.totals
  if (report.pass_1_candidates) {
    totals.writes_planned.guest_candidate_links += report.pass_1_candidates.writes_planned.junction_inserts
    totals.writes_planned.guests += report.pass_1_candidates.writes_planned.guests_inserts
    totals.writes_actual.guest_candidate_links += report.pass_1_candidates.writes_actual.junction_inserts
    totals.writes_actual.guests += report.pass_1_candidates.writes_actual.guests_inserts
  }
  if (report.pass_2_applications) {
    totals.writes_planned.guest_application_links += report.pass_2_applications.writes_planned.junction_inserts
    totals.writes_planned.guests += report.pass_2_applications.writes_planned.guests_inserts
    totals.writes_actual.guest_application_links += report.pass_2_applications.writes_actual.junction_inserts
    totals.writes_actual.guests += report.pass_2_applications.writes_actual.guests_inserts
  }
  if (report.pass_3_source_summary) {
    totals.writes_planned.guest_identity_profiles += report.pass_3_source_summary.profiles_upserts_planned
    totals.writes_actual.guest_identity_profiles += report.pass_3_source_summary.profiles_upserts_actual
  }
}

function printHumanSummary(report: Report): void {
  console.log("")
  if (report.pass_1_candidates) {
    const p = report.pass_1_candidates
    console.log(`══ pass_1_candidates ════════════════════════════════════════`)
    console.log(`  scanned:                       ${p.scanned}`)
    console.log(`  already_linked:                ${p.already_linked}`)
    console.log(`  high_auto_link:                ${p.outcomes.high_auto_link}`)
    console.log(`  medium_auto_link:              ${p.outcomes.medium_auto_link}`)
    console.log(`  low_requires_review:           ${p.outcomes.low_requires_review}`)
    console.log(`  none_would_create_canonical:   ${p.outcomes.none_would_create_canonical}`)
    console.log(`  writes_planned:                junction=${p.writes_planned.junction_inserts}  guests=${p.writes_planned.guests_inserts}`)
    console.log(`  writes_actual:                 junction=${p.writes_actual.junction_inserts}  guests=${p.writes_actual.guests_inserts}`)
  }
  if (report.pass_2_applications) {
    const p = report.pass_2_applications
    console.log(`══ pass_2_applications ══════════════════════════════════════`)
    console.log(`  scanned:                       ${p.scanned}`)
    console.log(`  already_linked:                ${p.already_linked}`)
    console.log(`  high_auto_link:                ${p.outcomes.high_auto_link}`)
    console.log(`  medium_auto_link:              ${p.outcomes.medium_auto_link}`)
    console.log(`  low_requires_review:           ${p.outcomes.low_requires_review}`)
    console.log(`  none_would_create_canonical:   ${p.outcomes.none_would_create_canonical}`)
    console.log(`  writes_planned:                junction=${p.writes_planned.junction_inserts}  guests=${p.writes_planned.guests_inserts}`)
    console.log(`  writes_actual:                 junction=${p.writes_actual.junction_inserts}  guests=${p.writes_actual.guests_inserts}`)
  }
  if (report.pass_3_source_summary) {
    const p = report.pass_3_source_summary
    console.log(`══ pass_3_source_summary ════════════════════════════════════`)
    console.log(`  guests_scanned:                ${p.guests_scanned}`)
    console.log(`  profiles_upserts_planned:      ${p.profiles_upserts_planned}`)
    console.log(`  profiles_upserts_actual:       ${p.profiles_upserts_actual}`)
  }
  console.log(`══ totals ═══════════════════════════════════════════════════`)
  console.log(
    `  writes_planned: gcl=${report.totals.writes_planned.guest_candidate_links} ` +
      `gal=${report.totals.writes_planned.guest_application_links} ` +
      `guests=${report.totals.writes_planned.guests} ` +
      `profiles=${report.totals.writes_planned.guest_identity_profiles}`,
  )
  console.log(
    `  writes_actual:  gcl=${report.totals.writes_actual.guest_candidate_links} ` +
      `gal=${report.totals.writes_actual.guest_application_links} ` +
      `guests=${report.totals.writes_actual.guests} ` +
      `profiles=${report.totals.writes_actual.guest_identity_profiles}`,
  )
  console.log(`  duration_ms:    ${report.duration_ms}`)
  console.log(`  errors:         ${report.errors.length}`)
  console.log("")
  const headline =
    report.mode === "dry-run"
      ? "BACKFILL: DRY-RUN COMPLETE"
      : report.mode === "confirm"
        ? "BACKFILL: CONFIRM-WRITES COMPLETE"
        : "BACKFILL: CONFIRM-WITH-CREATE COMPLETE"
  console.log(`  ${headline}`)
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${SCRIPT_VERSION}]`)

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error(`[${SCRIPT_VERSION}] DATABASE_URL is not set — refusing`)
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[${SCRIPT_VERSION}] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
  }
  if (!db) {
    console.error(`[${SCRIPT_VERSION}] db is null`)
    process.exit(3)
  }

  const flags = parseFlags(process.argv.slice(2))
  const startedAt = new Date()
  const wallStart = Date.now()

  const report: Report = {
    script_version: SCRIPT_VERSION,
    started_at: startedAt.toISOString(),
    duration_ms: 0,
    mode: !flags.confirm
      ? "dry-run"
      : flags.confirmCreateCanonicals
        ? "confirm-with-create"
        : "confirm",
    flags,
    filters: {
      candidate_status: "archived_at IS NULL AND deleted_at IS NULL",
      application_status: "status = 'accepted'",
    },
    totals: {
      writes_planned: { guest_candidate_links: 0, guest_application_links: 0, guests: 0, guest_identity_profiles: 0 },
      writes_actual: { guest_candidate_links: 0, guest_application_links: 0, guests: 0, guest_identity_profiles: 0 },
    },
    new_canonical_guest_ids: [],
    errors: [],
  }

  if (flags.passes.includes(1)) await runPass1(flags, report)
  if (flags.passes.includes(2)) await runPass2(flags, report)
  if (flags.passes.includes(3)) await runPass3(flags, report)

  report.duration_ms = Date.now() - wallStart
  totalsFromReport(report)

  // JSON to stdout (always).
  console.log(JSON.stringify(report, null, 2))

  // Optional file output.
  if (flags.outputFile) {
    try {
      await writeFile(flags.outputFile, JSON.stringify(report, null, 2))
      console.log(`[${SCRIPT_VERSION}] report written to ${flags.outputFile}`)
    } catch (err) {
      console.error(
        `[${SCRIPT_VERSION}] failed to write output file: ${(err as Error).message}`,
      )
    }
  }

  // Human summary.
  printHumanSummary(report)

  await closeDb()
  process.exit(0)
}

main().catch(async (err) => {
  console.error(`[${SCRIPT_VERSION}] fatal:`, err)
  await closeDb()
  process.exit(3)
})
