/**
 * Phase 2.3 (P2.3.a) — emit helper for the `system_events` log.
 *
 * Single export: `emitSystemEvent(input)`. Hard contract:
 *
 *   1. Never throws. A failure to log NEVER bubbles up to the caller.
 *   2. Never blocks business logic semantically — callers should `void`
 *      the returned promise on hot paths if they don't need the write
 *      to complete before continuing. (The function itself still
 *      awaits the INSERT so test code can sequence assertions.)
 *   3. Pinned severity per (source, event_type) — the writer reads it
 *      off the typed input variant; callers cannot override.
 *
 * P2.3.a is the helper + types only. No subsystem calls this yet;
 * wiring lands in P2.3.b–P2.3.d.
 *
 * Test seam: `emitSystemEventWith(client, input)` accepts any object
 * with the shape `{ insert(table).values(row).execute(): Promise }`,
 * which is what tests inject. The default export reaches for `lib/db`.
 *
 * Pattern parallel: identical fire-and-forget contract to the JSONB
 * validator wrapper (P1.3) and the rate-limit logger (P1.6). Logging
 * failures should never break the call site.
 */

import { db as defaultDb } from "@/lib/db"
import { systemEvents } from "@/lib/db/schema/system-events"
import type { SystemEventInput } from "./types"

/**
 * Minimal duck-type subset of the drizzle client used by `emitSystemEvent`.
 * Defined here so tests can hand-roll a stub without pulling drizzle's
 * full type surface, and so a future swap to a thin wrapper (batching,
 * async queue) doesn't require touching every caller.
 */
export interface SystemEventsWriter {
  insert: (table: typeof systemEvents) => {
    values: (row: typeof systemEvents.$inferInsert) => {
      execute: () => Promise<unknown>
    }
  }
}

/**
 * Build the row that lands in `system_events`. Pure — exposed for tests.
 *
 * subject_kind / subject_id are coerced to `null` (DB) from `undefined`
 * (TS optional). The discriminated union guarantees that when source is
 * one of the subjectless variants, both are absent on the input.
 */
export function buildSystemEventRow(
  input: SystemEventInput,
): typeof systemEvents.$inferInsert {
  const row: typeof systemEvents.$inferInsert = {
    source: input.source,
    event_type: input.event_type,
    severity: input.severity,
    actor: input.actor ?? null,
    subject_kind: "subject_kind" in input ? (input.subject_kind ?? null) : null,
    subject_id: "subject_id" in input ? (input.subject_id ?? null) : null,
    payload: input.payload as Record<string, unknown>,
    request_id: input.request_id ?? null,
  }
  if (input.event_at) {
    row.event_at = input.event_at
  }
  return row
}

/**
 * Internal — emit using a specific writer. Tests inject a stub; the
 * default emit reaches for `lib/db`.
 *
 * Contract:
 *   • Never throws.
 *   • Returns void on success or on caught failure.
 *   • Logs to console.error on failure (no other side effects).
 */
export async function emitSystemEventWith(
  writer: SystemEventsWriter | null,
  input: SystemEventInput,
): Promise<void> {
  if (!writer) {
    // db is null when DATABASE_URL is missing. Stay silent — the caller
    // is in a degraded environment and the audit table cannot help.
    return
  }
  try {
    const row = buildSystemEventRow(input)
    await writer.insert(systemEvents).values(row).execute()
  } catch (err) {
    // Hard contract: never propagate. Log so an operator running with
    // verbose stderr can correlate, then return.
    console.error(
      `[system-events] emit failed (source=${input.source} event_type=${input.event_type}):`,
      err,
    )
  }
}

/**
 * Public emit entrypoint. Uses the default `lib/db` drizzle client.
 *
 * Callers on hot paths should `void`-discard the promise; callers in
 * test/sequence contexts can await it to ensure the row has landed
 * before the next assertion.
 */
export async function emitSystemEvent(input: SystemEventInput): Promise<void> {
  await emitSystemEventWith(defaultDb as SystemEventsWriter | null, input)
}
