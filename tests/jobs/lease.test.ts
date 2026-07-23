/**
 * Effective-lease backstop (Fix B, layer 2).
 *
 * Pure. No DB, no worker process. Proves the invariant that the effective lease
 * is never shorter than the longest handler budget — otherwise the stale-lease
 * reaper could reclaim a still-running long job (studio.* map/review = 30 min)
 * while the configured lease is only 5 min → double execution.
 */
import { describe, it, expect, vi } from "vitest"
import {
  effectiveLeaseMs,
  LEASE_SAFETY_BUFFER_MS,
  BOOT_RECLAIM_STALE_MS,
} from "@/lib/jobs/lease"

const FIVE_MIN = 5 * 60_000
const THIRTY_MIN = 30 * 60_000

describe("effectiveLeaseMs", () => {
  it("WIDENS the lease + fires onWiden when configured < longest handler timeout", () => {
    const onWiden = vi.fn()
    const eff = effectiveLeaseMs({
      configuredLeaseMs: FIVE_MIN,
      handlerTimeouts: { "studio.episode_map": THIRTY_MIN, "market.extract": 15 * 60_000 },
      defaultTimeoutMs: FIVE_MIN,
      onWiden,
    })
    expect(eff).toBe(THIRTY_MIN + LEASE_SAFETY_BUFFER_MS)
    expect(onWiden).toHaveBeenCalledTimes(1)
    expect(onWiden).toHaveBeenCalledWith({
      configuredLeaseMs: FIVE_MIN,
      maxHandlerTimeoutMs: THIRTY_MIN,
      effectiveLeaseMs: THIRTY_MIN + LEASE_SAFETY_BUFFER_MS,
    })
  })

  it("keeps the configured lease + no warn when it already covers the longest timeout", () => {
    const onWiden = vi.fn()
    const eff = effectiveLeaseMs({
      configuredLeaseMs: 40 * 60_000,
      handlerTimeouts: { "studio.episode_map": THIRTY_MIN },
      defaultTimeoutMs: FIVE_MIN,
      onWiden,
    })
    expect(eff).toBe(40 * 60_000)
    expect(onWiden).not.toHaveBeenCalled()
  })

  it("boundary: configured EXACTLY equal to the longest timeout IS widened (lease stays strictly > timeout)", () => {
    // `<=` not `<`: at equality a handler timing out at the 30-min edge would
    // race the reaper. Widening to timeout+buffer keeps lease strictly greater,
    // so the worker always fails the timed-out handler before the reaper reclaims.
    const onWiden = vi.fn()
    const eff = effectiveLeaseMs({
      configuredLeaseMs: THIRTY_MIN,
      handlerTimeouts: { "studio.episode_map": THIRTY_MIN },
      defaultTimeoutMs: FIVE_MIN,
      onWiden,
    })
    expect(eff).toBe(THIRTY_MIN + LEASE_SAFETY_BUFFER_MS)
    expect(onWiden).toHaveBeenCalledTimes(1)
    expect(onWiden).toHaveBeenCalledWith({
      configuredLeaseMs: THIRTY_MIN,
      maxHandlerTimeoutMs: THIRTY_MIN,
      effectiveLeaseMs: THIRTY_MIN + LEASE_SAFETY_BUFFER_MS,
    })
  })

  it("keeps a configured lease that is strictly above the longest timeout (by even 1ms)", () => {
    // Sanity that we only widen on `<=`: one ms over the budget is left untouched.
    const onWiden = vi.fn()
    const eff = effectiveLeaseMs({
      configuredLeaseMs: THIRTY_MIN + 1,
      handlerTimeouts: { "studio.episode_map": THIRTY_MIN },
      defaultTimeoutMs: FIVE_MIN,
      onWiden,
    })
    expect(eff).toBe(THIRTY_MIN + 1)
    expect(onWiden).not.toHaveBeenCalled()
  })

  it("the DEFAULT timeout counts toward the longest budget", () => {
    // No per-type override longer than the default → default is the max.
    const eff = effectiveLeaseMs({
      configuredLeaseMs: 60_000,
      handlerTimeouts: { "demo.echo": 10_000 },
      defaultTimeoutMs: FIVE_MIN,
    })
    expect(eff).toBe(FIVE_MIN + LEASE_SAFETY_BUFFER_MS)
  })

  it("respects a custom buffer", () => {
    const eff = effectiveLeaseMs({
      configuredLeaseMs: FIVE_MIN,
      handlerTimeouts: { "studio.episode_map": THIRTY_MIN },
      defaultTimeoutMs: FIVE_MIN,
      bufferMs: 120_000,
    })
    expect(eff).toBe(THIRTY_MIN + 120_000)
  })

  it("mirrors the real worker default (5-min lease vs 30-min studio handlers) → widened", () => {
    // This is exactly the production misconfiguration the backstop exists for.
    const eff = effectiveLeaseMs({
      configuredLeaseMs: FIVE_MIN,
      handlerTimeouts: {
        "studio.episode_map": THIRTY_MIN,
        "studio.episode_review": THIRTY_MIN,
        "model.benchmark": THIRTY_MIN,
      },
      defaultTimeoutMs: FIVE_MIN,
    })
    expect(eff).toBeGreaterThanOrEqual(THIRTY_MIN)
  })
})

describe("BOOT_RECLAIM_STALE_MS — the dedicated boot-time reclaim window", () => {
  it("is the small 5-min window (NOT the widened loop lease)", () => {
    // worker.ts passes THIS to the startup reclaimStaleJobs, so a job stalled
    // seconds before a restart (locked_at seconds old) is recovered at boot
    // instead of waiting up to the ~31-min loop lease.
    expect(BOOT_RECLAIM_STALE_MS).toBe(FIVE_MIN)
  })

  it("is strictly SMALLER than the effective loop lease under the real worker config", () => {
    // The property that makes boot reclaim useful: it reaches stalls the coarse
    // loop reaper (which must stay widened so it can't steal a live long job)
    // would leave frozen for up to ~31 min.
    const loopLease = effectiveLeaseMs({
      configuredLeaseMs: FIVE_MIN,
      handlerTimeouts: {
        "studio.episode_map": THIRTY_MIN,
        "studio.episode_review": THIRTY_MIN,
        "model.benchmark": THIRTY_MIN,
      },
      defaultTimeoutMs: FIVE_MIN,
    })
    expect(BOOT_RECLAIM_STALE_MS).toBeLessThan(loopLease)
  })
})
