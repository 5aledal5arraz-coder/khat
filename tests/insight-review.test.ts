import { describe, it, expect } from "vitest"
import {
  setInsightStatus,
  editInsight,
  removeInsight,
  addManualInsight,
  bulkApproveVerified,
  type ReviewStamp,
} from "@/lib/preparation/v2/insight-review"
import {
  insightLiveStatus,
  isLiveInsight,
  type PrepV2Insight,
  type PrepV2Question,
} from "@/lib/preparation/v2/types"

const STAMP: ReviewStamp = { reviewer: "editor@khat", at: "2026-06-23T00:00:00.000Z" }

function ins(id: string, over: Partial<PrepV2Insight> = {}): PrepV2Insight {
  return {
    id,
    type: "stat",
    text: "claim " + id,
    timing: "during",
    sources: [{ title: "t", url: "https://example.com/" + id }],
    confidence: "verified",
    generated_at: "2026-06-21T00:00:00.000Z",
    live_status: "pending",
    ...over,
  }
}

function q(id: string, insights: PrepV2Insight[]): PrepV2Question {
  return {
    id,
    section: "deep_dive",
    text: "Q " + id,
    types: ["factual"],
    priority: "must_ask",
    purpose: "",
    follow_up_prompt: "",
    risk_level: "low",
    insights,
  }
}

describe("insightLiveStatus / isLiveInsight", () => {
  it("treats an absent live_status as pending", () => {
    const i = ins("a", {})
    delete (i as unknown as Record<string, unknown>).live_status
    expect(insightLiveStatus(i)).toBe("pending")
    expect(isLiveInsight(i)).toBe(false)
  })
  it("only approved insights are live", () => {
    expect(isLiveInsight(ins("a", { live_status: "approved" }))).toBe(true)
    expect(isLiveInsight(ins("a", { live_status: "pending" }))).toBe(false)
    expect(isLiveInsight(ins("a", { live_status: "hidden" }))).toBe(false)
  })
})

describe("setInsightStatus", () => {
  it("approves an insight and stamps the reviewer + time", () => {
    const bank = [q("q1", [ins("i1")])]
    const { bank: next, changed } = setInsightStatus(bank, "q1", "i1", "approved", STAMP)
    expect(changed).toBe(true)
    const updated = next[0].insights![0]
    expect(updated.live_status).toBe("approved")
    expect(updated.reviewed_by).toBe("editor@khat")
    expect(updated.reviewed_at).toBe(STAMP.at)
  })
  it("does not mutate the input bank", () => {
    const original = ins("i1")
    const bank = [q("q1", [original])]
    setInsightStatus(bank, "q1", "i1", "hidden", STAMP)
    expect(original.live_status).toBe("pending") // untouched
  })
  it("reports changed=false when the insight id is unknown", () => {
    const bank = [q("q1", [ins("i1")])]
    expect(setInsightStatus(bank, "q1", "nope", "approved", STAMP).changed).toBe(false)
  })
})

describe("editInsight", () => {
  it("edits the text and marks the card manual (human-owned)", () => {
    const bank = [q("q1", [ins("i1")])]
    const { bank: next, changed } = editInsight(bank, "q1", "i1", { text: "new claim" }, STAMP)
    expect(changed).toBe(true)
    expect(next[0].insights![0].text).toBe("new claim")
    expect(next[0].insights![0].manual).toBe(true)
  })
  it("updates review_note WITHOUT marking manual", () => {
    const bank = [q("q1", [ins("i1")])]
    const { bank: next } = editInsight(bank, "q1", "i1", { review_note: "double-checked" }, STAMP)
    expect(next[0].insights![0].review_note).toBe("double-checked")
    expect(next[0].insights![0].manual).toBeUndefined()
  })
  it("edits both halves of a correction", () => {
    const c = ins("i1", { type: "correction", correction: { inaccuracy: "x", accurate: "y" } })
    const bank = [q("q1", [c])]
    const { bank: next } = editInsight(
      bank,
      "q1",
      "i1",
      { correction: { inaccuracy: "X2", accurate: "Y2" } },
      STAMP,
    )
    expect(next[0].insights![0].correction).toEqual({ inaccuracy: "X2", accurate: "Y2" })
    expect(next[0].insights![0].manual).toBe(true)
  })
})

describe("removeInsight", () => {
  it("removes the matching insight only", () => {
    const bank = [q("q1", [ins("i1"), ins("i2")])]
    const { bank: next, changed } = removeInsight(bank, "q1", "i1")
    expect(changed).toBe(true)
    expect(next[0].insights!.map((i) => i.id)).toEqual(["i2"])
  })
})

describe("addManualInsight", () => {
  it("adds a manual, approved, verified card with the supplied id", () => {
    const bank = [q("q1", [])]
    const { bank: next, changed, insight } = addManualInsight(
      bank,
      "q1",
      { type: "fact", text: "a human fact", timing: "before", id: "ins-manual-xyz" },
      STAMP,
    )
    expect(changed).toBe(true)
    expect(insight?.id).toBe("ins-manual-xyz")
    expect(next[0].insights![0]).toMatchObject({
      manual: true,
      live_status: "approved",
      confidence: "verified",
      reviewed_by: "editor@khat",
    })
  })
  it("attaches only an http(s) source url, never fabricated", () => {
    const bank = [q("q1", [])]
    const ok = addManualInsight(bank, "q1", { type: "fact", text: "a real fact", timing: "after", sourceUrl: "https://nature.com/a" }, STAMP)
    expect(ok.insight!.sources).toHaveLength(1)
    const bad = addManualInsight(bank, "q1", { type: "fact", text: "a real fact", timing: "after", sourceUrl: "not-a-url" }, STAMP)
    expect(bad.insight!.sources).toHaveLength(0)
  })
  it("rejects a correction missing either half", () => {
    const bank = [q("q1", [])]
    const r = addManualInsight(
      bank,
      "q1",
      { type: "correction", text: "t", timing: "during", correction: { inaccuracy: "x", accurate: "" } },
      STAMP,
    )
    expect(r.changed).toBe(false)
    expect(r.insight).toBeNull()
  })
  it("rejects empty text", () => {
    const bank = [q("q1", [])]
    expect(addManualInsight(bank, "q1", { type: "fact", text: " ", timing: "during" }, STAMP).changed).toBe(false)
  })
})

describe("bulkApproveVerified", () => {
  it("approves only pending+verified, leaving partial/hidden/approved untouched", () => {
    const bank = [
      q("q1", [
        ins("v", { live_status: "pending", confidence: "verified" }),
        ins("p", { live_status: "pending", confidence: "partial" }),
        ins("h", { live_status: "hidden", confidence: "verified" }),
        ins("a", { live_status: "approved", confidence: "verified" }),
      ]),
    ]
    const { bank: next, count } = bulkApproveVerified(bank, STAMP)
    expect(count).toBe(1)
    const byId = Object.fromEntries(next[0].insights!.map((i) => [i.id, i.live_status]))
    expect(byId).toEqual({ v: "approved", p: "pending", h: "hidden", a: "approved" })
  })
})
