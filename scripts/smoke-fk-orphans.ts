/**
 * Phase 1.4 — Soft-FK orphan smoke (wide sweep).
 *
 *   npm run smoke:fk-orphans
 *
 * Walks every soft `text` foreign key catalogued from the schema files
 * and reports orphan rows (non-null pointer where the referenced row is
 * missing). Read-only; no writes anywhere; hostname-guarded.
 *
 * Difference vs scripts/smoke-spine-joins.ts (P1.2):
 *   • P1.2 = 10 spine-centric joins (EIR axis), narrow + canonical.
 *   • P1.4 = every soft text FK across the codebase, grouped by
 *     referenced-target domain (EIR / Guests / Admin users / Episodes /
 *     Studio sessions / Cross-domain). Six of P1.4's checks overlap
 *     with P1.2 — that's expected; together they triangulate.
 *
 * Use P1.2 when actively editing the spine. Use P1.4 weekly + before
 * retention design (P1.5) + before structural work (Phase 4 / 5).
 *
 * Exit codes:
 *   0  every soft FK is clean
 *   1  at least one orphan detected
 *   2  query / connect error / refused-by-guard
 *
 * P1.4 does NOT fix anything.
 */

import { Client } from "pg"
import { promises as fs } from "node:fs"
import path from "node:path"

const SMOKE_VERSION = "fk-orphans-v1.1"
const ORPHAN_SAMPLE_LIMIT = 5
const ORPHAN_VALUE_FETCH_LIMIT = 1000
const SLOW_QUERY_THRESHOLD_MS = 500
const ALLOWLIST_PATH = path.resolve(process.cwd(), "evals/known-fk-drift.json")

// ─── Hostname guard (reused verbatim from P1.2) ──────────────────────

const PRODUCTION_HOSTNAME_PATTERNS: RegExp[] = [
  /\.ondigitalocean\.com/i,
  /\.rds\.amazonaws\.com/i,
  /\.supabase\.co/i,
  /\.neon\.tech/i,
  /\.railway\.app/i,
  /\.heroku\.com/i,
  /\.azure\.com/i,
]

