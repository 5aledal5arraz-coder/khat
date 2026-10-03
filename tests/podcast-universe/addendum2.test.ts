/**
 * Addendum 2 (2026-10-03, gold-set fixes): tolerant of text form, strict on
 * evidence meaning. Cases come from Noura's gold set (scratchpad/noura-m1).
 */
import { describe, expect, it } from "vitest"
import { containsAsWords, matchForm } from "@/lib/podcast-universe/normalize"
import { joinsTwoPeople, validateExtraction, type SourceEpisode } from "@/lib/podcast-universe/extraction/validate"
import { admissibleNationalityClaim, kuwaitiAdjectiveInGuestClause } from "@/lib/podcast-universe/evidence"
import { isHostCandidate } from "@/lib/podcast-universe/queries"
import { GUEST_EXTRACT_PROMPT_VERSION } from "@/lib/podcast-universe/constants"
import { SYSTEM_RULES } from "@/lib/podcast-universe/extraction/prompt"

const ID = "77777777-7777-4777-8777-777777777777"
function one(ep: SourceEpisode, guest: Record<string, unknown>, kind = "guest_interview") {
  return validateExtraction({ episodes: [{ episode_id: ep.id, content_kind: kind, guests: [guest] }] }, [ep])
}

describe("(a) whitespace + tashkeel normalized on both sides, originals kept", () => {
  it("a trailing space before a newline no longer breaks the exact match (بدون ورق 53)", () => {
    const ep: SourceEpisode = { id: ID, title: "بدون ورق 53 | د. نجم عبدالكريم", description: "د. نجم عبدالكريم \nاعلامي قدير\n\n0:00 المقدمة" }
    const r = one(ep, { display_name: "نجم عبدالكريم", evidence_field: "description", evidence_text: "د. نجم عبدالكريم\nاعلامي قدير", confidence: 0.9 })
    const g = r.results.get(ID)!.guests
    expect(g).toHaveLength(1)
    // The stored evidence is the model's original text, not the normalized copy.
    expect(g[0].evidence_text).toBe("د. نجم عبدالكريم\nاعلامي قدير")
  })
  it("tashkeel in the source does not block a bare-letter evidence", () => {
    expect(containsAsWords("ضيفنا سَالِم نَاصِر اليوم", "سالم ناصر")).toBe(true)
    expect(matchForm("  سَالِم \n\t ناصر ")).toBe("سالم ناصر")
  })
})

describe("(b) exactly one attached proclitic و/ب/ل/ف", () => {
  it("«ومازن الضراب» matches «مازن الضراب»", () => {
    expect(containsAsWords("حلقة مع فيصل ومازن الضراب", "مازن الضراب", { proclitic: true })).toBe(true)
    const ep: SourceEpisode = { id: ID, title: "حلقة مع فيصل ومازن الضراب", description: null }
    expect(one(ep, { display_name: "مازن الضراب", evidence_text: "مازن الضراب", confidence: 0.9 }).results.get(ID)!.guests).toHaveLength(1)
  })
  it("«تعليم» never matches «علي» — with or without the proclitic option", () => {
    expect(containsAsWords("حلقة عن تعليم الأطفال", "علي", { proclitic: true })).toBe(false)
    expect(containsAsWords("حلقة عن تعليم الأطفال", "علي")).toBe(false)
  })
  it("no stacking, no other letters, and only when asked", () => {
    expect(containsAsWords("وبمازن الضراب", "مازن الضراب", { proclitic: true })).toBe(false)
    expect(containsAsWords("كمازن الضراب", "مازن الضراب", { proclitic: true })).toBe(false)
    expect(containsAsWords("ومازن الضراب", "مازن الضراب")).toBe(false)
    expect(containsAsWords("لمازن الضراب", "مازن الضراب", { proclitic: true })).toBe(true)
  })
})

