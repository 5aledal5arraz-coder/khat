/**
 * Phase 2.4.e.1 — deeper guest-identity integrity scan (CLI).
 *
 *   npm run scan:guest-identity-integrity                          # text summary
 *   npm run scan:guest-identity-integrity -- --output=report.json  # text + JSON file
 *   npm run scan:guest-identity-integrity -- --max-guests=10000    # widen CLI scan cap
 *   npm run scan:guest-identity-integrity -- --days-stale=180      # stale threshold
 *
 *   # JSON to stdout (for jq/script pipelines).
 *   # IMPORTANT: `npm run` ITSELF prints a 2-line banner to stdout
 *   # before the script runs, which breaks `| jq`. Use one of:
 *   #
 *   #   npm run --silent scan:guest-identity-integrity -- --json | jq '.severity'
 *   #   npx tsx scripts/scan-guest-identity-integrity.ts --json   | jq '.severity'
 *
 * Read-only. Produces:
 *   1. A human-readable text summary on stdout (default mode).
 *      Sections: counters, duplicate-name groups, social-handle dups,
 *      website-host dups, unlinked candidates, unlinked applications,
 *      stale profiles, recent linked-events.
 *   2. A deterministic JSON document, EITHER:
 *      - written to `--output=PATH` (recommended for scripted use,
 *        works regardless of npm's banner because the file is the
 *        target), OR
 *      - emitted to stdout in `--json` mode (the script writes ONLY
 *        the JSON document to stdout; nothing else from THIS script
 *        touches stdout in this mode).
 *
 * Determinism notes:
 *   - All list orderings come from the integrity lib (operator
 *     constraint: deterministic ordering).
 *   - JSON top-level keys are written in insertion order (Node
 *     preserves it). Sections appear in a fixed sequence regardless
 *     of result contents.
 *   - Dates are serialized as ISO-8601 strings via Date#toJSON, which
 *     is locale-independent.
 *
 * Stream discipline in `--json` mode (post Gate-7):
 *   - stdout: pure JSON document, nothing else. No banners, no
 *     summaries, no ANSI, no trailing diagnostics from THIS script.
 *   - stderr: hostname-guard refusal messages, fatal errors. Anything
 *     informational stays out of stdout.
 *   - The 2-line `> pkg@ver script\n> command\n` header that
 *     `npm run` emits is OUTSIDE this script's process — npm writes
 *     it before spawning the child. The script cannot suppress it.
 *     Use `npm run --silent` or invoke via `npx tsx` directly.
 *
 * Hostname-guarded — refuses non-localhost DATABASE_URL unless
 * SMOKE_ALLOW_REMOTE=1. The CLI is read-only, but the convention
 * matches every other smoke / scan script in this codebase so
 * operators don't have to remember which scripts touch managed DBs.
 *
 * Exit codes:
 *   0 — scan completed; the report describes the state.
 *   2 — hostname guard refused, missing DATABASE_URL, fatal scan error.
 */

import { promises as fs } from "node:fs"
import path from "node:path"

import {
  countDuplicateGuestNameGroups,
  countGuestIdentityLinkedEvents,
  countStaleIdentityProfiles,
  countUnlinkedAcceptedApplications,
  countUnlinkedAcceptedCandidates,
  listDuplicateGuestNameGroups,
  listSocialHandleDuplicates,
  listStaleIdentityProfiles,
  listUnlinkedAcceptedApplications,
  listUnlinkedAcceptedCandidates,
  listWebsiteHostDuplicates,
  severityFor,
  DEFAULT_CLI_MAX_GUESTS,
  DEFAULT_STALE_DAYS,
  DEFAULT_LIST_LIMIT,
  DEFAULT_DUPLICATE_GROUP_LIMIT,
} from "@/lib/guest-identity/integrity"

const SCAN_VERSION = "scan-guest-identity-integrity-v1.0"

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

// ─── CLI args ────────────────────────────────────────────────────────

