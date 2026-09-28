/**
 * The CRM dedupe match rule, pure. (The upsert itself is proven against the
 * real DB in from-discovery-db.test.ts.)
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db", () => ({ db: {} }))

import { crmPayloadFromDiscovery, findCrmMatch } from "@/lib/guest-candidates/from-discovery"

const rows = [
  { id: "a", full_name: "نايف المطوّع", display_name: null, wikidata_qid: null },
  { id: "b", full_name: "Someone Else", display_name: "سالم الفرحان", wikidata_qid: "Q9" },
]

describe("findCrmMatch", () => {
  it("the folded name matches across hamza / taa-marbuta / shadda spellings", () => {
    expect(findCrmMatch(rows, { name: "نايف المطوع", qid: null })?.id).toBe("a")
  })
  it("display_name counts too", () => {
    expect(findCrmMatch(rows, { name: "سالم الفرحان", qid: null })?.id).toBe("b")
  })
  it("a QID wins over the name", () => {
    expect(findCrmMatch(rows, { name: "اسم مختلف تماماً", qid: "Q9" })?.id).toBe("b")
  })
  it("two DIFFERENT confident QIDs under one name are two people — no name match", () => {
    const withQid = [{ id: "c", full_name: "نايف المطوع", display_name: null, wikidata_qid: "Q1" }]
    expect(findCrmMatch(withQid, { name: "نايف المطوع", qid: "Q2" })).toBeNull()
    // …but a missing QID on either side still matches by name
    expect(findCrmMatch(withQid, { name: "نايف المطوع", qid: null })?.id).toBe("c")
    expect(findCrmMatch(rows, { name: "نايف المطوع", qid: "Q2" })?.id).toBe("a")
  })

  it("sight: a different person is no match", () => {
    expect(findCrmMatch(rows, { name: "شخص جديد", qid: "Q1" })).toBeNull()
  })
})

describe("crmPayloadFromDiscovery", () => {
  it("carries the confident QID, and nothing without a name", () => {
    const base = {
      display_name: null, proposed_name: "نايف المطوع", proposed_role: null, proposed_country: null,
      evidence_urls: [], general_rationale: null, topic_fit_rationale: null,
      platform_signals: { v2: { qid: "Q42", why: "سبب" } },
    }
    expect(crmPayloadFromDiscovery(base as never)?.qid).toBe("Q42")
    expect(crmPayloadFromDiscovery({ ...base, proposed_name: " " } as never)).toBeNull()
  })
})