function isLocalConnection(connectionString: string): { ok: boolean; reason?: string } {
  try {
    const url = new URL(connectionString.replace(/^postgres(ql)?:\/\//, "http://"))
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

// ─── Check catalogue ─────────────────────────────────────────────────

interface OrphanCheck {
  id: string
  domain: "EIR" | "Guests" | "Admin users" | "Episodes" | "Studio sessions" | "Cross-domain"
  table: string
  fk_column: string
  parent_table: string
  parent_column: string
  /** When true, NULL is expected (e.g. episodes.eir_id null for 77 pre-EIR imports). */
  null_ok: boolean
  /** Inline note shown next to the check when the soft-FK design is intentional. */
  note?: string
}

const CHECKS: OrphanCheck[] = [
  // ─── EIR-referencing (5 checks; overlap with P1.2) ────────────────
  { id: "eir-1",   domain: "EIR", table: "khat_map_episode_candidates", fk_column: "eir_id",       parent_table: "episode_intelligence_records", parent_column: "id", null_ok: true },
  { id: "eir-2",   domain: "EIR", table: "episode_preparations",        fk_column: "eir_id",       parent_table: "episode_intelligence_records", parent_column: "id", null_ok: true },
  { id: "eir-3",   domain: "EIR", table: "collaboration_rooms",         fk_column: "eir_id",       parent_table: "episode_intelligence_records", parent_column: "id", null_ok: true },
  { id: "eir-4",   domain: "EIR", table: "studio_sessions",             fk_column: "eir_id",       parent_table: "episode_intelligence_records", parent_column: "id", null_ok: true },
  { id: "eir-5",   domain: "EIR", table: "episodes",                    fk_column: "eir_id",       parent_table: "episode_intelligence_records", parent_column: "id", null_ok: true, note: "(NULL OK — 77 pre-EIR YouTube imports)" },

  // ─── Guests-referencing (1 check; overlap with P1.2) ──────────────
  { id: "guest-1", domain: "Guests", table: "guest_discovery_candidates", fk_column: "promoted_guest_id", parent_table: "guests", parent_column: "id", null_ok: true, note: "(soft so the discovery run survives guest deletion)" },

  // ─── Admin-user-referencing (text → admin_users.id, no FK by design) ───
  { id: "admin-1",  domain: "Admin users", table: "episode_intelligence_records",  fk_column: "created_by",   parent_table: "admin_users", parent_column: "id", null_ok: true },
  { id: "admin-2",  domain: "Admin users", table: "eir_phase_transitions",         fk_column: "actor_id",     parent_table: "admin_users", parent_column: "id", null_ok: true },
  { id: "admin-3",  domain: "Admin users", table: "episode_preparations",          fk_column: "created_by",   parent_table: "admin_users", parent_column: "id", null_ok: false },
  { id: "admin-4",  domain: "Admin users", table: "collaboration_rooms",           fk_column: "created_by",   parent_table: "admin_users", parent_column: "id", null_ok: false },
  // P1.4-PATCH: admin-5 removed.
  // The catalogue originally claimed khat_map_episode_candidates.created_by,
  // but that column does not exist on that table — the `created_by` I'd
  // pattern-matched at line 119 of khat-map.ts actually belongs to the
  // khat_map_seasons block. khat_map_seasons has NO inbound soft FKs we
  // need to check (it's a root); the `created_by` on it is a stamping
  // field for which we have no corresponding orphan-shape concern at the
  // P1.4 scope. Verified by reading the table blocks programmatically.
  { id: "admin-6",  domain: "Admin users", table: "khat_map_user_feedback",        fk_column: "admin_id",     parent_table: "admin_users", parent_column: "id", null_ok: true },
  { id: "admin-7",  domain: "Admin users", table: "khat_map_user_taste_profile",   fk_column: "user_id",      parent_table: "admin_users", parent_column: "id", null_ok: false },
  { id: "admin-8",  domain: "Admin users", table: "khat_map_season_decisions",     fk_column: "admin_id",     parent_table: "admin_users", parent_column: "id", null_ok: true },
  { id: "admin-9",  domain: "Admin users", table: "discovery_runs",                fk_column: "created_by",   parent_table: "admin_users", parent_column: "id", null_ok: true },
  { id: "admin-10", domain: "Admin users", table: "hybrid_topic_generations",      fk_column: "created_by",   parent_table: "admin_users", parent_column: "id", null_ok: true },
  { id: "admin-11", domain: "Admin users", table: "market_signal_review_events",   fk_column: "actor_id",     parent_table: "admin_users", parent_column: "id", null_ok: true, note: "(soft so historical events survive admin deletion)" },
  { id: "admin-12", domain: "Admin users", table: "market_trusted_sources",        fk_column: "created_by",   parent_table: "admin_users", parent_column: "id", null_ok: true },
  { id: "admin-13", domain: "Admin users", table: "market_topic_signals",          fk_column: "reviewed_by",  parent_table: "admin_users", parent_column: "id", null_ok: true },
  { id: "admin-14", domain: "Admin users", table: "newsletter_campaigns",          fk_column: "sent_by",      parent_table: "admin_users", parent_column: "id", null_ok: true },
  { id: "admin-15", domain: "Admin users", table: "guest_candidate_status_history", fk_column: "changed_by",  parent_table: "admin_users", parent_column: "id", null_ok: true },
  // P1.4-PATCH: table name corrected (no "guest_prep_drafts" in the
  // schema — the real table is "guest_prep_forms"). Column verified.
  { id: "admin-16", domain: "Admin users", table: "guest_prep_forms",              fk_column: "created_by",   parent_table: "admin_users", parent_column: "id", null_ok: false },
  { id: "admin-17", domain: "Admin users", table: "episode_versions",              fk_column: "created_by",   parent_table: "admin_users", parent_column: "id", null_ok: false },
  { id: "admin-18", domain: "Admin users", table: "deleted_episodes",              fk_column: "deleted_by",   parent_table: "admin_users", parent_column: "id", null_ok: true },

  // ─── Studio sessions + Episodes (cross-domain, soft) ──────────────
  { id: "studio-1", domain: "Studio sessions", table: "studio_analysis_records", fk_column: "studio_session_id", parent_table: "studio_sessions", parent_column: "id", null_ok: true },
  // P1.4-PATCH: ep-1 retargeted. The earlier catalogue claimed
  // studio_analysis_records.episode_id, but that column lives on the
  // sibling table `performance_snapshots` in the same schema file.
  { id: "ep-1",     domain: "Episodes", table: "performance_snapshots",   fk_column: "episode_id", parent_table: "episodes", parent_column: "id", null_ok: true },
  { id: "ep-2",     domain: "Episodes", table: "studio_sessions",         fk_column: "episode_id", parent_table: "episodes", parent_column: "id", null_ok: true },
  { id: "ep-3",     domain: "Episodes", table: "home_quotes",             fk_column: "episode_id", parent_table: "episodes", parent_column: "id", null_ok: true },
  { id: "ep-4",     domain: "Episodes", table: "daily_reflections",       fk_column: "episode_id", parent_table: "episodes", parent_column: "id", null_ok: true },
  { id: "ep-5",     domain: "Episodes", table: "homepage_featured",       fk_column: "episode_id", parent_table: "episodes", parent_column: "id", null_ok: false },

  // ─── Cross-domain residuals ───────────────────────────────────────
  { id: "cross-1",  domain: "Cross-domain", table: "guest_discovery_links",       fk_column: "discovery_run_id",            parent_table: "discovery_runs", parent_column: "id", null_ok: true },
  { id: "cross-2",  domain: "Cross-domain", table: "market_topic_signals",       fk_column: "trusted_source_id",            parent_table: "market_trusted_sources", parent_column: "id", null_ok: true },
  { id: "cross-3",  domain: "Cross-domain", table: "khat_map_episode_candidates", fk_column: "suggested_guest_candidate_id", parent_table: "guest_candidates", parent_column: "id", null_ok: true },
]

// ─── Allowlist (Phase 1.4-ALLOW) ────────────────────────────────────

interface AllowEntry {
  check_id: string
  bucket: string
  note: string
  allow_values?: string[]   // regex source strings
  max_orphans?: number
}

interface AllowFile {
  $schema_version: string
  buckets?: Record<string, string>
  allowed: AllowEntry[]
}

interface AllowResolved {
  bucket: string
  note: string
  allow_patterns: RegExp[]
  max_orphans: number
}

async function loadAllowlist(): Promise<Map<string, AllowResolved>> {
  const out = new Map<string, AllowResolved>()
  try {
    const raw = await fs.readFile(ALLOWLIST_PATH, "utf8")
    const parsed = JSON.parse(raw) as AllowFile
    if (!Array.isArray(parsed.allowed)) {
      throw new Error("allowlist.allowed[] missing or not an array")
    }
    for (const entry of parsed.allowed) {
      const patterns = (entry.allow_values ?? []).map(
        (src) => new RegExp(src),
      )
      out.set(entry.check_id, {
        bucket: entry.bucket,
        note: entry.note,
        allow_patterns: patterns,
        max_orphans: entry.max_orphans ?? 0,
      })
    }
    return out
  } catch (err) {
    // Missing allowlist = nothing acknowledged. Smoke still runs.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(
        `[smoke-fk-orphans] WARN: allowlist not found at ${ALLOWLIST_PATH} — every orphan will be treated as new drift.`,
      )
      return out
    }
    throw err
  }
}

// ─── Result types ────────────────────────────────────────────────────

interface CheckResult {
  check: OrphanCheck
  total_pointer_rows: number
  joinable: number
  orphans: number
  /** Orphans whose values match an allow_values pattern. */
  acknowledged_by_pattern: number
  /** Orphans absorbed by the max_orphans count cap. */
  acknowledged_by_cap: number
  /** Orphans the allowlist does NOT cover. Drives exit code. */
  new_drift: number
  /** Allow entry that applied, if any. */
  allow_bucket?: string
  /** Whether observed is strictly under max_orphans (operator could tighten). */
  improving?: boolean
  query_ms: number
  orphan_samples: string[]
  /** When the check fails because the parent table doesn't exist. */
  schema_skip?: string
}

// ─── Runner ──────────────────────────────────────────────────────────

async function tableExists(client: Client, table: string): Promise<boolean> {
  const r = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table],
  )
  return r.rows[0]?.exists === true
}

