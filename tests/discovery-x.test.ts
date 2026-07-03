/**
 * X (Twitter) integration into guest discovery. Pure/offline — no network.
 *
 *   1. classifyPosting — the activity-cadence classifier (injected clock).
 *   2. usernameFromWiki — exact-handle extraction from the Wikidata P2002 link
 *      (identity safety: discovery NEVER fuzzy-searches X by name).
 *   3. scoreCandidate — an active X presence lifts guestability/recency/
 *      notability and adds Arabic evidence, improving the candidate's rank;
 *      absence of the slice changes nothing (graceful degradation).
 *   4. key-gating — without X_BEARER_TOKEN the client resolves null and the
 *      prep provider reports "unavailable" (no network attempted).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { classifyPosting, usernameFromWiki } from "@/lib/discovery-v2/sources/x"
import { scoreCandidate } from "@/lib/discovery-v2/score"
import { getUserByUsername, isXConfigured } from "@/lib/x/client"
import { xSearch } from "@/lib/ai/preparation/research/x"
import type { EnrichmentSignals, WikiFacts, ProposedName } from "@/lib/discovery-v2/types"

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse("2026-07-01T00:00:00Z")
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString()

describe("classifyPosting", () => {
  it("active: recent + frequent", () => {
    expect(classifyPosting([daysAgo(2), daysAgo(10), daysAgo(40)], NOW)).toBe("active")
  })
  it("occasional: last post months old", () => {
    expect(classifyPosting([daysAgo(100)], NOW)).toBe("occasional")
  })
  it("dormant: silent > 6 months, or no dated posts", () => {
    expect(classifyPosting([daysAgo(300)], NOW)).toBe("dormant")
    expect(classifyPosting([], NOW)).toBe("dormant")
    expect(classifyPosting([null, null], NOW)).toBe("dormant")
  })
  it("recent but sparse is not 'active'", () => {
    expect(classifyPosting([daysAgo(5)], NOW)).toBe("occasional")
  })
})

describe("usernameFromWiki", () => {
  const wiki = (x: string | null): WikiFacts => ({ resolved: true, social: { x } })
  it("extracts from x.com and twitter.com URLs", () => {
    expect(usernameFromWiki(wiki("https://x.com/someone"))).toBe("someone")
    expect(usernameFromWiki(wiki("https://twitter.com/@Other_1"))).toBe("Other_1")
  })
  it("null when no handle on Wikidata", () => {
    expect(usernameFromWiki(wiki(null))).toBeNull()
    expect(usernameFromWiki({ resolved: true })).toBeNull()
  })
})

// ─── Ranking impact ───────────────────────────────────────────────────────────

const proposed: ProposedName = { name: "ضيف تجريبي", why: "خبير في الموضوع" } as ProposedName

const baseWiki: WikiFacts = {
  resolved: true,
  label: "Test Guest",
  label_ar: "ضيف تجريبي",
  sitelink_count: 4,
  occupations: ["researcher"],
  social: { x: "https://x.com/someone" },
}

const activeX: NonNullable<EnrichmentSignals["x"]> = {
  url: "https://x.com/someone",
  username: "someone",
  followers: 120_000,
  verified: true,
  posting: "active",
  recent_posts: 10,
  avg_engagement: 250,
  recent_sample: ["منشور حديث"],
  bio: "باحث",
}

describe("scoreCandidate with X signals", () => {
  it("an active X presence lifts the overall score and adds Arabic evidence", () => {
    const without = scoreCandidate(proposed, baseWiki, {}, { topic: "بحث علمي" })
    const withX = scoreCandidate(proposed, baseWiki, { x: activeX }, { topic: "بحث علمي" })
    expect(withX.scores.guestability).toBeGreaterThan(without.scores.guestability)
    expect(withX.scores.recency).toBeGreaterThan(without.scores.recency)
    expect(withX.scores.notability).toBeGreaterThan(without.scores.notability)
    expect(withX.scores.overall).toBeGreaterThan(without.scores.overall)
    if (withX.decision !== "rejected") {
      expect(withX.reasons.join(" ")).toContain("نشط على X")
    }
  })

  it("a dormant account adds no activity boost", () => {
    const dormant = { ...activeX, posting: "dormant" as const, followers: 100 }
    const without = scoreCandidate(proposed, baseWiki, {}, { topic: "بحث علمي" })
    const withX = scoreCandidate(proposed, baseWiki, { x: dormant }, { topic: "بحث علمي" })
    expect(withX.scores.recency).toBe(without.scores.recency)
    expect(withX.scores.guestability).toBe(without.scores.guestability)
  })

  it("no X slice → identical scores (graceful degradation)", () => {
    const a = scoreCandidate(proposed, baseWiki, {}, { topic: "بحث علمي" })
    const b = scoreCandidate(proposed, baseWiki, { x: null }, { topic: "بحث علمي" })
    expect(a.scores).toEqual(b.scores)
  })
})

// ─── Key gating (token removed for the block → no network ever attempted) ────

describe("key gating without X_BEARER_TOKEN", () => {
  let saved: string | undefined
  beforeAll(() => {
    saved = process.env.X_BEARER_TOKEN
    delete process.env.X_BEARER_TOKEN
  })
  afterAll(() => {
    if (saved !== undefined) process.env.X_BEARER_TOKEN = saved
  })

  it("client is unconfigured and resolves null", async () => {
    expect(isXConfigured()).toBe(false)
    expect(await getUserByUsername("someone")).toBeNull()
  })
  it("prep provider reports unavailable", async () => {
    const r = await xSearch("بودكاست")
    expect(r.diagnostic.status).toBe("unavailable")
    expect(r.sources).toHaveLength(0)
  })
})
