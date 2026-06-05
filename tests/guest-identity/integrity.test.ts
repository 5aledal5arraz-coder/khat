/**
 * Phase 2.4.e.1 — pure tests for the guest-identity integrity lib.
 *
 * No DB. The DB-touching helpers are exercised by
 * scripts/smoke-p2-4-e-integrity.ts. This file locks down the
 * pure-function surface:
 *
 *   1. `severityFor` maps each (metric, count) onto the right tier.
 *   2. Threshold table is exhaustive — every metric the lib exposes
 *      has a matching entry. Drift catches a forgotten threshold
 *      when a new metric is added.
 *   3. `pickMostConnected` honors:
 *        - the score formula (episodes + cand + app + has_profile)
 *        - the deterministic tie-break (oldest created_at wins)
 *        - returns "" on empty input (defensive)
 *   4. `pickMostConnected` is stable across input permutations —
 *      shuffling the member list never changes the winner.
 *
 * Indirectly compile-tested: the threshold table's `as const`
 * narrowing ensures keys can ONLY be one of the four valid
 * IntegrityMetric values.
 */

import { describe, expect, it } from "vitest"
import {
  THRESHOLDS,
  severityFor,
  pickMostConnected,
  type IntegrityMetric,
  type DuplicateGroupMember,
} from "@/lib/guest-identity/integrity"

// ─── severityFor ──────────────────────────────────────────────────────

describe("severityFor — threshold mapping", () => {
  it("maps below-warn to info for every metric", () => {
    for (const metric of Object.keys(THRESHOLDS) as IntegrityMetric[]) {
      const t = THRESHOLDS[metric]
      expect(severityFor(metric, t.warn - 1)).toBe("info")
      expect(severityFor(metric, 0)).toBe("info")
    }
  })

  it("maps the warn boundary inclusively (count === warn → warn)", () => {
    for (const metric of Object.keys(THRESHOLDS) as IntegrityMetric[]) {
      const t = THRESHOLDS[metric]
      expect(severityFor(metric, t.warn)).toBe("warn")
    }
  })

  it("maps the error boundary inclusively (count === error → error)", () => {
    for (const metric of Object.keys(THRESHOLDS) as IntegrityMetric[]) {
      const t = THRESHOLDS[metric]
      expect(severityFor(metric, t.error)).toBe("error")
      expect(severityFor(metric, t.error + 100)).toBe("error")
    }
  })

  it("the operator-frozen thresholds remain unchanged (regression guard)", () => {
    // Operator §6 — adjusting these numbers requires re-approval.
    expect(THRESHOLDS.duplicateGroups).toEqual({ warn: 1, error: 5 })
    expect(THRESHOLDS.unlinkedAcceptedApplications).toEqual({
      warn: 1,
      error: 10,
    })
    expect(THRESHOLDS.unlinkedAcceptedCandidates).toEqual({
      warn: 5,
      error: 20,
    })
    expect(THRESHOLDS.staleProfiles).toEqual({ warn: 10, error: 50 })
  })
})

// ─── pickMostConnected ────────────────────────────────────────────────

function member(
  id: string,
  partial: Partial<Omit<DuplicateGroupMember, "id">> = {},
): DuplicateGroupMember {
  return {
    id,
    name: partial.name ?? id,
    slug: partial.slug ?? id,
    created_at: partial.created_at ?? new Date("2024-01-01T00:00:00Z"),
    episodes: partial.episodes ?? 0,
    candidate_links: partial.candidate_links ?? 0,
    application_links: partial.application_links ?? 0,
    has_profile: partial.has_profile ?? false,
  }
}

describe("pickMostConnected", () => {
  it("returns empty string on empty input", () => {
    expect(pickMostConnected([])).toBe("")
  })

  it("picks the member with the highest combined score", () => {
    const members = [
      member("a", { episodes: 1 }),
      member("b", { episodes: 5, candidate_links: 1 }),
      member("c", { episodes: 2, candidate_links: 2 }),
    ]
    expect(pickMostConnected(members)).toBe("b")
  })

  it("counts has_profile as +1 toward the score", () => {
    const members = [
      member("a", { episodes: 2 }),
      member("b", { episodes: 2, has_profile: true }),
    ]
    expect(pickMostConnected(members)).toBe("b")
  })

  it("breaks ties on oldest created_at", () => {
    const older = new Date("2023-01-01T00:00:00Z")
    const newer = new Date("2024-06-01T00:00:00Z")
    const members = [
      member("new", { episodes: 3, created_at: newer }),
      member("old", { episodes: 3, created_at: older }),
    ]
    expect(pickMostConnected(members)).toBe("old")
  })

  it("is order-independent (stable across input permutations)", () => {
    const a = member("a", {
      episodes: 4,
      created_at: new Date("2023-01-01T00:00:00Z"),
    })
    const b = member("b", {
      episodes: 4,
      created_at: new Date("2024-01-01T00:00:00Z"),
    })
    const c = member("c", {
      episodes: 1,
      created_at: new Date("2022-01-01T00:00:00Z"),
    })
    expect(pickMostConnected([a, b, c])).toBe("a")
    expect(pickMostConnected([b, c, a])).toBe("a")
    expect(pickMostConnected([c, a, b])).toBe("a")
    expect(pickMostConnected([c, b, a])).toBe("a")
  })

  it("returns the first member when every score is zero (defensive)", () => {
    // Tie at 0 → oldest created_at wins. The fixture uses equal
    // created_at so the iterator's first occurrence wins. The lib
    // guarantees the input is already ordered `created_at ASC` by
    // construction (DB array_agg ORDER BY), so this is the visible
    // behavior: the "earliest member as known to the DB" wins.
    const members = [member("a"), member("b"), member("c")]
    expect(pickMostConnected(members)).toBe("a")
  })

  it("a single member always wins (group_size === 2 boundary)", () => {
    // The lib never returns groups with fewer than 2 members, but the
    // pure helper accepts any length. Verify the single-member case
    // doesn't crash the score loop.
    expect(pickMostConnected([member("only")])).toBe("only")
  })
})
