/**
 * Phase 2.4.b — pure unit tests for the backfill helpers.
 *
 * No DB. No I/O. Locks down the routing decision matrix + the
 * social-links parser + the source-summary composition.
 */

import { describe, expect, it } from "vitest"
import {
  routeOutcome,
  parseSocialLinksBlob,
  buildSourceSummary,
  stripEmpty,
} from "@/lib/backfill/guest-identity-helpers"

// ─── routeOutcome ─────────────────────────────────────────────────────

describe("routeOutcome — routing decision matrix", () => {
  it("high → auto_link regardless of flags", () => {
    expect(
      routeOutcome("high", { confirm: false, confirmCreateCanonicals: false }),
    ).toBe("auto_link")
    expect(
      routeOutcome("high", { confirm: true, confirmCreateCanonicals: false }),
    ).toBe("auto_link")
    expect(
      routeOutcome("high", { confirm: true, confirmCreateCanonicals: true }),
    ).toBe("auto_link")
  })

  it("medium → auto_link regardless of flags", () => {
    expect(
      routeOutcome("medium", {
        confirm: true,
        confirmCreateCanonicals: false,
      }),
    ).toBe("auto_link")
  })

  it("low → requires_review regardless of flags (operator §10 Q1)", () => {
    expect(
      routeOutcome("low", { confirm: true, confirmCreateCanonicals: true }),
    ).toBe("requires_review")
  })

  it("none + dry-run → would_create_canonical_skip", () => {
    expect(
      routeOutcome("none", {
        confirm: false,
        confirmCreateCanonicals: false,
      }),
    ).toBe("would_create_canonical_skip")
  })

  it("none + --confirm but no --confirm-create-canonicals → would_create_canonical_skip (defense-in-depth)", () => {
    expect(
      routeOutcome("none", {
        confirm: true,
        confirmCreateCanonicals: false,
      }),
    ).toBe("would_create_canonical_skip")
  })

  it("none + both confirm flags → create_canonical_and_link", () => {
    expect(
      routeOutcome("none", { confirm: true, confirmCreateCanonicals: true }),
    ).toBe("create_canonical_and_link")
  })
})

// ─── parseSocialLinksBlob ─────────────────────────────────────────────

describe("parseSocialLinksBlob — heuristic parser", () => {
  it("null/empty/whitespace → empty record, unparsed_text=null", () => {
    expect(parseSocialLinksBlob(null)).toEqual({
      social_accounts: {},
      unparsed_text: null,
    })
    expect(parseSocialLinksBlob(undefined)).toEqual({
      social_accounts: {},
      unparsed_text: null,
    })
    expect(parseSocialLinksBlob("   ")).toEqual({
      social_accounts: {},
      unparsed_text: null,
    })
  })

  it("extracts twitter, instagram, youtube from a mixed blob", () => {
    const result = parseSocialLinksBlob(
      "twitter: https://twitter.com/somebody, " +
        "instagram: https://instagram.com/some.handle, " +
        "youtube: https://youtube.com/@somechannel",
    )
    expect(result.social_accounts.twitter).toBe("https://twitter.com/somebody")
    expect(result.social_accounts.instagram).toBe(
      "https://instagram.com/some.handle",
    )
    expect(result.social_accounts.youtube).toBe(
      "https://youtube.com/@somechannel",
    )
  })

  it("accepts x.com as twitter alias", () => {
    const result = parseSocialLinksBlob("https://x.com/anotherone")
    expect(result.social_accounts.twitter).toBe("https://x.com/anotherone")
  })

  it("captures a generic website url separately from platform handles", () => {
    const result = parseSocialLinksBlob(
      "https://example.com/about and https://twitter.com/somebody",
    )
    expect(result.social_accounts.twitter).toBe("https://twitter.com/somebody")
    expect(result.social_accounts.website).toBe("https://example.com/about")
  })

  it("never throws on garbage — places leftover into unparsed_text", () => {
    const result = parseSocialLinksBlob(
      "phone: 555-0001 — instagram: @missing-protocol",
    )
    // No protocol → not matched. Goes to unparsed_text. Never throws.
    expect(result.social_accounts).toEqual({})
    expect(result.unparsed_text).toContain("phone")
  })

  it("doesn't double-match a single URL into both website and platform", () => {
    const result = parseSocialLinksBlob("https://linkedin.com/in/someone")
    expect(result.social_accounts.linkedin).toBe(
      "https://linkedin.com/in/someone",
    )
    expect(result.social_accounts.website).toBeUndefined()
  })
})