interface Args {
  output: string | null
  jsonOnly: boolean
  maxGuests: number
  daysStale: number
  limit: number
  groupLimit: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    output: null,
    jsonOnly: false,
    maxGuests: DEFAULT_CLI_MAX_GUESTS,
    daysStale: DEFAULT_STALE_DAYS,
    limit: DEFAULT_LIST_LIMIT,
    groupLimit: DEFAULT_DUPLICATE_GROUP_LIMIT,
  }
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (tok === "--json") {
      args.jsonOnly = true
    } else if (tok.startsWith("--output=")) {
      args.output = tok.slice("--output=".length)
    } else if (tok.startsWith("--max-guests=")) {
      args.maxGuests = Math.max(1, parseInt(tok.slice("--max-guests=".length), 10) || DEFAULT_CLI_MAX_GUESTS)
    } else if (tok.startsWith("--days-stale=")) {
      args.daysStale = Math.max(1, parseInt(tok.slice("--days-stale=".length), 10) || DEFAULT_STALE_DAYS)
    } else if (tok.startsWith("--limit=")) {
      args.limit = Math.max(1, parseInt(tok.slice("--limit=".length), 10) || DEFAULT_LIST_LIMIT)
    } else if (tok.startsWith("--group-limit=")) {
      args.groupLimit = Math.max(1, parseInt(tok.slice("--group-limit=".length), 10) || DEFAULT_DUPLICATE_GROUP_LIMIT)
    } else if (tok === "--help" || tok === "-h") {
      printUsage()
      process.exit(0)
    }
  }
  return args
}

function printUsage(): void {
  console.log(`${SCAN_VERSION}

Usage: npm run scan:guest-identity-integrity -- [options]

Options:
  --output=PATH         Write deterministic JSON to PATH (recommended).
  --json                Emit JSON to stdout (suppresses text summary).
  --max-guests=N        Cap CLI deep-scan input rows (default ${DEFAULT_CLI_MAX_GUESTS}).
  --days-stale=N        Profile staleness window (default ${DEFAULT_STALE_DAYS}).
  --limit=N             Max rows per unlinked / stale list (default ${DEFAULT_LIST_LIMIT}).
  --group-limit=N       Max duplicate-name groups returned (default ${DEFAULT_DUPLICATE_GROUP_LIMIT}).
  --help                Show this help.

Piping --json to jq:
  npm run prepends a 2-line "> pkg@ver script\\n> command\\n" banner
  to stdout BEFORE this script runs. That banner breaks pipes to jq.
  Use one of the following invocations instead:

    npm run --silent scan:guest-identity-integrity -- --json | jq '.severity'
    npx tsx scripts/scan-guest-identity-integrity.ts --json   | jq '.severity'

  Both produce pure JSON on stdout.

  Alternative: --output=PATH writes the JSON to a file and is unaffected
  by npm's banner.
`)
}

// ─── Report shape (matches JSON output) ──────────────────────────────

/**
 * Stable JSON shape — top-level keys are emitted in this order.
 * Every nested list is ordered by the integrity lib's defined sort
 * key (see lib/guest-identity/integrity.ts).
 */
interface Report {
  version: string
  generated_at: string
  parameters: {
    max_guests: number
    days_stale: number
    list_limit: number
    group_limit: number
  }
  counts: {
    duplicate_groups: number
    duplicate_guests_total: number
    unlinked_accepted_candidates: number
    unlinked_accepted_applications: number
    stale_profiles: number
    linked_events_24h: {
      total: number
      created_guest_true: number
      created_guest_false: number
    }
  }
  severity: {
    duplicate_groups: "info" | "warn" | "error"
    unlinked_accepted_candidates: "info" | "warn" | "error"
    unlinked_accepted_applications: "info" | "warn" | "error"
    stale_profiles: "info" | "warn" | "error"
  }
  duplicates_by_name: Array<{
    norm: string
    group_size: number
    most_connected_id: string
    members: Array<{
      id: string
      name: string
      slug: string
      created_at: string
      episodes: number
      candidate_links: number
      application_links: number
      has_profile: boolean
    }>
  }>
  duplicates_by_social_handle: {
    scanned: number
    truncated: boolean
    groups: Array<{
      platform: string
      handle: string
      members: Array<{ id: string; name: string; slug: string }>
    }>
  }
  duplicates_by_website_host: {
    scanned: number
    truncated: boolean
    groups: Array<{
      host: string
      members: Array<{
        id: string
        name: string
        slug: string
        website: string
      }>
    }>
  }
  unlinked_accepted_candidates: Array<{
    id: string
    full_name: string
    display_name: string | null
    status: string
    country: string | null
    created_at: string
    updated_at: string
  }>
  unlinked_accepted_applications: Array<{
    id: string
    name: string
    country: string | null
    created_at: string
  }>
  stale_identity_profiles: Array<{
    guest_id: string
    guest_name: string
    guest_slug: string
    last_analyzed_at: string | null
  }>
}

// ─── Build the report ────────────────────────────────────────────────

