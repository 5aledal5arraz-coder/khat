/**
 * Phase 1.3 — JSONB drift scanner.
 *
 *   npm run scan:jsonb-drift
 *
 * Reads each of the five validated JSONB columns from the local DB in
 * pages of 500 rows, runs the Zod schema, and reports drift. Inserts
 * one `jsonb_validation_events` row per offending row with
 * source='scanner', mode='scanner'.
 *
 * Pure read on the validated columns. Writes only to the audit table.
 * Refuses to run against managed-DB hostnames unless SMOKE_ALLOW_REMOTE=1.
 *
 * Exit codes:
 *   0  every column clean
 *   1  drift detected (count > 0 in any column)
 *   2  DB error, connection refused, or hostname guard refused
 *
 * P1.3 does NOT fix anything. The scanner is the discovery tool. The
 * operator decides per the roadmap whether to fix data, loosen the
 * schema, or accept drift.
 */

import { Client } from "pg"
import {
  editorialIntentSchema,
  EDITORIAL_INTENT_COLUMN,
  EDITORIAL_INTENT_TABLE,
  prepV2Schema,
  PREP_V2_COLUMN,
  PREP_V2_TABLE,
  aiRunsInputSnapshotSchema,
  aiRunsOutputSnapshotSchema,
  AI_RUNS_INPUT_SNAPSHOT_COLUMN,
  AI_RUNS_OUTPUT_SNAPSHOT_COLUMN,
  AI_RUNS_TABLE,
  hybridOutputTopicsSchema,
  HYBRID_OUTPUT_TOPICS_COLUMN,
  HYBRID_OUTPUT_TOPICS_TABLE,
  summarizeIssues,
  hashValue,
  recordDriftFireAndForget,
} from "@/lib/db/validators"
import type { z } from "zod"

const SCANNER_VERSION = "scan-jsonb-drift-v1.0"
const PAGE_SIZE = 500

interface Target {
  id: string
  table: string
  column: string
  idColumn: string
  schema: z.ZodType
  /** Some columns are nullable; we should skip null values entirely. */
  null_ok: boolean
}

const TARGETS: Target[] = [
  {
    id: "T1",
    table: EDITORIAL_INTENT_TABLE,
    column: EDITORIAL_INTENT_COLUMN,
    idColumn: "id",
    schema: editorialIntentSchema,
    null_ok: false, // column NOT NULL with default {}
  },
  {
    id: "T2",
    table: PREP_V2_TABLE,
    column: PREP_V2_COLUMN,
    idColumn: "id",
    schema: prepV2Schema,
    null_ok: true, // prep_v2 may be null until pipeline runs
  },
  {
    id: "T3",
    table: AI_RUNS_TABLE,
    column: AI_RUNS_INPUT_SNAPSHOT_COLUMN,
    idColumn: "id",
    schema: aiRunsInputSnapshotSchema,
    null_ok: true,
  },
  {
    id: "T4",
    table: AI_RUNS_TABLE,
    column: AI_RUNS_OUTPUT_SNAPSHOT_COLUMN,
    idColumn: "id",
    schema: aiRunsOutputSnapshotSchema,
    null_ok: true,
  },
  {
    id: "T5",
    table: HYBRID_OUTPUT_TOPICS_TABLE,
    column: HYBRID_OUTPUT_TOPICS_COLUMN,
    idColumn: "id",
    schema: hybridOutputTopicsSchema,
    null_ok: true,
  },
]

// ─── Hostname guard (same patterns as smoke-spine-joins) ─────────────

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

// ─── Scanner ─────────────────────────────────────────────────────────

interface ScanResult {
  target_id: string
  table: string
  column: string
  total_rows: number
  null_rows: number
  validated_rows: number
  drift_rows: number
  drift_samples: Array<{ row_id: string; issue_summary: string }>
  query_ms: number
}

