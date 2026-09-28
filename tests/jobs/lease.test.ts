/**
 * Worker leases — the renew-and-reap model (lib/jobs/lease.ts).
 *
 * Pure. Replaces the old "widened lease" tests: that model stretched the reap
 * window past the longest handler budget (30 min + 1) because nothing renewed
 * a quiet handler's lease — which is exactly why a job orphaned by `kill -9`
 * sat `running` for 31–55 minutes. The worker now renews its own jobs on a
 * timer, so the window only has to cover a few missed renewals.
 */
import { describe, it, expect } from "vitest"
import {
  leaseStaleMs,
  DEFAULT_LEASE_STALE_MS,
  MIN_LEASE_STALE_MS,
  LEASE_RENEW_INTERVAL_MS,
  REAP_INTERVAL_MS,
  REQUEUED_MESSAGE,
  REQUEUE_EXHAUSTED_MESSAGE,
} from "@/lib/jobs/lease"

describe("leaseStaleMs", () => {
  it("defaults to a few minutes — not the 31-minute widened lease", () => {
    expect(leaseStaleMs(undefined)).toBe(DEFAULT_LEASE_STALE_MS)
    expect(leaseStaleMs(NaN)).toBe(DEFAULT_LEASE_STALE_MS)
    expect(DEFAULT_LEASE_STALE_MS).toBeLessThanOrEqual(5 * 60_000)
  })

  it("never drops below three missed renewals (a slow write can't reap a live job)", () => {
    expect(leaseStaleMs(1_000)).toBe(MIN_LEASE_STALE_MS)
    expect(MIN_LEASE_STALE_MS).toBeGreaterThanOrEqual(3 * LEASE_RENEW_INTERVAL_MS)
    expect(DEFAULT_LEASE_STALE_MS).toBeGreaterThanOrEqual(MIN_LEASE_STALE_MS)
  })

  it("keeps a configured window above the floor", () => {
    expect(leaseStaleMs(300_000)).toBe(300_000)
  })

  it("the reaper runs often enough that recovery ≈ window + one reap tick", () => {
    expect(REAP_INTERVAL_MS).toBeLessThan(DEFAULT_LEASE_STALE_MS)
    expect(DEFAULT_LEASE_STALE_MS + REAP_INTERVAL_MS).toBeLessThanOrEqual(3 * 60_000)
  })
})

describe("reclaim messages are Arabic and tell the operator what happens next", () => {
  it("requeue says it will run again; exhaustion says to press «أعد المحاولة»", () => {
    expect(REQUEUED_MESSAGE).toMatch(/أُعيدت إلى الطابور/)
    expect(REQUEUE_EXHAUSTED_MESSAGE).toContain("«أعد المحاولة»")
  })
})