describe("(c) hosts and one person per entry", () => {
  it("a listed host is excluded deterministically — not a guest, not a failure", () => {
    const ep: SourceEpisode = { id: ID, title: "بدون ورق | تقديم فيصل العقل", description: null, hostNames: ["فيصل العقل"] }
    const r = one(ep, { display_name: "فيصل العقل", evidence_text: "تقديم فيصل العقل", confidence: 0.9 })
    expect(r.results.get(ID)!.guests).toHaveLength(0)
    expect(r.issues).toContainEqual(expect.objectContaining({ severity: "host_excluded" }))
    expect(r.issues.some((i) => i.severity === "guest_rejected")).toBe(false)
  })
  it("a display_name joining two people is rejected (re-extract)", () => {
    expect(joinsTwoPeople("خالد وسعود بن مبارك")).toBe("وسعود")
    expect(joinsTwoPeople("عبدالعزيز وعبدالله الناصر")).toBe("وعبدالله")
    expect(joinsTwoPeople("سالم و ناصر")).toBe("conjunction")
    const ep: SourceEpisode = { id: ID, title: "خالد وسعود بن مبارك", description: null }
    const r = one(ep, { display_name: "خالد وسعود بن مبارك", evidence_text: "خالد وسعود بن مبارك", confidence: 0.9 })
    expect(r.results.get(ID)!.guests).toHaveLength(0)
    expect(r.issues[0].reason).toContain("joins two people")
  })
  it("one person whose name merely contains «و» is kept", () => {
    for (const n of ["ستيفان وايزر", "سايلس والتن", "خالد وليد العتيبي", "عبدالله العلي، بوخالد", "محمد محمود (بوش)"]) {
      expect(joinsTwoPeople(n), n).toBeNull()
    }
  })
  it("HOST_CANDIDATE_REVIEW: >30% of a channel's extracted episodes (min 5) only flags", () => {
    expect(isHostCandidate(4, 10)).toBe(true)
    expect(isHostCandidate(3, 10)).toBe(false)
    expect(isHostCandidate(3, 4)).toBe(false)
  })
  it("prompt v3 separates people, names the channel hosts, and ties nationality evidence to the name", () => {
    expect(GUEST_EXTRACT_PROMPT_VERSION).toBe("podcast-universe-guest-extract-v3")
    expect(SYSTEM_RULES).toContain("must include the guest's name")
    expect(SYSTEM_RULES).toContain("channel_hosts")
    expect(SYSTEM_RULES).toContain("ONE person per guest entry")
  })
})

describe("(d) PROBABLE KW: name + كويتي/كويتية, same clause, ≤6 tokens, no second person between", () => {
  it.each([
    ["الرحال الكويتي والعالمي أنور الجويسري", "أنور الجويسري"],
    ["الإعلامي الرياضي الكويتي مطلق نصار الشريفي", "مطلق نصار الشريفي"],
    ["سعد مبارك الفرج فنان كويتي قدير", "سعد مبارك الفرج"],
    ["خالد المظفر فنان كويتي", "خالد المظفر"],
    ["مها الغنيم سيدة أعمال كويتية", "مها الغنيم"],
  ])("accepts «%s»", (ev, name) => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: ev, displayName: name }).ok).toBe(true)
  })
  it.each([
    ["سعد الفرج والفنان الآخر وهو كويتي", "سعد الفرج"],
    ["سعد الفرج مع الفنان الآخر وهو كويتي", "سعد الفرج"],
    ["سالم ناصر تحدث عن رحلته الطويلة في عالم الأعمال الكويتي", "سالم ناصر"],
    ["سالم ناصر، والحلقة من إنتاج شركة كويتية", "سالم ناصر"],
    ["حلقة مع سالم ناصر. ضيف الأسبوع القادم كويتي", "سالم ناصر"],
    ["المذيع الكويتي خالد يحاور سالم ناصر", "سالم ناصر"],
  ])("rejects «%s»", (ev, name) => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: ev, displayName: name }).ok).toBe(false)
  })
  it("a second person's name between them blocks it", () => {
    expect(kuwaitiAdjectiveInGuestClause("سالم ناصر وخالد العلي الكويتي", "سالم ناصر", ["خالد العلي"])).toBe(false)
    expect(kuwaitiAdjectiveInGuestClause("سالم ناصر وخالد العلي الكويتي", "خالد العلي", ["سالم ناصر"])).toBe(true)
  })
  it("exactly 6 tokens is allowed, 7 is not", () => {
    expect(kuwaitiAdjectiveInGuestClause("سالم ناصر أ ب ت ث ج ح كويتي", "سالم ناصر")).toBe(true)
    expect(kuwaitiAdjectiveInGuestClause("سالم ناصر أ ب ت ث ج ح خ كويتي", "سالم ناصر")).toBe(false)
  })
})
