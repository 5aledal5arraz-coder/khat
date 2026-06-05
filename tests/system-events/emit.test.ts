/**
 * Phase 2.3 (P2.3.a) — emit helper unit tests.
 *
 * Pure-function surface only. No DB — the writer is hand-stubbed with
 * the `SystemEventsWriter` duck-type contract. DB-roundtrip lands in
 * P2.3.b's smoke (`smoke-system-events.ts`).
 *
 * What this file locks down:
 *   1. `buildSystemEventRow` produces the right row shape per variant.
 *   2. `emitSystemEventWith` never throws when the writer throws.
 *   3. `emitSystemEventWith` returns silently when the writer is null
 *      (degraded env — DATABASE_URL not set).
 *   4. severity is read from the input variant, not from any default
 *      (no caller-side override possible — pinned at the type layer).
 *   5. subject_kind / subject_id default to null for subjectless events.
 *   6. event_at is forwarded only when set (otherwise the DB default
 *      `now()` populates it).
 *   7. request_id passes through as null when undefined (operator §13
 *      Q4 — column reserved, nullable in v1).
 */

import { describe, expect, it } from "vitest"
import {
  buildSystemEventRow,
  emitSystemEventWith,
  type SystemEventsWriter,
} from "@/lib/system-events/emit"
import type { SystemEventInput } from "@/lib/system-events/types"
import { systemEvents } from "@/lib/db/schema/system-events"

// ─── Hand-rolled stub matching SystemEventsWriter ────────────────────

function stubWriter(): SystemEventsWriter & {
  rows: Array<typeof systemEvents.$inferInsert>
} {
  const rows: Array<typeof systemEvents.$inferInsert> = []
  return {
    rows,
    // TypeScript allows function expressions to take fewer parameters
    // than the target type expects (parameter compatibility is one-way),
    // so omitting `table` and `row` here is sound — and keeps ESLint
    // strict-mode clean without an `_`-prefix opt-in.
    insert: () => ({
      values: (row) => ({
        execute: async () => {
          rows.push(row)
        },
      }),
    }),
  }
}

function failingWriter(message: string): SystemEventsWriter {
  return {
    insert: () => ({
      values: () => ({
        execute: async () => {
          throw new Error(message)
        },
      }),
    }),
  }
}

// ─── buildSystemEventRow — pure shape assertions ─────────────────────

