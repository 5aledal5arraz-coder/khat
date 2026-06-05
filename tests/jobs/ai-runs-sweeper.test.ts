/**
 * Phase 2.1 (P2.1.c) — sweeper pure-function unit tests.
 *
 * Locks down the classifier + env-reader from P2.1.b. The DB-touching
 * paths (transaction, advisory lock, UPDATE/DELETE SQL) are exercised
 * by `npm run smoke:ai-runs-sweeper` in P2.1.c. This file is the pure
 * surface only — no DB, no I/O.
 *
 * P2.1.b's runtime is FROZEN. These tests describe its behavior; do
 * not modify the sweeper handler to make them pass.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  DEFAULT_MAX_ROWS,
  DEFAULT_STALE_AFTER_MS,
  classifyAiRunForSweep,
  readSweepEnv,
} from "@/lib/jobs/handlers/ai-runs-sweeper"

// Anchor used by every classifier test. Picked to be well clear of
// DST / leap-second boundaries; pure-math arithmetic only.
const NOW = new Date("2026-06-01T12:00:00Z")
const MIN = 60_000
const STALE_AFTER_MS = 15 * MIN

// ─── classifyAiRunForSweep ──────────────────────────────────────────

describe("classifyAiRunForSweep — pure classifier", () => {
  it("reclaims a stale running row (20 min old)", () => {
    expect(
      classifyAiRunForSweep({
        now: NOW,
        status: "running",
        startedAt: new Date(NOW.getTime() - 20 * MIN),
        staleAfterMs: STALE_AFTER_MS,
      }),
    ).toBe("reclaim")
  })

  it("keeps a recent running row (5 min old)", () => {
    expect(
      classifyAiRunForSweep({
        now: NOW,
        status: "running",
        startedAt: new Date(NOW.getTime() - 5 * MIN),
        staleAfterMs: STALE_AFTER_MS,
      }),
    ).toBe("keep")
  })

  it("reclaims at the exact threshold (15 min old)", () => {
    // P2.1.b uses `>=` on the age comparison; equal-age must reclaim.
    expect(
      classifyAiRunForSweep({
        now: NOW,
        status: "running",
        startedAt: new Date(NOW.getTime() - STALE_AFTER_MS),
        staleAfterMs: STALE_AFTER_MS,
      }),
    ).toBe("reclaim")
  })

  it("keeps a row 1 ms inside the window", () => {
    expect(
      classifyAiRunForSweep({
        now: NOW,
        status: "running",
        startedAt: new Date(NOW.getTime() - (STALE_AFTER_MS - 1)),
        staleAfterMs: STALE_AFTER_MS,
      }),
    ).toBe("keep")
  })

  it("reclaims a row 1 ms past the window", () => {
    expect(
      classifyAiRunForSweep({
        now: NOW,
        status: "running",
        startedAt: new Date(NOW.getTime() - (STALE_AFTER_MS + 1)),
        staleAfterMs: STALE_AFTER_MS,
      }),
    ).toBe("reclaim")
  })

  it("skips an already-succeeded row regardless of age", () => {
    expect(
      classifyAiRunForSweep({
        now: NOW,
        status: "succeeded",
        startedAt: new Date(NOW.getTime() - 60 * MIN),
        staleAfterMs: STALE_AFTER_MS,
      }),
    ).toBe("skip")
  })

  it("skips an already-failed row", () => {
    expect(
      classifyAiRunForSweep({
        now: NOW,
        status: "failed",
        startedAt: new Date(NOW.getTime() - 60 * MIN),
        staleAfterMs: STALE_AFTER_MS,
      }),
    ).toBe("skip")
  })

  it("skips an already-timed_out row", () => {
    expect(
      classifyAiRunForSweep({
        now: NOW,
        status: "timed_out",
        startedAt: new Date(NOW.getTime() - 60 * MIN),
        staleAfterMs: STALE_AFTER_MS,
      }),
    ).toBe("skip")
  })

  it("skips a cancelled row", () => {
    expect(
      classifyAiRunForSweep({
        now: NOW,
        status: "cancelled",
        startedAt: new Date(NOW.getTime() - 60 * MIN),
        staleAfterMs: STALE_AFTER_MS,
      }),
    ).toBe("skip")
  })

  it("skips a running row with NULL started_at (defensive)", () => {
    // Should never happen at the schema level (default is now()),
    // but if a downstream INSERT explicitly nulls it the classifier
    // refuses to compute age rather than treating it as 1970-epoch.
    expect(
      classifyAiRunForSweep({
        now: NOW,
        status: "running",
        startedAt: null,
        staleAfterMs: STALE_AFTER_MS,
      }),
    ).toBe("skip")
  })
})

// ─── readSweepEnv ────────────────────────────────────────────────────

const ENV_KEYS = [
  "KHAT_AI_RUNS_STALE_AFTER_MS",
  "KHAT_AI_RUNS_SWEEP_MAX_ROWS",
] as const

function snapshotEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const k of ENV_KEYS) out[k] = process.env[k]
  return out
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k]
    else process.env[k] = snap[k]
  }
}

describe("readSweepEnv — env-var parsing + fallback", () => {
  let snap: Record<string, string | undefined>
  beforeEach(() => {
    snap = snapshotEnv()
  })
  afterEach(() => restoreEnv(snap))

  it("returns defaults when no overrides set", () => {
    delete process.env.KHAT_AI_RUNS_STALE_AFTER_MS
    delete process.env.KHAT_AI_RUNS_SWEEP_MAX_ROWS
    const out = readSweepEnv()
    expect(out.staleAfterMs).toBe(DEFAULT_STALE_AFTER_MS)
    expect(out.maxRows).toBe(DEFAULT_MAX_ROWS)
  })

  it("applies both overrides when valid", () => {
    process.env.KHAT_AI_RUNS_STALE_AFTER_MS = "600000"
    process.env.KHAT_AI_RUNS_SWEEP_MAX_ROWS = "100"
    const out = readSweepEnv()
    expect(out.staleAfterMs).toBe(600_000)
    expect(out.maxRows).toBe(100)
  })

  it("floors fractional maxRows", () => {
    process.env.KHAT_AI_RUNS_SWEEP_MAX_ROWS = "42.7"
    expect(readSweepEnv().maxRows).toBe(42)
  })

  it("falls back to defaults when both values are non-numeric", () => {
    process.env.KHAT_AI_RUNS_STALE_AFTER_MS = "abc"
    process.env.KHAT_AI_RUNS_SWEEP_MAX_ROWS = "xyz"
    const out = readSweepEnv()
    expect(out.staleAfterMs).toBe(DEFAULT_STALE_AFTER_MS)
    expect(out.maxRows).toBe(DEFAULT_MAX_ROWS)
  })

  it("falls back to defaults when both values are negative", () => {
    process.env.KHAT_AI_RUNS_STALE_AFTER_MS = "-1"
    process.env.KHAT_AI_RUNS_SWEEP_MAX_ROWS = "-100"
    const out = readSweepEnv()
    expect(out.staleAfterMs).toBe(DEFAULT_STALE_AFTER_MS)
    expect(out.maxRows).toBe(DEFAULT_MAX_ROWS)
  })

  it("falls back to defaults when both values are zero", () => {
    process.env.KHAT_AI_RUNS_STALE_AFTER_MS = "0"
    process.env.KHAT_AI_RUNS_SWEEP_MAX_ROWS = "0"
    const out = readSweepEnv()
    expect(out.staleAfterMs).toBe(DEFAULT_STALE_AFTER_MS)
    expect(out.maxRows).toBe(DEFAULT_MAX_ROWS)
  })

  it("treats only one env set", () => {
    process.env.KHAT_AI_RUNS_STALE_AFTER_MS = "1234567"
    delete process.env.KHAT_AI_RUNS_SWEEP_MAX_ROWS
    const out = readSweepEnv()
    expect(out.staleAfterMs).toBe(1_234_567)
    expect(out.maxRows).toBe(DEFAULT_MAX_ROWS)
  })

  it("treats empty-string env as default", () => {
    process.env.KHAT_AI_RUNS_STALE_AFTER_MS = ""
    process.env.KHAT_AI_RUNS_SWEEP_MAX_ROWS = ""
    const out = readSweepEnv()
    expect(out.staleAfterMs).toBe(DEFAULT_STALE_AFTER_MS)
    expect(out.maxRows).toBe(DEFAULT_MAX_ROWS)
  })
})
