/**
 * Phase 2.4 (P2.4.a) — structural smoke for the guest-identity substrate.
 *
 *   npm run smoke:guest-identity-schema
 *
 * Pure read-only. Verifies the two junction tables, their indexes, the
 * FK constraints, and the new fk_gdc_promoted_guest constraint on
 * guest_discovery_candidates. No mutations. Hostname-guarded.
 *
 * 8 assertions per P2.4.a refinement §6. Each prints PASS/FAIL with a
 * detail line so the operator can paste the whole block back on failure.
 *
 * Exit codes:
 *   0 — all assertions PASS
 *   2 — any assertion FAIL OR hostname guard refused
 */

import { Client } from "pg"

const SMOKE_VERSION = "smoke-guest-identity-schema-v1.0"

// ─── Hostname guard (mirrors prior P1+ smokes) ────────────────────────

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

// ─── Expected column shape per table ──────────────────────────────────

interface ExpectedColumn {
  name: string
  data_type: string
  is_nullable: "YES" | "NO"
}

const GCL_EXPECTED: ExpectedColumn[] = [
  { name: "id", data_type: "text", is_nullable: "NO" },
  { name: "guest_id", data_type: "text", is_nullable: "NO" },
  { name: "candidate_id", data_type: "text", is_nullable: "NO" },
  { name: "link_type", data_type: "text", is_nullable: "NO" },
  { name: "confidence", data_type: "text", is_nullable: "NO" },
  { name: "linked_at", data_type: "timestamp with time zone", is_nullable: "NO" },
  { name: "linked_by", data_type: "text", is_nullable: "YES" },
]

const GAL_EXPECTED: ExpectedColumn[] = [
  { name: "id", data_type: "text", is_nullable: "NO" },
  { name: "guest_id", data_type: "text", is_nullable: "NO" },
  { name: "application_id", data_type: "text", is_nullable: "NO" },
  { name: "link_type", data_type: "text", is_nullable: "NO" },
  { name: "linked_at", data_type: "timestamp with time zone", is_nullable: "NO" },
  { name: "linked_by", data_type: "text", is_nullable: "YES" },
]

// ─── Result reporting ────────────────────────────────────────────────

interface AssertionResult {
  name: string
  ok: boolean
  detail: string
}