async function scanTarget(client: Client, target: Target): Promise<ScanResult> {
  const t0 = Date.now()
  const result: ScanResult = {
    target_id: target.id,
    table: target.table,
    column: target.column,
    total_rows: 0,
    null_rows: 0,
    validated_rows: 0,
    drift_rows: 0,
    drift_samples: [],
    query_ms: 0,
  }

  let offset = 0
  for (;;) {
    // Hand-built SELECT — table/column come from a fixed in-code list.
    const query = `
      SELECT "${target.idColumn}" AS row_id, "${target.column}" AS value
      FROM "${target.table}"
      ORDER BY "${target.idColumn}"
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `
    const res = await client.query<{ row_id: string; value: unknown }>(query)
    if (res.rows.length === 0) break

    for (const row of res.rows) {
      result.total_rows++
      if (row.value === null || row.value === undefined) {
        result.null_rows++
        if (!target.null_ok) {
          // NULL where we don't allow it counts as drift.
          result.drift_rows++
          if (result.drift_samples.length < 5) {
            result.drift_samples.push({
              row_id: row.row_id,
              issue_summary: "(root): null_unexpected",
            })
          }
          recordDriftFireAndForget({
            table: target.table,
            column: target.column,
            rowId: row.row_id,
            mode: "scanner",
            source: "scanner",
            issueCount: 1,
            issueSummary: "(root): null_unexpected",
            rawValueHash: hashValue(null),
          })
        }
        continue
      }
      result.validated_rows++
      const parsed = target.schema.safeParse(row.value)
      if (!parsed.success) {
        const issues = parsed.error.issues
        const summary = summarizeIssues(issues)
        result.drift_rows++
        if (result.drift_samples.length < 5) {
          result.drift_samples.push({ row_id: row.row_id, issue_summary: summary })
        }
        recordDriftFireAndForget({
          table: target.table,
          column: target.column,
          rowId: row.row_id,
          mode: "scanner",
          source: "scanner",
          issueCount: issues.length,
          issueSummary: summary,
          rawValueHash: hashValue(row.value),
        })
      }
    }

    if (res.rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  result.query_ms = Date.now() - t0
  return result
}

function formatLine(r: ScanResult): string {
  const mark = r.drift_rows === 0 ? "✓" : "✗"
  const idCol = r.target_id.padEnd(4)
  const labelCol = `${r.table}.${r.column}`.padEnd(58)
  const counts =
    `total=${String(r.total_rows).padStart(5)}` +
    `  null=${String(r.null_rows).padStart(4)}` +
    `  drift=${String(r.drift_rows).padStart(4)}` +
    `  ${String(r.query_ms).padStart(5)}ms`
  return `${mark} ${idCol}  ${labelCol}  ${counts}`
}

async function main() {
  console.log(`[scan-jsonb-drift] ${SCANNER_VERSION}`)

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[scan-jsonb-drift] DATABASE_URL is not set — refusing to run")
    process.exit(2)
  }
  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(
        `[scan-jsonb-drift] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`,
      )
      process.exit(2)
    }
  } else {
    console.log("[scan-jsonb-drift] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed")
  }

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
    console.error("[scan-jsonb-drift] could not connect:", (err as Error).message)
    process.exit(2)
  }

  const results: ScanResult[] = []
  let queryError: { target_id: string; message: string } | null = null

  for (const target of TARGETS) {
    try {
      const out = await scanTarget(client, target)
      results.push(out)
    } catch (err) {
      queryError = { target_id: target.id, message: (err as Error).message }
      break
    }
  }

  try {
    await client.end()
  } catch {
    // ignore
  }

  console.log("")
  for (const r of results) console.log(formatLine(r))

  const driftReports = results.filter((r) => r.drift_rows > 0)
  if (driftReports.length > 0) {
    console.log("")
    console.log("DRIFT DETAILS (first 5 sample row_ids per failing target):")
    for (const r of driftReports) {
      console.log(
        `  • ${r.target_id} (${r.table}.${r.column}) — ${r.drift_rows} drift row(s)`,
      )
      for (const sample of r.drift_samples) {
        console.log(`      ${sample.row_id}  ${sample.issue_summary}`)
      }
    }
    console.log("")
    console.log(
      "Audit rows have been inserted into jsonb_validation_events with source='scanner'.",
    )
    console.log("Phase 1.3 does NOT fix this drift — that is an operator decision.")
  }

  const wallMs = Date.now() - wallStart
  console.log("")
  console.log(`[scan-jsonb-drift] total wall: ${wallMs}ms`)

  if (queryError) {
    console.error(
      `[scan-jsonb-drift] FAILED: target ${queryError.target_id} errored — ${queryError.message}`,
    )
    process.exit(2)
  }

  if (driftReports.length > 0) {
    console.error("[scan-jsonb-drift] FAILED: drift detected (exit 1)")
    process.exit(1)
  }

  console.log("[scan-jsonb-drift] PASSED: every JSONB column is clean")
  process.exit(0)
}

main().catch((err) => {
  console.error("[scan-jsonb-drift] fatal:", err)
  process.exit(2)
})