async function runCheck(
  client: Client,
  check: OrphanCheck,
  allow: AllowResolved | undefined,
): Promise<CheckResult> {
  const t0 = Date.now()
  const out: CheckResult = {
    check,
    total_pointer_rows: 0,
    joinable: 0,
    orphans: 0,
    acknowledged_by_pattern: 0,
    acknowledged_by_cap: 0,
    new_drift: 0,
    allow_bucket: allow?.bucket,
    query_ms: 0,
    orphan_samples: [],
  }

  // Defensive: skip checks whose child or parent table doesn't actually
  // exist in the local DB. The catalogue claims a table; if a migration
  // has dropped it, we don't want a SQL error here — we want a clean skip.
  const [childOk, parentOk] = await Promise.all([
    tableExists(client, check.table),
    tableExists(client, check.parent_table),
  ])
  if (!childOk) {
    out.schema_skip = `table "${check.table}" not found in local DB`
    out.query_ms = Date.now() - t0
    return out
  }
  if (!parentOk) {
    out.schema_skip = `parent table "${check.parent_table}" not found in local DB`
    out.query_ms = Date.now() - t0
    return out
  }

  const totalQ = `
    SELECT COUNT(*)::int AS n
    FROM "${check.table}"
    WHERE ${check.null_ok ? `"${check.fk_column}" IS NOT NULL` : "TRUE"}
  `
  // Cast both sides of the join key to text. admin_users.id is uuid,
  // every soft FK pointing at it is text — Postgres refuses the implicit
  // cross-type comparison. ::text is a no-op on text columns and a safe
  // cast on uuid columns, so this works for every parent-table type.
  const orphanQ = `
    SELECT COUNT(*)::int AS n
    FROM "${check.table}" c
    LEFT JOIN "${check.parent_table}" p
      ON p."${check.parent_column}"::text = c."${check.fk_column}"::text
    WHERE c."${check.fk_column}" IS NOT NULL
      AND p."${check.parent_column}" IS NULL
  `
  // Two fetch modes: when the allowlist has patterns we need ALL orphan
  // values (capped at ORPHAN_VALUE_FETCH_LIMIT) so we can match each
  // against the patterns. Otherwise the existing 5-sample query is
  // enough — display only.
  const hasPatterns = !!allow && allow.allow_patterns.length > 0
  const fetchLimit = hasPatterns ? ORPHAN_VALUE_FETCH_LIMIT : ORPHAN_SAMPLE_LIMIT
  const sampleQ = `
    SELECT c."${check.fk_column}" AS orphan_value
    FROM "${check.table}" c
    LEFT JOIN "${check.parent_table}" p
      ON p."${check.parent_column}"::text = c."${check.fk_column}"::text
    WHERE c."${check.fk_column}" IS NOT NULL
      AND p."${check.parent_column}" IS NULL
    LIMIT ${fetchLimit}
  `

  const [tot, orph] = await Promise.all([
    client.query<{ n: number }>(totalQ),
    client.query<{ n: number }>(orphanQ),
  ])

  out.total_pointer_rows = tot.rows[0]?.n ?? 0
  out.orphans = orph.rows[0]?.n ?? 0
  out.joinable = Math.max(0, out.total_pointer_rows - out.orphans)

  let fetchedValues: string[] = []
  if (out.orphans > 0) {
    const samples = await client.query<{ orphan_value: string }>(sampleQ)
    fetchedValues = samples.rows.map((r) => r.orphan_value)
    // Display samples: always the first 5 of whatever we fetched.
    out.orphan_samples = fetchedValues.slice(0, ORPHAN_SAMPLE_LIMIT)
  }

  // ─── Allowlist classification ─────────────────────────────────────
  if (allow && out.orphans > 0) {
    if (hasPatterns) {
      // Match each fetched value against patterns.
      let matched = 0
      for (const v of fetchedValues) {
        if (allow.allow_patterns.some((re) => re.test(v))) matched++
      }
      out.acknowledged_by_pattern = matched
      // If the count of orphans exceeds what we fetched (truncated by
      // limit), conservatively treat the difference as un-matched —
      // can't pattern-test what we didn't see.
      const unfetched = Math.max(0, out.orphans - fetchedValues.length)
      const unmatched = out.orphans - matched - unfetched + unfetched
      // ^ unmatched = orphans - matched (unfetched are conservatively unmatched)
      const cap = allow.max_orphans
      out.acknowledged_by_cap = Math.min(cap, unmatched)
      out.new_drift = unmatched - out.acknowledged_by_cap
    } else {
      // No patterns — just count-cap.
      out.acknowledged_by_cap = Math.min(allow.max_orphans, out.orphans)
      out.new_drift = out.orphans - out.acknowledged_by_cap
    }
    out.improving =
      allow.max_orphans > 0 &&
      out.orphans <
        allow.max_orphans + out.acknowledged_by_pattern &&
      out.new_drift === 0
  } else {
    // No allowlist entry → every orphan is new drift.
    out.new_drift = out.orphans
  }

  out.query_ms = Date.now() - t0
  return out
}