async function buildReport(args: Args): Promise<Report> {
  // Counters in parallel — the integrity lib uses Promise.all internally.
  const [
    dupCounts,
    unlinkedCandCount,
    unlinkedAppCount,
    staleCount,
    eventCounts,
  ] = await Promise.all([
    countDuplicateGuestNameGroups(),
    countUnlinkedAcceptedCandidates(),
    countUnlinkedAcceptedApplications(),
    countStaleIdentityProfiles({ daysOld: args.daysStale }),
    countGuestIdentityLinkedEvents({ hours: 24 }),
  ])

  // Lists in parallel. Each list is independently bounded; this stays
  // well under the smoke's perf gate.
  const [
    nameGroups,
    socialDups,
    websiteDups,
    unlinkedCandidates,
    unlinkedApplications,
    staleProfiles,
  ] = await Promise.all([
    listDuplicateGuestNameGroups({ limit: args.groupLimit }),
    listSocialHandleDuplicates({ maxGuests: args.maxGuests }),
    listWebsiteHostDuplicates({ maxGuests: args.maxGuests }),
    listUnlinkedAcceptedCandidates({ limit: args.limit }),
    listUnlinkedAcceptedApplications({ limit: args.limit }),
    listStaleIdentityProfiles({
      daysOld: args.daysStale,
      limit: args.limit,
    }),
  ])

  const report: Report = {
    version: SCAN_VERSION,
    generated_at: new Date().toISOString(),
    parameters: {
      max_guests: args.maxGuests,
      days_stale: args.daysStale,
      list_limit: args.limit,
      group_limit: args.groupLimit,
    },
    counts: {
      duplicate_groups: dupCounts.groups,
      duplicate_guests_total: dupCounts.guests,
      unlinked_accepted_candidates: unlinkedCandCount,
      unlinked_accepted_applications: unlinkedAppCount,
      stale_profiles: staleCount,
      linked_events_24h: eventCounts,
    },
    severity: {
      duplicate_groups: severityFor("duplicateGroups", dupCounts.groups),
      unlinked_accepted_candidates: severityFor(
        "unlinkedAcceptedCandidates",
        unlinkedCandCount,
      ),
      unlinked_accepted_applications: severityFor(
        "unlinkedAcceptedApplications",
        unlinkedAppCount,
      ),
      stale_profiles: severityFor("staleProfiles", staleCount),
    },
    duplicates_by_name: nameGroups.map((g) => ({
      norm: g.norm,
      group_size: g.group_size,
      most_connected_id: g.most_connected_id,
      members: g.members.map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        created_at: m.created_at.toISOString(),
        episodes: m.episodes,
        candidate_links: m.candidate_links,
        application_links: m.application_links,
        has_profile: m.has_profile,
      })),
    })),
    duplicates_by_social_handle: {
      scanned: socialDups.scanned,
      truncated: socialDups.truncated,
      groups: socialDups.groups,
    },
    duplicates_by_website_host: {
      scanned: websiteDups.scanned,
      truncated: websiteDups.truncated,
      groups: websiteDups.groups,
    },
    unlinked_accepted_candidates: unlinkedCandidates.map((c) => ({
      id: c.id,
      full_name: c.full_name,
      display_name: c.display_name,
      status: c.status,
      country: c.country,
      created_at: c.created_at.toISOString(),
      updated_at: c.updated_at.toISOString(),
    })),
    unlinked_accepted_applications: unlinkedApplications.map((a) => ({
      id: a.id,
      name: a.name,
      country: a.country,
      created_at: a.created_at.toISOString(),
    })),
    stale_identity_profiles: staleProfiles.map((s) => ({
      guest_id: s.guest_id,
      guest_name: s.guest_name,
      guest_slug: s.guest_slug,
      last_analyzed_at: s.last_analyzed_at
        ? s.last_analyzed_at.toISOString()
        : null,
    })),
  }
  return report
}

// ─── Text formatter ──────────────────────────────────────────────────

/**
 * Write a human-readable summary to the given stream. The format is
 * intentionally line-oriented so operators can grep and diff between
 * runs. Truncation markers ("… and N more") appear at the bottom of
 * each list when the bounded fetch returned the cap.
 */