describe("buildSystemEventRow — shape per variant", () => {
  it("eir.transition variant — severity=info, subject pinned", () => {
    const input: SystemEventInput = {
      source: "eir",
      event_type: "transition",
      severity: "info",
      subject_kind: "episode_intelligence_record",
      subject_id: "eir-abc",
      payload: { from_phase: "idea", to_phase: "guest_assigned" },
    }
    const row = buildSystemEventRow(input)
    expect(row.source).toBe("eir")
    expect(row.event_type).toBe("transition")
    expect(row.severity).toBe("info")
    expect(row.subject_kind).toBe("episode_intelligence_record")
    expect(row.subject_id).toBe("eir-abc")
    expect(row.payload).toEqual({ from_phase: "idea", to_phase: "guest_assigned" })
    expect(row.actor).toBeNull()
    expect(row.request_id).toBeNull()
    // event_at is not in the row — let the DB default to now().
    expect(row.event_at).toBeUndefined()
  })

  it("jobs.dead variant — severity=error", () => {
    const input: SystemEventInput = {
      source: "jobs",
      event_type: "dead",
      severity: "error",
      subject_kind: "job",
      subject_id: "job-42",
      payload: { job_type: "ai.summarize", error_message: "boom", attempts: 5 },
      actor: "worker:abc12345",
    }
    const row = buildSystemEventRow(input)
    expect(row.severity).toBe("error")
    expect(row.actor).toBe("worker:abc12345")
    expect(row.subject_id).toBe("job-42")
  })

  it("rate-limit.rejected — subjectless event has both subject fields null", () => {
    const input: SystemEventInput = {
      source: "rate-limit",
      event_type: "rejected",
      severity: "warn",
      payload: {
        task_kind: "ai.summarize",
        tier: "expensive",
        decision: "blocked_concurrency",
        mode: "enforce",
      },
    }
    const row = buildSystemEventRow(input)
    expect(row.subject_kind).toBeNull()
    expect(row.subject_id).toBeNull()
    expect(row.severity).toBe("warn")
    expect(row.payload).toEqual({
      task_kind: "ai.summarize",
      tier: "expensive",
      decision: "blocked_concurrency",
      mode: "enforce",
    })
  })

  it("sweeper.summary — subjectless info event", () => {
    const input: SystemEventInput = {
      source: "sweeper",
      event_type: "summary",
      severity: "info",
      actor: "sweeper",
      payload: {
        scanned: 100,
        reclaimed: 3,
        skipped: 97,
        duration_ms: 250,
        stale_after_ms: 900_000,
      },
    }
    const row = buildSystemEventRow(input)
    expect(row.source).toBe("sweeper")
    expect(row.severity).toBe("info")
    expect(row.actor).toBe("sweeper")
    expect(row.subject_kind).toBeNull()
  })

  it("schedule.created — forwards cadence + schedule_type to payload", () => {
    const input: SystemEventInput = {
      source: "schedule",
      event_type: "created",
      severity: "info",
      payload: { schedule_type: "ai-runs-sweeper", cadence: "30m" },
    }
    const row = buildSystemEventRow(input)
    expect(row.source).toBe("schedule")
    expect(row.event_type).toBe("created")
    expect(row.payload).toEqual({
      schedule_type: "ai-runs-sweeper",
      cadence: "30m",
    })
  })

  it("event_at is forwarded only when explicitly set", () => {
    const ts = new Date("2026-05-25T12:00:00Z")
    const withTs: SystemEventInput = {
      source: "schedule",
      event_type: "created",
      severity: "info",
      event_at: ts,
      payload: { schedule_type: "x", cadence: "1h" },
    }
    expect(buildSystemEventRow(withTs).event_at).toBe(ts)

    const withoutTs: SystemEventInput = {
      source: "schedule",
      event_type: "created",
      severity: "info",
      payload: { schedule_type: "x", cadence: "1h" },
    }
    expect(buildSystemEventRow(withoutTs).event_at).toBeUndefined()
  })

  it("request_id passes through as null when undefined", () => {
    const input: SystemEventInput = {
      source: "sweeper",
      event_type: "summary",
      severity: "info",
      payload: {
        scanned: 0,
        reclaimed: 0,
        skipped: 0,
        duration_ms: 0,
        stale_after_ms: 0,
      },
    }
    expect(buildSystemEventRow(input).request_id).toBeNull()
  })

  it("request_id passes through verbatim when set", () => {
    const input: SystemEventInput = {
      source: "sweeper",
      event_type: "summary",
      severity: "info",
      request_id: "req-xyz",
      payload: {
        scanned: 0,
        reclaimed: 0,
        skipped: 0,
        duration_ms: 0,
        stale_after_ms: 0,
      },
    }
    expect(buildSystemEventRow(input).request_id).toBe("req-xyz")
  })
})

// ─── emitSystemEventWith — fire-and-forget contract ──────────────────

describe("emitSystemEventWith — hard contract: never throws", () => {
  it("writes one row through the injected writer", async () => {
    const w = stubWriter()
    await emitSystemEventWith(w, {
      source: "eir",
      event_type: "transition",
      severity: "info",
      subject_kind: "episode_intelligence_record",
      subject_id: "eir-1",
      payload: { from_phase: "idea", to_phase: "guest_assigned" },
    })
    expect(w.rows).toHaveLength(1)
    expect(w.rows[0].source).toBe("eir")
    expect(w.rows[0].event_type).toBe("transition")
  })

  it("swallows writer errors and returns void", async () => {
    const w = failingWriter("simulated db down")
    // Must not throw.
    await expect(
      emitSystemEventWith(w, {
        source: "jobs",
        event_type: "succeeded",
        severity: "info",
        subject_kind: "job",
        subject_id: "job-1",
        payload: { job_type: "noop", duration_ms: 1 },
      }),
    ).resolves.toBeUndefined()
  })

  it("returns silently when writer is null (DATABASE_URL unset)", async () => {
    await expect(
      emitSystemEventWith(null, {
        source: "sweeper",
        event_type: "summary",
        severity: "info",
        payload: {
          scanned: 0,
          reclaimed: 0,
          skipped: 0,
          duration_ms: 0,
          stale_after_ms: 0,
        },
      }),
    ).resolves.toBeUndefined()
  })

  it("forwards multiple distinct events in order", async () => {
    const w = stubWriter()
    await emitSystemEventWith(w, {
      source: "jobs",
      event_type: "claimed",
      severity: "info",
      subject_kind: "job",
      subject_id: "job-1",
      payload: { job_type: "x", priority: 0, attempts: 0, max_attempts: 3 },
    })
    await emitSystemEventWith(w, {
      source: "jobs",
      event_type: "succeeded",
      severity: "info",
      subject_kind: "job",
      subject_id: "job-1",
      payload: { job_type: "x", duration_ms: 100 },
    })
    expect(w.rows).toHaveLength(2)
    expect(w.rows[0].event_type).toBe("claimed")
    expect(w.rows[1].event_type).toBe("succeeded")
  })
})