function formatLine(r: CheckResult): string {
  if (r.schema_skip) {
    return `· ${r.check.id.padEnd(10)}  ${(r.check.table + "." + r.check.fk_column).padEnd(58)}  SKIP (${r.schema_skip})`
  }
  // Mark:
  //   ✓ clean         orphans == 0
  //   ~ acknowledged  orphans > 0 && new_drift == 0
  //   ✗ new drift     new_drift > 0
  const mark = r.orphans === 0 ? "✓" : r.new_drift > 0 ? "✗" : "~"
  const idCol = r.check.id.padEnd(10)
  const arrow = `${r.check.table}.${r.check.fk_column} → ${r.check.parent_table}.${r.check.parent_column}`
  const arrowCol = arrow.padEnd(78)
  const counts =
    `total=${String(r.total_pointer_rows).padStart(5)}` +
    `  orphans=${String(r.orphans).padStart(4)}` +
    `  new=${String(r.new_drift).padStart(3)}` +
    `  ${String(r.query_ms).padStart(5)}ms`

  let extra = ""
  if (r.allow_bucket && r.orphans > 0) {
    const ackBits: string[] = []
    if (r.acknowledged_by_pattern > 0) ackBits.push(`${r.acknowledged_by_pattern} by pattern`)
    if (r.acknowledged_by_cap > 0) ackBits.push(`${r.acknowledged_by_cap} by cap`)
    extra = `  ack:[${r.allow_bucket}] (${ackBits.join(", ") || "none"})`
    if (r.improving) extra += "  (improving — consider tightening allowlist)"
  } else if (r.check.note) {
    extra = `  ${r.check.note}`
  }

  return `${mark} ${idCol}  ${arrowCol}  ${counts}${extra}`
}