const results: AssertionResult[] = []

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail })
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${SMOKE_VERSION}]`)

  // Assertion 1 — hostname guard.
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
    record(
      "1. hostname guard refuses non-local DB",
      true,
      "DATABASE_URL is local",
    )
  } else {
    record(
      "1. hostname guard refuses non-local DB",
      true,
      "bypassed via SMOKE_ALLOW_REMOTE=1",
    )
  }

  const c = new Client({ connectionString: databaseUrl })
  await c.connect()

  try {
    // Assertion 2 — guest_candidate_links table exists.
    const t1 = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_name = $1`,
      ["guest_candidate_links"],
    )
    if (Number(t1.rows[0]?.n ?? 0) === 1) {
      record("2. guest_candidate_links table exists", true, "table present")
    } else {
      record(
        "2. guest_candidate_links table exists",
        false,
        `expected 1 table, got ${t1.rows[0]?.n ?? 0}`,
      )
    }

    // Assertion 3 — guest_candidate_links columns + types.
    const c1 = await c.query<{
      column_name: string
      data_type: string
      is_nullable: string
    }>(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position`,
      ["guest_candidate_links"],
    )
    const missing1 = GCL_EXPECTED.filter((exp) => {
      const got = c1.rows.find((r) => r.column_name === exp.name)
      if (!got) return true
      if (got.data_type !== exp.data_type) return true
      if (got.is_nullable !== exp.is_nullable) return true
      return false
    })
    if (missing1.length === 0) {
      record(
        "3. guest_candidate_links columns + types match expected",
        true,
        `${GCL_EXPECTED.length} columns OK`,
      )
    } else {
      record(
        "3. guest_candidate_links columns + types match expected",
        false,
        `mismatch: ${missing1.map((m) => m.name).join(", ")}`,
      )
    }

    // Assertion 4 — guest_candidate_links indexes + FK constraints.
    const i1 = await c.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = $1`,
      ["guest_candidate_links"],
    )
    const k1 = await c.query<{ constraint_name: string }>(
      `SELECT constraint_name
         FROM information_schema.table_constraints
        WHERE table_name = $1
          AND constraint_type = 'FOREIGN KEY'`,
      ["guest_candidate_links"],
    )
    const indexNames1 = new Set(i1.rows.map((r) => r.indexname))
    const fkNames1 = new Set(k1.rows.map((r) => r.constraint_name))
    const hasUq1 = indexNames1.has("uq_gcl_candidate")
    const hasIdx1 = indexNames1.has("idx_gcl_guest")
    const hasFkGuest1 = fkNames1.has("fk_gcl_guest")
    const hasFkCand1 = fkNames1.has("fk_gcl_candidate")
    if (hasUq1 && hasIdx1 && hasFkGuest1 && hasFkCand1) {
      record(
        "4. guest_candidate_links has uq_gcl_candidate + idx_gcl_guest + 2 FKs",
        true,
        "2 indexes + 2 FKs OK",
      )
    } else {
      record(
        "4. guest_candidate_links has uq_gcl_candidate + idx_gcl_guest + 2 FKs",
        false,
        `uq_gcl_candidate=${hasUq1} idx_gcl_guest=${hasIdx1} fk_gcl_guest=${hasFkGuest1} fk_gcl_candidate=${hasFkCand1}`,
      )
    }

    // Assertion 5 — guest_application_links table + columns.
    const t2 = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_name = $1`,
      ["guest_application_links"],
    )
    const c2 = await c.query<{
      column_name: string
      data_type: string
      is_nullable: string
    }>(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position`,
      ["guest_application_links"],
    )
    const missing2 = GAL_EXPECTED.filter((exp) => {
      const got = c2.rows.find((r) => r.column_name === exp.name)
      if (!got) return true
      if (got.data_type !== exp.data_type) return true
      if (got.is_nullable !== exp.is_nullable) return true
      return false
    })
    if (Number(t2.rows[0]?.n ?? 0) === 1 && missing2.length === 0) {
      record(
        "5. guest_application_links exists + columns match",
        true,
        `table present, ${GAL_EXPECTED.length} columns OK`,
      )
    } else {
      record(
        "5. guest_application_links exists + columns match",
        false,
        `table=${t2.rows[0]?.n ?? 0} mismatched=${missing2.map((m) => m.name).join(",") || "none"}`,
      )
    }

    // Assertion 6 — guest_application_links indexes + FKs.
    const i2 = await c.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = $1`,
      ["guest_application_links"],
    )
    const k2 = await c.query<{ constraint_name: string }>(
      `SELECT constraint_name
         FROM information_schema.table_constraints
        WHERE table_name = $1
          AND constraint_type = 'FOREIGN KEY'`,
      ["guest_application_links"],
    )
    const indexNames2 = new Set(i2.rows.map((r) => r.indexname))
    const fkNames2 = new Set(k2.rows.map((r) => r.constraint_name))
    const hasUq2 = indexNames2.has("uq_gal_application")
    const hasIdx2 = indexNames2.has("idx_gal_guest")
    const hasFkGuest2 = fkNames2.has("fk_gal_guest")
    const hasFkApp2 = fkNames2.has("fk_gal_application")
    if (hasUq2 && hasIdx2 && hasFkGuest2 && hasFkApp2) {
      record(
        "6. guest_application_links has uq_gal_application + idx_gal_guest + 2 FKs",
        true,
        "2 indexes + 2 FKs OK",
      )
    } else {
      record(
        "6. guest_application_links has uq_gal_application + idx_gal_guest + 2 FKs",
        false,
        `uq_gal_application=${hasUq2} idx_gal_guest=${hasIdx2} fk_gal_guest=${hasFkGuest2} fk_gal_application=${hasFkApp2}`,
      )
    }

    // Assertion 7 — fk_gdc_promoted_guest constraint exists with
    // ON DELETE SET NULL semantics.
    const fkInfo = await c.query<{
      constraint_name: string
      delete_rule: string
    }>(
      `SELECT rc.constraint_name, rc.delete_rule
         FROM information_schema.referential_constraints rc
        WHERE rc.constraint_name = 'fk_gdc_promoted_guest'`,
    )
    if (fkInfo.rows.length === 1 && fkInfo.rows[0].delete_rule === "SET NULL") {
      record(
        "7. fk_gdc_promoted_guest exists with ON DELETE SET NULL",
        true,
        "FK present, action=SET NULL",
      )
    } else {
      record(
        "7. fk_gdc_promoted_guest exists with ON DELETE SET NULL",
        false,
        fkInfo.rows.length === 0
          ? "constraint not found"
          : `delete_rule=${fkInfo.rows[0].delete_rule}`,
      )
    }

    // Assertion 8 — zero orphan promoted_guest_id remains.
    const orphans = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM guest_discovery_candidates
        WHERE promoted_guest_id IS NOT NULL
          AND promoted_guest_id NOT IN (SELECT id FROM guests)`,
    )
    const orphanCount = Number(orphans.rows[0]?.n ?? 0)
    if (orphanCount === 0) {
      record(
        "8. zero orphan promoted_guest_id values remain",
        true,
        "0 orphan promoted_guest_id",
      )
    } else {
      record(
        "8. zero orphan promoted_guest_id values remain",
        false,
        `${orphanCount} orphan(s) — should be 0 after migration`,
      )
    }
  } finally {
    await c.end().catch(() => {})
  }

  // ─── Summary ─────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log("")
  console.log("══════════════════════════════════════════════════════════════")
  console.log("guest-identity schema smoke summary")
  console.log("══════════════════════════════════════════════════════════════")
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"}  ${r.name}`)
    console.log(`     ${r.detail}`)
  }
  console.log("")
  console.log(`  Assertions: ${results.length}`)
  console.log(`  Passed:     ${passed}`)
  console.log(`  Failed:     ${failed}`)
  console.log("")
  if (failed > 0) {
    console.log("  GUEST-IDENTITY SCHEMA SMOKE: FAIL")
    process.exit(2)
  }
  console.log("  GUEST-IDENTITY SCHEMA SMOKE: PASS")
  process.exit(0)
}

main().catch((err) => {
  console.error(`[${SMOKE_VERSION}] fatal:`, err)
  process.exit(2)
})