function writeTextSummary(r: Report, write: (line: string) => void): void {
  write(`[${r.version}] generated_at=${r.generated_at}`)
  write(``)
  write(`Counts (24h):`)
  write(`  duplicate name groups          : ${r.counts.duplicate_groups} (severity=${r.severity.duplicate_groups})`)
  write(`    guests across dup groups     : ${r.counts.duplicate_guests_total}`)
  write(`  unlinked accepted candidates   : ${r.counts.unlinked_accepted_candidates} (severity=${r.severity.unlinked_accepted_candidates})`)
  write(`  unlinked accepted applications : ${r.counts.unlinked_accepted_applications} (severity=${r.severity.unlinked_accepted_applications})`)
  write(`  stale identity profiles        : ${r.counts.stale_profiles} (severity=${r.severity.stale_profiles}, threshold=${r.parameters.days_stale}d)`)
  write(`  linked events                  : ${r.counts.linked_events_24h.total} (${r.counts.linked_events_24h.created_guest_true} new canonicals, ${r.counts.linked_events_24h.created_guest_false} bound to existing)`)
  write(``)

  write(`Duplicate canonical guests — by normalized name (top ${r.parameters.group_limit}):`)
  if (r.duplicates_by_name.length === 0) {
    write(`  (none)`)
  } else {
    for (const g of r.duplicates_by_name) {
      write(`  [size=${g.group_size}] "${g.norm}"  most_connected=${g.most_connected_id}`)
      for (const m of g.members) {
        const mark = m.id === g.most_connected_id ? "*" : " "
        write(
          `    ${mark} ${m.id}  "${m.name}"  ` +
            `eps=${m.episodes} cand=${m.candidate_links} app=${m.application_links} prof=${m.has_profile ? "y" : "n"}  ` +
            `(${m.created_at})`,
        )
      }
    }
  }
  write(``)

  write(`Duplicate canonical guests — by social handle (scanned=${r.duplicates_by_social_handle.scanned}${r.duplicates_by_social_handle.truncated ? ", TRUNCATED" : ""}):`)
  if (r.duplicates_by_social_handle.groups.length === 0) {
    write(`  (none)`)
  } else {
    for (const g of r.duplicates_by_social_handle.groups) {
      write(`  [${g.platform}] @${g.handle}  (${g.members.length} guests)`)
      for (const m of g.members) {
        write(`    - ${m.id}  "${m.name}"`)
      }
    }
  }
  write(``)

  write(`Duplicate canonical guests — by website host (scanned=${r.duplicates_by_website_host.scanned}${r.duplicates_by_website_host.truncated ? ", TRUNCATED" : ""}):`)
  if (r.duplicates_by_website_host.groups.length === 0) {
    write(`  (none)`)
  } else {
    for (const g of r.duplicates_by_website_host.groups) {
      write(`  ${g.host}  (${g.members.length} guests)`)
      for (const m of g.members) {
        write(`    - ${m.id}  "${m.name}"  ${m.website}`)
      }
    }
  }
  write(``)

  write(`Unlinked accepted candidates (top ${r.parameters.list_limit}):`)
  if (r.unlinked_accepted_candidates.length === 0) {
    write(`  (none)`)
  } else {
    for (const c of r.unlinked_accepted_candidates) {
      write(`  ${c.id}  [${c.status}]  "${c.full_name}"  (updated ${c.updated_at})`)
    }
  }
  write(``)

  write(`Unlinked accepted applications (top ${r.parameters.list_limit}):`)
  if (r.unlinked_accepted_applications.length === 0) {
    write(`  (none)`)
  } else {
    for (const a of r.unlinked_accepted_applications) {
      write(`  ${a.id}  "${a.name}"  ${a.country ?? "—"}  (received ${a.created_at})`)
    }
  }
  write(``)

  write(`Stale identity profiles (threshold=${r.parameters.days_stale}d, top ${r.parameters.list_limit}):`)
  if (r.stale_identity_profiles.length === 0) {
    write(`  (none)`)
  } else {
    for (const p of r.stale_identity_profiles) {
      write(`  ${p.guest_id}  "${p.guest_name}"  last_analyzed=${p.last_analyzed_at ?? "NEVER"}`)
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error(`[${SCAN_VERSION}] DATABASE_URL is not set — refusing`)
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[${SCAN_VERSION}] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override (NOT recommended).`,
      )
      process.exit(2)
    }
  }

  const report = await buildReport(args)

  if (args.jsonOnly) {
    // Pure JSON to stdout — operator can pipe to jq/etc.
    process.stdout.write(JSON.stringify(report, null, 2) + "\n")
    return
  }

  // Text summary always to stderr-ish; in non-JSON mode use stdout so
  // operators see it without `2>&1`. When --output is provided we
  // ALSO write the JSON file alongside the text summary.
  writeTextSummary(report, (line) => process.stdout.write(line + "\n"))

  if (args.output) {
    const abs = path.resolve(process.cwd(), args.output)
    await fs.writeFile(abs, JSON.stringify(report, null, 2) + "\n", "utf8")
    process.stdout.write(`\n[${SCAN_VERSION}] wrote JSON report to ${abs}\n`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${SCAN_VERSION}] fatal:`, err)
    process.exit(2)
  })