async function main() {
  console.log(`[smoke-fk-orphans] ${SMOKE_VERSION}`)

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[smoke-fk-orphans] DATABASE_URL is not set — refusing to run")
    process.exit(2)
  }

  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(`[smoke-fk-orphans] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`)
      process.exit(2)
    }
  } else {
    console.log("[smoke-fk-orphans] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed")
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  })

  // Load the allowlist before connecting so any JSON error halts early.
  const allowMap = await loadAllowlist()

  const wallStart = Date.now()
  try {
    await client.connect()
  } catch (err) {
    console.error("[smoke-fk-orphans] could not connect:", (err as Error).message)
    process.exit(2)
  }

  const results: CheckResult[] = []
  let queryError: { id: string; message: string } | null = null

  for (const check of CHECKS) {
    try {
      results.push(await runCheck(client, check, allowMap.get(check.id)))
    } catch (err) {
      queryError = { id: check.id, message: (err as Error).message }
      break
    }
  }

  try {
    await client.end()
  } catch {
    // ignore
  }

  // ─── Grouped output ─────────────────────────────────────────────
  const domains: OrphanCheck["domain"][] = [
    "EIR",
    "Guests",
    "Admin users",
    "Episodes",
    "Studio sessions",
    "Cross-domain",
  ]
  console.log("")
  for (const d of domains) {
    const rows = results.filter((r) => r.check.domain === d)
    if (rows.length === 0) continue
    console.log(`DOMAIN: ${d} ─────────────────────────────────────────`)
    for (const r of rows) console.log(formatLine(r))
    console.log("")
  }

  // ─── Slow queries warning ───────────────────────────────────────
  const slow = results.filter(
    (r) => !r.schema_skip && r.query_ms > SLOW_QUERY_THRESHOLD_MS,
  )
  if (slow.length > 0) {
    console.log("NOTE — slow queries (consider an index on the FK column):")
    for (const r of slow) {
      console.log(`  • ${r.check.id} ${r.check.table}.${r.check.fk_column} took ${r.query_ms}ms`)
    }
    console.log("")
  }

  // ─── Drift details ──────────────────────────────────────────────
  const newDriftReports = results.filter((r) => r.new_drift > 0)
  const ackOnlyReports = results.filter((r) => r.orphans > 0 && r.new_drift === 0)

  if (newDriftReports.length > 0) {
    console.log("NEW DRIFT (not covered by allowlist; first 5 sample values):")
    for (const r of newDriftReports) {
      console.log(
        `  • ${r.check.id} (${r.check.table}.${r.check.fk_column}) — ${r.new_drift} new of ${r.orphans} total`,
      )
      for (const s of r.orphan_samples) console.log(`      ${s}`)
    }
    console.log("")
    console.log("Phase 1.4 does NOT fix drift — either acknowledge in evals/known-fk-drift.json or escalate to operator/Phase 4-5.")
    console.log("")
  }
  if (ackOnlyReports.length > 0) {
    console.log("ACKNOWLEDGED DRIFT (within allowlist):")
    for (const r of ackOnlyReports) {
      const bucket = r.allow_bucket ? `[${r.allow_bucket}] ` : ""
      console.log(
        `  ~ ${r.check.id} ${bucket}${r.check.table}.${r.check.fk_column} — ${r.orphans} orphan(s) acknowledged`,
      )
    }
    console.log("")
  }

  // ─── Summary ────────────────────────────────────────────────────
  const skipped = results.filter((r) => r.schema_skip).length
  const clean = results.filter((r) => r.orphans === 0 && !r.schema_skip).length
  const totalChecks = results.length
  const totalAckByPattern = results.reduce((s, r) => s + r.acknowledged_by_pattern, 0)
  const totalAckByCap = results.reduce((s, r) => s + r.acknowledged_by_cap, 0)
  const totalNewDrift = results.reduce((s, r) => s + r.new_drift, 0)
  const wallMs = Date.now() - wallStart
  console.log("SUMMARY")
  console.log(`  Total checks:           ${totalChecks}`)
  console.log(`  Clean (no orphans):     ${clean}`)
  console.log(`  Acknowledged drift:     ${ackOnlyReports.length} check(s)  (orphans: ${totalAckByPattern + totalAckByCap} = ${totalAckByPattern} pattern + ${totalAckByCap} cap)`)
  console.log(`  New drift:              ${newDriftReports.length} check(s)  (orphans: ${totalNewDrift})`)
  console.log(`  Skipped (no table):     ${skipped}`)
  console.log(`  Wall time:              ${wallMs} ms`)

  if (queryError) {
    console.error("")
    console.error(`[smoke-fk-orphans] FAILED: check "${queryError.id}" errored — ${queryError.message}`)
    process.exit(2)
  }

  if (newDriftReports.length > 0) {
    console.error("")
    console.error("[smoke-fk-orphans] FAILED: new soft-FK drift detected (exit 1)")
    process.exit(1)
  }

  console.log("")
  if (ackOnlyReports.length > 0) {
    console.log(
      `[smoke-fk-orphans] PASSED: ${clean} clean, ${ackOnlyReports.length} with acknowledged drift, 0 new drift`,
    )
  } else {
    console.log("[smoke-fk-orphans] PASSED: every soft-FK is clean")
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("[smoke-fk-orphans] fatal:", err)
  process.exit(2)
})
