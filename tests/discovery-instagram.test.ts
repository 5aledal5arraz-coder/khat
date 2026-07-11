/**
 * Instagram integration into guest discovery. Pure/offline — no network.
 *
 *   1. igUsernameFromWiki — exact-handle extraction from the Wikidata P2003
 *      link (identity safety: discovery NEVER fuzzy-searches Instagram by
 *      name — same rule as the X source).
 *   2. scoreCandidate — an active Instagram presence lifts guestability/
 *      recency/notability and adds Arabic evidence; absence of the slice
 *      changes nothing (graceful degradation).
 *   3. key-gating — without IG_GRAPH_TOKEN + IG_BUSINESS_ACCOUNT_ID the
 *      client resolves null/[] (no network attempted).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { igUsernameFromWiki } from "@/lib/discovery-v2/sources/instagram"
import { scoreCandidate } from "@/lib/discovery-v2/score"
import {
  getBusinessProfile,
  isInstagramConfigured,
  searchHashtagTopMedia,
} from "@/lib/instagram/client"
import type { EnrichmentSignals, WikiFacts, ProposedName } from "@/lib/discovery-v2/types"

describe("igUsernameFromWiki", () => {
  const wiki = (instagram: string | null): WikiFacts => ({ resolved: true, social: { instagram } })
  it("extracts from instagram.com URLs, including dots and www", () => {
    expect(igUsernameFromWiki(wiki("https://instagram.com/someone"))).toBe("someone")
    expect(igUsernameFromWiki(wiki("https://www.instagram.com/some.one_1/"))).toBe("some.one_1")
  })
  it("null when no handle on Wikidata", () => {
    expect(igUsernameFromWiki(wiki(null))).toBeNull()
    expect(igUsernameFromWiki({ resolved: true })).toBeNull()
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
  social: { instagram: "https://instagram.com/someone" },
}

const activeIg: NonNullable<EnrichmentSignals["instagram"]> = {
  url: "https://instagram.com/someone",
  username: "someone",
  followers: 120_000,
  media_count: 500,
  posting: "active",
  recent_posts: 12,
  avg_engagement: 900,
  recent_sample: ["منشور حديث"],
  bio: "باحث",
  website: null,
}

describe("scoreCandidate with Instagram signals", () => {
  it("an active Instagram presence lifts the overall score and adds Arabic evidence", () => {
    const without = scoreCandidate(proposed, baseWiki, {}, { topic: "بحث علمي" })
    const withIg = scoreCandidate(proposed, baseWiki, { instagram: activeIg }, { topic: "بحث علمي" })
    expect(withIg.scores.guestability).toBeGreaterThan(without.scores.guestability)
    expect(withIg.scores.recency).toBeGreaterThan(without.scores.recency)
    expect(withIg.scores.notability).toBeGreaterThan(without.scores.notability)
    expect(withIg.scores.overall).toBeGreaterThan(without.scores.overall)
    if (withIg.decision !== "rejected") {
      expect(withIg.reasons.join(" ")).toContain("نشط على إنستغرام")
    }
  })

  it("a dormant account adds no activity boost", () => {
    const dormant = { ...activeIg, posting: "dormant" as const, followers: 100 }
    const without = scoreCandidate(proposed, baseWiki, {}, { topic: "بحث علمي" })
    const withIg = scoreCandidate(proposed, baseWiki, { instagram: dormant }, { topic: "بحث علمي" })
    expect(withIg.scores.recency).toBe(without.scores.recency)
    expect(withIg.scores.guestability).toBe(without.scores.guestability)
  })

  it("no Instagram slice → identical scores (graceful degradation)", () => {
    const a = scoreCandidate(proposed, baseWiki, {}, { topic: "بحث علمي" })
    const b = scoreCandidate(proposed, baseWiki, { instagram: null }, { topic: "بحث علمي" })
    expect(a.scores).toEqual(b.scores)
  })

  it("reach counts the best platform, not the sum (no double-counting)", () => {
    const activeX: NonNullable<EnrichmentSignals["x"]> = {
      url: "https://x.com/someone",
      username: "someone",
      followers: 120_000,
      verified: true,
      posting: "active",
      recent_posts: 10,
      avg_engagement: 250,
      recent_sample: [],
      bio: null,
    }
    const xOnly = scoreCandidate(proposed, baseWiki, { x: activeX }, { topic: "بحث علمي" })
    const both = scoreCandidate(
      proposed,
      baseWiki,
      { x: activeX, instagram: activeIg },
      { topic: "بحث علمي" },
    )
    expect(both.scores.notability).toBe(xOnly.scores.notability)
    expect(both.scores.guestability).toBe(xOnly.scores.guestability)
  })
})

// ─── Key gating (config removed for the block → no network ever attempted) ───

describe("key gating without IG_GRAPH_TOKEN / IG_BUSINESS_ACCOUNT_ID", () => {
  let savedToken: string | undefined
  let savedAccount: string | undefined
  beforeAll(() => {
    savedToken = process.env.IG_GRAPH_TOKEN
    savedAccount = process.env.IG_BUSINESS_ACCOUNT_ID
    delete process.env.IG_GRAPH_TOKEN
    delete process.env.IG_BUSINESS_ACCOUNT_ID
  })
  afterAll(() => {
    if (savedToken !== undefined) process.env.IG_GRAPH_TOKEN = savedToken
    if (savedAccount !== undefined) process.env.IG_BUSINESS_ACCOUNT_ID = savedAccount
  })

  it("client is unconfigured and resolves null/[]", async () => {
    expect(isInstagramConfigured()).toBe(false)
    expect(await getBusinessProfile("someone")).toBeNull()
    expect(await searchHashtagTopMedia("بودكاست")).toEqual([])
  })
})
