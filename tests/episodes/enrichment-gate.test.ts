/**
 * P6 — Studio redesign: enrichment publish gate.
 *
 * isEnrichmentPublic decides whether the enriched knowledge-hub content shows
 * on the public episode page. It MUST be inert-first (missing status =
 * published) so the gate's introduction changes nothing for existing rows,
 * and MUST hide draft/scheduled-future content.
 */

import { describe, expect, it } from "vitest"
import { isEnrichmentPublic } from "@/lib/episodes/enrichments"

const NOW = Date.parse("2026-06-24T00:00:00Z")

describe("isEnrichmentPublic", () => {
  it("treats a null enrichment as not public", () => {
    expect(isEnrichmentPublic(null, NOW)).toBe(false)
  })

  it("is inert-first: missing/undefined status counts as published", () => {
    expect(isEnrichmentPublic({ scheduled_for: null }, NOW)).toBe(true)
    expect(isEnrichmentPublic({ publish_status: undefined, scheduled_for: null }, NOW)).toBe(true)
  })

  it("published with no schedule is public", () => {
    expect(isEnrichmentPublic({ publish_status: "published", scheduled_for: null }, NOW)).toBe(true)
  })

  it("hides draft / in_review / archived", () => {
    for (const s of ["draft", "in_review", "ready", "scheduled", "archived"]) {
      expect(isEnrichmentPublic({ publish_status: s, scheduled_for: null }, NOW)).toBe(false)
    }
  })

  it("hides published content scheduled in the future, shows it once due", () => {
    const future = "2026-06-25T00:00:00Z"
    const past = "2026-06-23T00:00:00Z"
    expect(isEnrichmentPublic({ publish_status: "published", scheduled_for: future }, NOW)).toBe(false)
    expect(isEnrichmentPublic({ publish_status: "published", scheduled_for: past }, NOW)).toBe(true)
  })

  it("ignores an unparseable scheduled_for (treats as not scheduled)", () => {
    expect(isEnrichmentPublic({ publish_status: "published", scheduled_for: "not-a-date" }, NOW)).toBe(true)
  })
})
