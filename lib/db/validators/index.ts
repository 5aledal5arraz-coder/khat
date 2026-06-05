/**
 * Phase 1.3 — JSONB validation wrapper.
 *
 * Every JSONB write at the four wired sites passes through
 * `validateJsonbWrite()`. Behavior depends on KHAT_JSONB_VALIDATORS_MODE:
 *
 *   off      — bypass entirely; returns input unchanged.
 *   report   — validate; on miss log + audit-insert; return input unchanged.
 *              (default at P1.3 ship)
 *   enforce  — validate; on miss throw JsonbValidationError.
 *
 * The wrapper is intentionally synchronous so call sites don't need to
 * `await` it. The audit-insert is fire-and-forget — logging failures
 * never break the real write path.
 *
 * Read-only contract: this module NEVER modifies the input value. It
 * may log it, hash it, insert a row about it — but the value reaching
 * the database is byte-equivalent to the value the caller passed in.
 */

import { createHash } from "node:crypto"
import type { z } from "zod"
import { db } from "@/lib/db"
import { jsonbValidationEvents } from "@/lib/db/schema/jsonb-validation-events"

// ─── Mode resolution ──────────────────────────────────────────────────

export type ValidatorMode = "off" | "report" | "enforce"

/**
 * Read the runtime mode. Re-reads env on every call so the operator
 * can flip with `pm2 restart`. Default at ship time: `report`.
 */
export function getValidatorMode(): ValidatorMode {
  const raw = (process.env.KHAT_JSONB_VALIDATORS_MODE ?? "report").toLowerCase()
  if (raw === "off" || raw === "enforce" || raw === "report") return raw
  // Unknown value — be conservative and default to report (visible
  // signal, no production-breaking throws).
  return "report"
}

// ─── Error type ───────────────────────────────────────────────────────

export class JsonbValidationError extends Error {
  readonly table: string
  readonly column: string
  readonly issues: z.core.$ZodIssue[]
  constructor(args: { table: string; column: string; issues: z.core.$ZodIssue[]; summary: string }) {
    super(`JSONB validation failed for ${args.table}.${args.column}: ${args.summary}`)
    this.name = "JsonbValidationError"
    this.table = args.table
    this.column = args.column
    this.issues = args.issues
  }
}

// ─── Wrapper API ──────────────────────────────────────────────────────

export interface ValidateJsonbSpec {
  table: string
  column: string
  /** Row id when known. Null is fine — the scanner always knows it,
   *  pre-insert writes may not. */
  rowId?: string | null
}

/**
 * The single entry point. Pass-through in `off`; observe-and-log in
 * `report`; throw in `enforce`. Returns the value unchanged on the
 * success path of every mode.
 */
export function validateJsonbWrite<T>(
  spec: ValidateJsonbSpec,
  value: unknown,
  schema: z.ZodType<T>,
): unknown {
  const mode = getValidatorMode()
  if (mode === "off") return value

  const result = schema.safeParse(value)
  if (result.success) return value

  // Miss. Build a summary; log; fire-and-forget the audit row.
  const issues = result.error.issues
  const summary = summarizeIssues(issues)
  const valueHash = hashValue(value)

  // Best-effort console signal (never throws).
  try {
    // eslint-disable-next-line no-console
    console.warn("[jsonb-validator] DRIFT", {
      table: spec.table,
      column: spec.column,
      row_id: spec.rowId ?? null,
      mode,
      issues_count: issues.length,
    })
  } catch {
    // ignore
  }

  // Best-effort audit row. Wrapped so a DB error here can never
  // break the surrounding business write.
  recordDriftFireAndForget({
    table: spec.table,
    column: spec.column,
    rowId: spec.rowId ?? null,
    mode,
    source: "write-wrapper",
    issueCount: issues.length,
    issueSummary: summary,
    rawValueHash: valueHash,
  })

  if (mode === "enforce") {
    throw new JsonbValidationError({
      table: spec.table,
      column: spec.column,
      issues,
      summary,
    })
  }

  // REPORT mode — let the original value through unchanged.
  return value
}

// ─── Drift audit recording ────────────────────────────────────────────

/**
 * Fire-and-forget audit insert. Public so the scanner can reuse it.
 * Errors are swallowed — observability must never break business flow.
 */
export function recordDriftFireAndForget(args: {
  table: string
  column: string
  rowId: string | null
  mode: ValidatorMode | "scanner"
  source: "write-wrapper" | "scanner"
  issueCount: number
  issueSummary: string
  rawValueHash: string
}): void {
  if (!db) return
  void db
    .insert(jsonbValidationEvents)
    .values({
      table_name: args.table,
      column_name: args.column,
      row_id: args.rowId,
      // map scanner / off internal label to the table enum
      mode: args.mode === "off" ? "report" : args.mode,
      source: args.source,
      issue_count: args.issueCount,
      issue_summary: args.issueSummary,
      raw_value_hash: args.rawValueHash,
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn(
        "[jsonb-validator] audit insert failed (non-fatal):",
        err instanceof Error ? err.message : err,
      )
    })
}

// ─── Helpers ──────────────────────────────────────────────────────────

const ISSUE_SUMMARY_CAP = 480

/**
 * Compress Zod issues into a single line capped at ~480 chars. Sample:
 *   "axes_of_tension: too_small; thesis: invalid_type (expected string)"
 */
export function summarizeIssues(issues: z.core.$ZodIssue[]): string {
  const parts = issues.slice(0, 12).map((iss) => {
    const path = iss.path.length > 0 ? iss.path.map(String).join(".") : "(root)"
    const detail = (iss as { expected?: string }).expected
      ? ` (expected ${(iss as { expected?: string }).expected})`
      : ""
    return `${path}: ${iss.code}${detail}`
  })
  const joined = parts.join("; ")
  if (joined.length <= ISSUE_SUMMARY_CAP) return joined
  return joined.slice(0, ISSUE_SUMMARY_CAP - 3) + "..."
}

/**
 * Stable 16-hex-char hash of the offending value. Used by the audit
 * table to detect "same broken value repeating" without storing the
 * value itself (avoids storage bloat + accidental data leakage).
 */
export function hashValue(value: unknown): string {
  let json: string
  try {
    json = JSON.stringify(value) ?? ""
  } catch {
    // Circular structures, BigInt, etc. Use a deterministic-ish fallback.
    json = String(value)
  }
  return createHash("sha256").update(json).digest("hex").slice(0, 16)
}

// Re-export schemas for ergonomic imports at call sites.
export { editorialIntentSchema, EDITORIAL_INTENT_COLUMN, EDITORIAL_INTENT_TABLE } from "./schemas/editorial-intent"
export { prepV2Schema, PREP_V2_COLUMN, PREP_V2_TABLE } from "./schemas/prep-v2"
export {
  aiRunsInputSnapshotSchema,
  aiRunsOutputSnapshotSchema,
  AI_RUNS_INPUT_SNAPSHOT_COLUMN,
  AI_RUNS_OUTPUT_SNAPSHOT_COLUMN,
  AI_RUNS_TABLE,
} from "./schemas/ai-runs"
export {
  hybridOutputTopicsSchema,
  HYBRID_OUTPUT_TOPICS_COLUMN,
  HYBRID_OUTPUT_TOPICS_TABLE,
} from "./schemas/hybrid-topic-generations"