// ─── buildSourceSummary ───────────────────────────────────────────────

describe("buildSourceSummary", () => {
  it("omits zero-count sections", () => {
    const out = buildSourceSummary({
      discovery: { runs: 0, last_seen: null },
      application: { id: null, received_at: null },
      candidates: { count: 0, last_seen: null },
      studio: { sessions: 0, last_seen: null },
      preparation: { records: 0, last_seen: null },
      manual_last_seen: "2026-05-26T00:00:00Z",
    })
    expect(out).toEqual({ manual: { last_seen: "2026-05-26T00:00:00Z" } })
  })

  it("populates all sections when present", () => {
    const out = buildSourceSummary({
      discovery: { runs: 2, last_seen: "2026-01-01T00:00:00Z" },
      application: { id: "app-1", received_at: "2026-02-01T00:00:00Z" },
      candidates: { count: 1, last_seen: "2026-03-01T00:00:00Z" },
      studio: { sessions: 3, last_seen: "2026-04-01T00:00:00Z" },
      preparation: { records: 4, last_seen: "2026-04-15T00:00:00Z" },
      manual_last_seen: "2026-05-01T00:00:00Z",
    })
    expect(Object.keys(out)).toEqual([
      "discovery",
      "application",
      "candidates",
      "studio",
      "preparation",
      "manual",
    ])
  })

  it("stable key ordering: discovery → application → candidates → studio → preparation → manual", () => {
    // Reordered inputs shouldn't affect output order.
    const out1 = buildSourceSummary({
      discovery: { runs: 1, last_seen: "x" },
      application: { id: "a", received_at: "y" },
      candidates: { count: 1, last_seen: "z" },
      studio: { sessions: 1, last_seen: "w" },
      preparation: { records: 1, last_seen: "v" },
      manual_last_seen: "u",
    })
    const out2 = buildSourceSummary({
      // Same data, but property declaration order in the input is
      // irrelevant — `buildSourceSummary` builds the output in a
      // fixed sequence.
      manual_last_seen: "u",
      preparation: { records: 1, last_seen: "v" },
      studio: { sessions: 1, last_seen: "w" },
      candidates: { count: 1, last_seen: "z" },
      application: { id: "a", received_at: "y" },
      discovery: { runs: 1, last_seen: "x" },
    })
    expect(JSON.stringify(out1)).toBe(JSON.stringify(out2))
  })
})

// ─── stripEmpty ───────────────────────────────────────────────────────

describe("stripEmpty", () => {
  it("removes null and undefined values", () => {
    expect(stripEmpty({ a: 1, b: null, c: undefined })).toEqual({ a: 1 })
  })

  it("removes empty object values", () => {
    expect(stripEmpty({ a: 1, b: {} })).toEqual({ a: 1 })
  })

  it("removes empty array values", () => {
    expect(stripEmpty({ a: 1, b: [] })).toEqual({ a: 1 })
  })

  it("keeps non-empty nested objects and arrays", () => {
    expect(stripEmpty({ a: { x: 1 }, b: [1, 2], c: 0 })).toEqual({
      a: { x: 1 },
      b: [1, 2],
      c: 0,
    })
  })

  it("preserves key ordering from input", () => {
    const keys = Object.keys(
      stripEmpty({ z: 1, a: 2, m: 3 }) as Record<string, unknown>,
    )
    expect(keys).toEqual(["z", "a", "m"])
  })
})
