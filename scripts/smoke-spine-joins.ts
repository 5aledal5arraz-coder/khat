/**
 * Phase 1.2 — Spine join smoke.
 *
 *   npm run smoke:spine-joins
 *
 * Read-only health check for the editorial spine. Runs ten SELECTs
 * against the local DB:
 *   • Six soft-FK orphan checks (failures here exit non-zero — drift).
 *   • Four hard-FK joinable-count checks (informational; cannot orphan).
 *
 * The script is intentionally local-DB-only. It refuses to run against
 * hostnames that look like managed-DB endpoints unless the operator
 * explicitly opts in with SMOKE_ALLOW_REMOTE=1.
 *
 * No writes. No schema changes. No data fixes. The orphan output is
 * the input to Phase 4 / Phase 5 — not a cleanup tool.
 *
 * Documented in docs/schema.md.
 */

import { Client } from "pg"

const SMOKE_VERSION = "spine-joins-v1.0"

interface JoinResult {
  id: string
  label: string
  kind: "soft-fk" | "hard-fk"
  joinable: number
  orphans: number
  query_ms: number
}

interface OrphanSample {
  join_id: string
  table: string
  fk_column: string
  sample_ids: string[]
  total: number
}

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

function isLocalConnection(connectionString: string): { ok: boolean; reason?: string } {
  try {
    // Postgres URLs can omit a password etc. The URL parser handles it.
    const url = new URL(connectionString.replace(/^postgres(ql)?:\/\//, "http://"))
    const host = url.hostname.toLowerCase()
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return { ok: true }
    }
    for (const pat of PRODUCTION_HOSTNAME_PATTERNS) {
      if (pat.test(host)) {
        return {
          ok: false,
          reason: `hostname ${host} matches production pattern ${pat}. Refusing. Set SMOKE_ALLOW_REMOTE=1 to override.`,
        }
      }
    }
    // Unknown but non-local — be conservative.
    return {
      ok: false,
      reason: `hostname ${host} is not localhost. Set SMOKE_ALLOW_REMOTE=1 to override.`,
    }
  } catch (err) {
    return {
      ok: false,
      reason: `could not parse DATABASE_URL: ${(err as Error).message}`,
    }
  }
}

// ─── Smoke queries ───────────────────────────────────────────────────

interface SoftFkSpec {
  id: string
  label: string
  table: string
  fk_column: string
  parent_table: string
  parent_column: string
  /** If true, NULL values in fk_column are EXPECTED and excluded from
   *  the "joinable" count (e.g. episodes.eir_id is null for the 77
   *  YouTube imports). */
  null_ok: boolean
}

const SOFT_FK_JOINS: SoftFkSpec[] = [
  {
    id: "soft-1",
    label: "khat_map_episode_candidates.eir_id → eir.id",
    table: "khat_map_episode_candidates",
    fk_column: "eir_id",
    parent_table: "episode_intelligence_records",
    parent_column: "id",
    null_ok: true,
  },
  {
    id: "soft-2",
    label: "episode_preparations.eir_id → eir.id",
    table: "episode_preparations",
    fk_column: "eir_id",
    parent_table: "episode_intelligence_records",
    parent_column: "id",
    null_ok: true,
  },
  {
    id: "soft-3",
    label: "collaboration_rooms.eir_id → eir.id",
    table: "collaboration_rooms",
    fk_column: "eir_id",
    parent_table: "episode_intelligence_records",
    parent_column: "id",
    null_ok: true,
  },
  {
    id: "soft-4",
    label: "studio_sessions.eir_id → eir.id",
    table: "studio_sessions",
    fk_column: "eir_id",
    parent_table: "episode_intelligence_records",
    parent_column: "id",
    null_ok: true,
  },
  {
    id: "soft-5",
    label: "episodes.eir_id → eir.id  (null OK: pre-EIR imports)",
    table: "episodes",
    fk_column: "eir_id",
    parent_table: "episode_intelligence_records",
    parent_column: "id",
    null_ok: true,
  },
  {
    id: "soft-6",
    label: "guest_discovery_candidates.promoted_guest_id → guests.id",
    table: "guest_discovery_candidates",
    fk_column: "promoted_guest_id",
    parent_table: "guests",
    parent_column: "id",
    null_ok: true,
  },
]

interface HardFkSpec {
  id: string
  label: string
  /** SQL snippet that, when wrapped in SELECT COUNT(*) FROM ..., returns
   *  the joinable-rows count. */
  joinable_sql: string
  /** Optional "every parent has ≥ 1 child" assertion. When set, the
   *  smoke runs it; a non-zero gap is reported. */
  every_parent_has_child_sql?: string
}

const HARD_FK_JOINS: HardFkSpec[] = [
  {
    id: "hard-1",
    label: "eir.season_id → khat_map_seasons.id",
    joinable_sql: `
      FROM episode_intelligence_records eir
      JOIN khat_map_seasons s ON s.id = eir.season_id
    `,
  },
  {
    id: "hard-2",
    label: "eir.guest_id → guests.id",
    joinable_sql: `
      FROM episode_intelligence_records eir
      JOIN guests g ON g.id = eir.guest_id
    `,
  },
  {
    id: "hard-3",
    label: "ai_runs.eir_id → eir.id",
    joinable_sql: `
      FROM ai_runs ar
      JOIN episode_intelligence_records eir ON eir.id = ar.eir_id
    `,
  },
  {
    id: "hard-4",
    label: "eir_phase_transitions.eir_id → eir.id",
    joinable_sql: `
      FROM eir_phase_transitions t
      JOIN episode_intelligence_records eir ON eir.id = t.eir_id
    `,
    every_parent_has_child_sql: `
      SELECT eir.id
      FROM episode_intelligence_records eir
      LEFT JOIN eir_phase_transitions t ON t.eir_id = eir.id
      WHERE t.id IS NULL
      LIMIT 5
    `,
  },
]

const ORPHAN_SAMPLE_LIMIT = 5

// ─── Runner ──────────────────────────────────────────────────────────

async function runSoftCheck(
  client: Client,
  spec: SoftFkSpec,
): Promise<{ result: JoinResult; orphans: OrphanSample | null }> {
  // Quoted identifiers are safe — these are hand-written, not user input.
  const t0 = Date.now()
  const joinableQuery = `
    SELECT COUNT(*)::int AS n
    FROM "${spec.table}" c
    JOIN "${spec.parent_table}" p ON p.${spec.parent_column} = c.${spec.fk_column}
  `
  const orphanQuery = `
    SELECT COUNT(*)::int AS n
    FROM "${spec.table}" c
    LEFT JOIN "${spec.parent_table}" p ON p.${spec.parent_column} = c.${spec.fk_column}
    WHERE c.${spec.fk_column} IS NOT NULL
      AND p.${spec.parent_column} IS NULL
  `
  const orphanSampleQuery = `
    SELECT c.${spec.fk_column} AS orphan_value
    FROM "${spec.table}" c
    LEFT JOIN "${spec.parent_table}" p ON p.${spec.parent_column} = c.${spec.fk_column}
    WHERE c.${spec.fk_column} IS NOT NULL
      AND p.${spec.parent_column} IS NULL
    LIMIT ${ORPHAN_SAMPLE_LIMIT}
  `

  const [joinableRes, orphanRes] = await Promise.all([
    client.query<{ n: number }>(joinableQuery),
    client.query<{ n: number }>(orphanQuery),
  ])

  const orphans = orphanRes.rows[0]?.n ?? 0
  let orphanSample: OrphanSample | null = null
  if (orphans > 0) {
    const samples = await client.query<{ orphan_value: string }>(orphanSampleQuery)
    orphanSample = {
      join_id: spec.id,
      table: spec.table,
      fk_column: spec.fk_column,
      sample_ids: samples.rows.map((r) => r.orphan_value),
      total: orphans,
    }
  }

  return {
    result: {
      id: spec.id,
      label: spec.label,
      kind: "soft-fk",
      joinable: joinableRes.rows[0]?.n ?? 0,
      orphans,
      query_ms: Date.now() - t0,
    },
    orphans: orphanSample,
  }
}

async function runHardCheck(
  client: Client,
  spec: HardFkSpec,
): Promise<{ result: JoinResult; orphans: OrphanSample | null }> {
  const t0 = Date.now()
  const joinableRes = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n ${spec.joinable_sql}`,
  )
  let parentChildGap: OrphanSample | null = null
  if (spec.every_parent_has_child_sql) {
    const gapRows = await client.query<{ id: string }>(
      spec.every_parent_has_child_sql,
    )
    if (gapRows.rows.length > 0) {
      parentChildGap = {
        join_id: spec.id,
        table: "episode_intelligence_records",
        fk_column: "id (no inbound transition)",
        sample_ids: gapRows.rows.map((r) => r.id),
        total: gapRows.rows.length,
      }
    }
  }
  return {
    result: {
      id: spec.id,
      label: spec.label,
      kind: "hard-fk",
      joinable: joinableRes.rows[0]?.n ?? 0,
      orphans: parentChildGap ? parentChildGap.total : 0,
      query_ms: Date.now() - t0,
    },
    orphans: parentChildGap,
  }
}

function formatLine(r: JoinResult): string {
  const mark = r.orphans === 0 ? "✓" : "✗"
  const idCol = r.id.padEnd(7)
  const labelCol = r.label.padEnd(56)
  const counts =
    `joinable=${String(r.joinable).padStart(6)}` +
    `  orphans=${String(r.orphans).padStart(4)}` +
    `  ${String(r.query_ms).padStart(4)}ms`
  return `${mark} ${idCol}  ${labelCol}  ${counts}`
}

async function main() {
  console.log(`[smoke-spine-joins] ${SMOKE_VERSION}`)

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[smoke-spine-joins] DATABASE_URL is not set — refusing to run")
    process.exit(2)
  }

  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(`[smoke-spine-joins] REFUSED: ${guard.reason}`)
      process.exit(2)
    }
  } else {
    console.log("[smoke-spine-joins] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed (operator override)")
  }

  // SSL settings mirror the project's pg setup — local Postgres is plain.
  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  })

  const wallStart = Date.now()
  try {
    await client.connect()
  } catch (err) {
    console.error(
      "[smoke-spine-joins] could not connect to DB:",
      (err as Error).message,
    )
    process.exit(2)
  }

  const results: JoinResult[] = []
  const orphanReports: OrphanSample[] = []
  let queryError: { id: string; message: string } | null = null

  // Soft-FK checks first (these are the ones that can really fail).
  for (const spec of SOFT_FK_JOINS) {
    try {
      const out = await runSoftCheck(client, spec)
      results.push(out.result)
      if (out.orphans) orphanReports.push(out.orphans)
    } catch (err) {
      queryError = { id: spec.id, message: (err as Error).message }
      break
    }
  }

  // Hard-FK checks (informational counts + orphan-by-construction never fires;
  // the "every EIR has ≥ 1 transition" assertion can however surface a real gap).
  if (!queryError) {
    for (const spec of HARD_FK_JOINS) {
      try {
        const out = await runHardCheck(client, spec)
        results.push(out.result)
        if (out.orphans) orphanReports.push(out.orphans)
      } catch (err) {
        queryError = { id: spec.id, message: (err as Error).message }
        break
      }
    }
  }

  try {
    await client.end()
  } catch {
    // Non-fatal — connection cleanup.
  }

  // ─── Report ─────────────────────────────────────────────────────
  console.log("")
  for (const r of results) console.log(formatLine(r))

  if (orphanReports.length > 0) {
    console.log("")
    console.log("ORPHAN DETAILS (first 5 per failing join):")
    for (const o of orphanReports) {
      console.log(
        `  • ${o.join_id} (${o.table}.${o.fk_column}) — ${o.total} orphan(s)`,
      )
      for (const id of o.sample_ids) console.log(`      ${id}`)
    }
  }

  const wallMs = Date.now() - wallStart
  console.log("")
  console.log(`[smoke-spine-joins] total wall: ${wallMs}ms`)

  if (queryError) {
    console.error(
      `[smoke-spine-joins] FAILED: query "${queryError.id}" errored — ${queryError.message}`,
    )
    process.exit(2)
  }

  const anyOrphans = orphanReports.length > 0
  if (anyOrphans) {
    console.error("[smoke-spine-joins] FAILED: orphan rows detected (exit 1)")
    process.exit(1)
  }

  console.log("[smoke-spine-joins] PASSED: every spine join is clean")
  process.exit(0)
}

main().catch((err) => {
  console.error("[smoke-spine-joins] fatal:", err)
  process.exit(2)
})
