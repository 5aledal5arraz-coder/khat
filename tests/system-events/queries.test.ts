/**
 * Phase 2.3 (P2.3.e) — read-API pure helper tests.
 *
 * No DB. The DB roundtrip (listEvents / countBySource / countBySourceSeverity
 * / recentBySubject / topErrors) is exercised in smoke scenario 14
 * against the corpus written by scenarios 1–13.
 *
 * What this file locks down:
 *   1. `clampLimit` boundary behavior across all 5 input categories.
 *   2. `truncatePayloadPreview` handling of null, empty, oversize, and
 *      unserializable payloads.
 *   3. `mapRow` coerces bigint id → string and never returns a null
 *      payload (column is NOT NULL with default '{}').
 */

import { describe, expect, it } from "vitest"
import {
  LIST_EVENTS_LIMIT_DEFAULT,
  LIST_EVENTS_LIMIT_MAX,
  RECENT_BY_SUBJECT_LIMIT_DEFAULT,
  RECENT_BY_SUBJECT_LIMIT_MAX,
  TOP_ERRORS_LIMIT_DEFAULT,
  TOP_ERRORS_LIMIT_MAX,
  clampLimit,
  mapRow,
  truncatePayloadPreview,
} from "@/lib/system-events/queries"

// ─── clampLimit ───────────────────────────────────────────────────────

describe("clampLimit", () => {
  it("undefined → fallback", () => {
    expect(clampLimit(undefined, 1, 500, 50)).toBe(50)
  })

  it("NaN → fallback", () => {
    expect(clampLimit(NaN, 1, 500, 50)).toBe(50)
  })

  it("Infinity → fallback", () => {
    expect(clampLimit(Infinity, 1, 500, 50)).toBe(50)
  })

  it("below min → min", () => {
    expect(clampLimit(0, 1, 500, 50)).toBe(1)
    expect(clampLimit(-100, 1, 500, 50)).toBe(1)
  })

  it("above max → max", () => {
    expect(clampLimit(10_000, 1, 500, 50)).toBe(500)
    expect(clampLimit(501, 1, 500, 50)).toBe(500)
  })

  it("inside range → floored value", () => {
    expect(clampLimit(100, 1, 500, 50)).toBe(100)
    expect(clampLimit(42.9, 1, 500, 50)).toBe(42)
  })

  it("known ceiling constants are sane", () => {
    expect(LIST_EVENTS_LIMIT_MAX).toBe(500)
    expect(LIST_EVENTS_LIMIT_DEFAULT).toBeLessThanOrEqual(LIST_EVENTS_LIMIT_MAX)
    expect(RECENT_BY_SUBJECT_LIMIT_MAX).toBe(200)
    expect(RECENT_BY_SUBJECT_LIMIT_DEFAULT).toBeLessThanOrEqual(
      RECENT_BY_SUBJECT_LIMIT_MAX,
    )
    expect(TOP_ERRORS_LIMIT_MAX).toBe(100)
    expect(TOP_ERRORS_LIMIT_DEFAULT).toBeLessThanOrEqual(TOP_ERRORS_LIMIT_MAX)
  })
})

// ─── truncatePayloadPreview ───────────────────────────────────────────

describe("truncatePayloadPreview", () => {
  it("null payload → (empty)", () => {
    expect(truncatePayloadPreview(null, 60)).toBe("(empty)")
  })

  it("undefined payload → (empty)", () => {
    expect(truncatePayloadPreview(undefined, 60)).toBe("(empty)")
  })

  it("string payload returned verbatim under the cap", () => {
    expect(truncatePayloadPreview("short", 60)).toBe("short")
  })

  it("object payload JSON-stringified", () => {
    expect(truncatePayloadPreview({ a: 1 }, 60)).toBe('{"a":1}')
  })

  it("oversize content truncated with ellipsis", () => {
    const long = "x".repeat(100)
    const out = truncatePayloadPreview(long, 10)
    expect(out).toBe("xxxxxxxxxx…")
    expect(out.length).toBe(11) // 10 + ellipsis
  })

  it("unserializable payload → (unserializable)", () => {
    // Circular reference breaks JSON.stringify.
    const a: Record<string, unknown> = {}
    a.self = a
    expect(truncatePayloadPreview(a, 60)).toBe("(unserializable)")
  })
})

// ─── mapRow ───────────────────────────────────────────────────────────

describe("mapRow", () => {
  it("bigint id → string", () => {
    const row = {
      id: BigInt("123456789012345678"),
      event_at: new Date("2026-05-25T12:00:00Z"),
      source: "eir",
      event_type: "transition",
      severity: "info",
      actor: null,
      subject_kind: "episode_intelligence_record",
      subject_id: "eir-1",
      payload: { from_phase: null, to_phase: "idea" },
      request_id: null,
      created_at: new Date("2026-05-25T12:00:00Z"),
    } as unknown as Parameters<typeof mapRow>[0]
    const out = mapRow(row)
    expect(out.id).toBe("123456789012345678")
    expect(typeof out.id).toBe("string")
  })

  it("payload null fallback to {}", () => {
    const row = {
      id: BigInt(1),
      event_at: new Date(),
      source: "sweeper",
      event_type: "summary",
      severity: "info",
      actor: "sweeper",
      subject_kind: null,
      subject_id: null,
      payload: null,
      request_id: null,
      created_at: new Date(),
    } as unknown as Parameters<typeof mapRow>[0]
    expect(mapRow(row).payload).toEqual({})
  })

  it("preserves subject_kind=null + subject_id=null for subjectless events", () => {
    const row = {
      id: BigInt(1),
      event_at: new Date(),
      source: "rate-limit",
      event_type: "rejected",
      severity: "warn",
      actor: null,
      subject_kind: null,
      subject_id: null,
      payload: { decision: "blocked_concurrency" },
      request_id: null,
      created_at: new Date(),
    } as unknown as Parameters<typeof mapRow>[0]
    const out = mapRow(row)
    expect(out.subject_kind).toBeNull()
    expect(out.subject_id).toBeNull()
  })
})
