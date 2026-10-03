/**
 * Topic-engine defect #7 — the wizard's decision loaders (accepted titles,
 * negative memory, accepted domain/category counts) read EVERY decision row:
 *
 *   - an UNDONE reject kept its title in "Negative memory" (its fingerprint
 *     was deleted, its title was not);
 *   - an UNDONE accept — including a removed manual topic — stayed in
 *     "Already chosen" and the Jaccard filter;
 *   - a RETIRED slot (Overview «أعد توليد»: accept, then a later reject on
 *     the same card) was at once "already chosen" AND "negative memory", and
 *     still counted toward the accepted domain/category balance.
 *
 * The topic's effective decision is now the LATEST non-undone decision that
 * targets the topic (pair/topic). A guest-only reject («غيّر الضيف») does not
 * change the topic's standing — the action leaves the topic's status alone.
 */
import { describe, it, expect } from "vitest"
import { resolveEffectiveTopicDecisions } from "@/lib/khat-map/learning/decisions"

const t = (iso: string) => new Date(iso)
type Row = Parameters<typeof resolveEffectiveTopicDecisions>[0][number]
const row = (over: Partial<Row>): Row => ({
  topic_candidate_id: "c1",
  kind: "accept",
  target: "pair",
  reason_category: null,
  undone_at: null,
  created_at: t("2026-10-01T10:00:00Z"),
  ...over,
})

describe("resolveEffectiveTopicDecisions", () => {
  it("an undone reject is not negative memory", () => {
    const r = resolveEffectiveTopicDecisions([
      row({ kind: "reject", undone_at: t("2026-10-01T10:00:05Z") }),
    ])
    expect(r.rejected).toEqual([])
    expect(r.accepted).toEqual([])
  })

  it("an undone accept (removed manual topic) is not 'already chosen'", () => {
    const r = resolveEffectiveTopicDecisions([
      row({ kind: "accept", target: "topic", undone_at: t("2026-10-01T11:00:00Z") }),
    ])
    expect(r.accepted).toEqual([])
  })

  it("a retired slot (accept, then a later reject) counts only as rejected", () => {
    const r = resolveEffectiveTopicDecisions([
      row({ kind: "accept", created_at: t("2026-10-01T10:00:00Z") }),
      row({ kind: "reject", reason_category: null, created_at: t("2026-10-02T10:00:00Z") }),
    ])
    expect(r.accepted).toEqual([])
    expect(r.rejected.map((x) => x.topic_candidate_id)).toEqual(["c1"])
  })

  it("a guest-only reject leaves an accepted topic accepted", () => {
    const r = resolveEffectiveTopicDecisions([
      row({ kind: "accept", created_at: t("2026-10-01T10:00:00Z") }),
      row({ kind: "reject", target: "guest", reason_category: "weak_guest", created_at: t("2026-10-02T10:00:00Z") }),
    ])
    expect(r.accepted).toEqual(["c1"])
    expect(r.rejected).toEqual([])
  })

  it("re-accepting after an undone reject is accepted", () => {
    const r = resolveEffectiveTopicDecisions([
      row({ kind: "reject", undone_at: t("2026-10-01T10:00:04Z"), created_at: t("2026-10-01T10:00:00Z") }),
      row({ kind: "accept", created_at: t("2026-10-01T10:00:06Z") }),
    ])
    expect(r.accepted).toEqual(["c1"])
  })

  it("keeps the reason category of the effective reject", () => {
    const r = resolveEffectiveTopicDecisions([
      row({ topic_candidate_id: "c2", kind: "reject", reason_category: "off_brand" }),
    ])
    expect(r.rejected).toEqual([{ topic_candidate_id: "c2", reason_category: "off_brand" }])
  })
})
