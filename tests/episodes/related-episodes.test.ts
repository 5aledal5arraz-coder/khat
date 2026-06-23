/**
 * P4 — Studio redesign: deterministic related-episode scoring.
 *
 * computeRelatedEpisodes ranks the public "related episodes" rail, so its
 * signal ordering (shared topics > same guest > category), the topic-overlap
 * boost, self-exclusion, and the top-N cap must be locked in.
 */

import { describe, expect, it } from "vitest"
import { computeRelatedEpisodes, type EpisodeGraphNode } from "@/lib/episodes/episode-graph"

const T = (id: string, over: Partial<EpisodeGraphNode> = {}): EpisodeGraphNode => ({ id, ...over })

describe("computeRelatedEpisodes", () => {
  it("excludes the target itself", () => {
    const out = computeRelatedEpisodes(T("a", { guestId: "g1" }), [T("a", { guestId: "g1" })])
    expect(out).toHaveLength(0)
  })

  it("ranks shared-topic episodes above same-guest, and boosts by overlap", () => {
    const target = T("a", { guestId: "g1", topicIds: ["t1", "t2", "t3"] })
    const candidates = [
      T("same_guest", { guestId: "g1" }), // 70
      T("one_topic", { topicIds: ["t1"] }), // 40 + 12 = 52
      T("three_topics", { topicIds: ["t1", "t2", "t3"] }), // 40 + 36 = 76
    ]
    const out = computeRelatedEpisodes(target, candidates)
    expect(out.map((e) => e.relatedEpisodeId)).toEqual(["three_topics", "same_guest", "one_topic"])
    expect(out[0].relationType).toBe("same_topic")
    expect(out[0].score).toBe(76)
    expect(out.find((e) => e.relatedEpisodeId === "same_guest")?.score).toBe(70)
  })

  it("takes each candidate's STRONGEST signal (topic over guest)", () => {
    const target = T("a", { guestId: "g1", topicIds: ["t1", "t2", "t3", "t4", "t5", "t6"] })
    // shares guest AND 6 topics → topic score min(100, 40+72)=100 wins over 70
    const out = computeRelatedEpisodes(target, [T("b", { guestId: "g1", topicIds: ["t1", "t2", "t3", "t4", "t5", "t6"] })])
    expect(out[0].score).toBe(100)
    expect(out[0].relationType).toBe("same_topic")
  })

  it("drops candidates with no signal and caps at the limit", () => {
    const target = T("a", { guestId: "g1" })
    const candidates = [
      T("unrelated1"),
      ...Array.from({ length: 12 }, (_, i) => T(`g${i}`, { guestId: "g1" })),
    ]
    const out = computeRelatedEpisodes(target, candidates, 8)
    expect(out).toHaveLength(8)
    expect(out.every((e) => e.relatedEpisodeId !== "unrelated1")).toBe(true)
  })

  it("treats null guest/category as no signal (no self-match via null)", () => {
    const out = computeRelatedEpisodes(T("a"), [T("b"), T("c")])
    expect(out).toHaveLength(0)
  })
})
