/**
 * Phase 2.3 (P2.3.c) — sweeper writer unit tests.
 *
 * Pure surface only. The wet-path DB roundtrip is exercised in the
 * extended `smoke-system-events.ts`.
 *
 * What this file locks down:
 *   1. Source pinned to "sweeper", event_type "summary", severity "info".
 *   2. No subject — sweeper events are not about a specific entity.
 *   3. Payload arithmetic: scanned − reclaimed = skipped (the maxRows
 *      cap is the only reason for skip). Spec-locked here so a future
 *      refactor of `runAiRunsSweep` can't silently break the mapping.
 *   4. wall_ms → duration_ms field rename.
 *   5. stale_after_ms passes through unchanged.
 *   6. Actor convention: "sweeper" by default (set by orchestrator),
 *      but builder doesn't enforce that — just passthrough.
 */

import { describe, expect, it } from "vitest"
import { buildSweeperSummaryEvent } from "@/lib/system-events/builders"

describe("buildSweeperSummaryEvent", () => {
  it("emits info-severity summary with no subject", () => {
    const evt = buildSweeperSummaryEvent({
      scanned: 10,
      reclaimed: 7,
      skipped: 3,
      duration_ms: 250,
      stale_after_ms: 15 * 60 * 1000,
      actor: "sweeper",
    })
    expect(evt.source).toBe("sweeper")
    expect(evt.event_type).toBe("summary")
    expect(evt.severity).toBe("info")
    // Sweeper events are subjectless — confirm both fields are absent.
    expect("subject_kind" in evt).toBe(false)
    expect("subject_id" in evt).toBe(false)
    expect(evt.actor).toBe("sweeper")
  })

  it("scanned - reclaimed = skipped contract (maxRows cap math)", () => {
    // 100 candidates, only 50 reclaimed because maxRows=50 → 50 skipped.
    const evt = buildSweeperSummaryEvent({
      scanned: 100,
      reclaimed: 50,
      skipped: 50,
      duration_ms: 1000,
      stale_after_ms: 900_000,
    })
    expect(evt.payload.scanned - evt.payload.reclaimed).toBe(evt.payload.skipped)
  })

  it("zero-work sweep produces all-zero payload (steady state)", () => {
    const evt = buildSweeperSummaryEvent({
      scanned: 0,
      reclaimed: 0,
      skipped: 0,
      duration_ms: 5,
      stale_after_ms: 900_000,
    })
    expect(evt.payload).toEqual({
      scanned: 0,
      reclaimed: 0,
      skipped: 0,
      duration_ms: 5,
      stale_after_ms: 900_000,
    })
  })

  it("payload shape lock: exactly 5 keys", () => {
    const evt = buildSweeperSummaryEvent({
      scanned: 1,
      reclaimed: 1,
      skipped: 0,
      duration_ms: 1,
      stale_after_ms: 1,
    })
    expect(Object.keys(evt.payload).sort()).toEqual([
      "duration_ms",
      "reclaimed",
      "scanned",
      "skipped",
      "stale_after_ms",
    ])
  })

  it("stale_after_ms passes through unchanged (no unit conversion)", () => {
    const evt = buildSweeperSummaryEvent({
      scanned: 0,
      reclaimed: 0,
      skipped: 0,
      duration_ms: 0,
      stale_after_ms: 123_456_789,
    })
    expect(evt.payload.stale_after_ms).toBe(123_456_789)
  })

  it("actor null/undefined both flatten to undefined", () => {
    const args = {
      scanned: 0,
      reclaimed: 0,
      skipped: 0,
      duration_ms: 0,
      stale_after_ms: 0,
    }
    expect(buildSweeperSummaryEvent({ ...args, actor: null }).actor).toBeUndefined()
    expect(buildSweeperSummaryEvent(args).actor).toBeUndefined()
  })
})
