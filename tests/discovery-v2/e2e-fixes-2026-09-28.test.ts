/**
 * The discovery correctness fixes from the 2026-09-28 end-to-end test
 * (rashid's review rows) — each pinned in both directions where it can be.
 * Every person here is FICTIONAL.
 *
 *   4  the story classifier sees the topic; S scales with verified relevance;
 *      the flat 0.62 topic-fit prior is gone
 *   5  Listen Notes sandbox data (`test: true`) is not evidence
 *   6  Wikidata identity guards (nationality / implausible age), and an
 *      untrusted match contributes nothing
 *   7  the story-check queue: topic fit first, 2 of 12 reserved for experts
 *   9  honest numbers: «غير مقيّم», and the nationality chip only when checked
 */
import { afterEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ calls: [] as Array<{ user: string; system: string; promptVersion?: string }> }))

vi.mock("@/lib/ai-router", () => ({
  runAiTask: vi.fn(async (req: { prompt: Array<{ content: string }>; promptVersion?: string }) => {
    h.calls.push({ system: req.prompt[0].content, user: req.prompt[1].content, promptVersion: req.promptVersion })
    return { status: "succeeded", runId: "r", parsed: { story_type: "none", evidence: [] } }
  }),
}))

import type { EnrichmentSignals, ProposedName, StoryAssessment, StoryCheck, StorySource, WikiFacts } from "@/lib/discovery-v2/types"
import { DEFAULT_DISCOVERY_GENDER, DEFAULT_DISCOVERY_GEOGRAPHY } from "@/lib/discovery-v2/types"
import { classifyStory, STORY_PROMPT_VERSION, verifyStoryClassification } from "@/lib/discovery-v2/story-classify"
import { realPodcastAppearances, scoreCandidate, storyScore } from "@/lib/discovery-v2/score"
import { expertReserve, nameVariants, selectForStoryCheck } from "@/lib/discovery-v2/story-evidence"
import { identityContradiction, resolvePerson } from "@/lib/discovery-v2/sources/wikidata"
import { unmeasuredScores, wikiFactsTrusted } from "@/lib/discovery-v2/display"

const NAME = "سالم عبدالله الفرحان"
const Q = `روى ${NAME} كيف خسرت عائلته ثروتها حين تفرّق الإرث بين الأبناء`
const SOURCES: StorySource[] = [
  { kind: "web", title: `لقاء ${NAME}`, url: "https://alqabas.com/s1", domain: "alqabas.com", text: Q, verified: true },
]
const V = nameVariants([NAME])

const verified = (relevance?: "on_topic" | "adjacent" | "off_topic"): StoryAssessment => ({
  status: "verified",
  not_checked_reason: null,
  story_type: "first_hand",
  summary: null,
  evidence: [{ url: "https://alqabas.com/s1", domain: "alqabas.com", quote: Q }],
  gulf_event: null,
  claim_from_propose: null,
  topic_relevance: relevance ? { value: relevance, url: "https://alqabas.com/s1", quote: Q } : null,
})

// ─── 4. Topic relevance ─────────────────────────────────────────────────────

describe("4 — the classifier judges the story against THE TOPIC", () => {
  afterEach(() => {
    h.calls = []
  })

  it("the prompt carries the episode topic and the new field; the version is bumped", async () => {
    await classifyStory({ name: NAME, claim: null, topic: "المال يتذكّر ما نسيته العائلة", sources: SOURCES, variants: V })
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0].user).toContain("موضوع الحلقة: المال يتذكّر ما نسيته العائلة")
    expect(h.calls[0].system).toContain("topic_relevance")
    expect(h.calls[0].promptVersion).toBe(STORY_PROMPT_VERSION)
    expect(STORY_PROMPT_VERSION).not.toBe("v2-story-1")
  })

  it("relevance counts only with a verified quote — a paraphrase or a namesake verdict drops it", () => {
    const ok = verifyStoryClassification(
      { story_type: "first_hand", evidence: [{ source: 1, quote: Q }], topic_relevance: { value: "on_topic", source: 1, quote: Q }, same_person: true },
      SOURCES, V, null,
    )
    expect(ok.assessment.topic_relevance).toEqual({ value: "on_topic", url: "https://alqabas.com/s1", quote: Q })
    const paraphrase = verifyStoryClassification(
      { story_type: "first_hand", evidence: [{ source: 1, quote: Q }], topic_relevance: { value: "on_topic", source: 1, quote: `تحدث ${NAME} عن المال والعائلة والإرث طويلاً` }, same_person: true },
      SOURCES, V, null,
    )
    expect(paraphrase.assessment.topic_relevance).toBeNull()
    const badValue = verifyStoryClassification(
      { story_type: "first_hand", evidence: [{ source: 1, quote: Q }], topic_relevance: { value: "very_relevant", source: 1, quote: Q }, same_person: true },
      SOURCES, V, null,
    )
    expect(badValue.assessment.topic_relevance).toBeNull()
    const namesake = verifyStoryClassification(
      { story_type: "first_hand", evidence: [{ source: 1, quote: Q }], topic_relevance: { value: "on_topic", source: 1, quote: Q }, same_person: false },
      SOURCES, V, null,
    )
    expect(namesake.assessment.topic_relevance).toBeNull()
  })

  it("S counts fully only on topic: on 0.8 · adjacent ×0.4 · off 0 · unproven ×0.4", () => {
    expect(storyScore(verified("on_topic"))).toBe(0.8)
    expect(storyScore(verified("adjacent"))).toBeCloseTo(0.32)
    expect(storyScore(verified("off_topic"))).toBe(0)
    expect(storyScore(verified())).toBeCloseTo(0.32)
  })

  it("topic fit comes from the verified relevance; without it there is no 0.62 prior and it is «غير مقيّم»", () => {
    const p: ProposedName = { name: NAME, role: "رائد أعمال", why: "أسّس شركة" }
    const topic = "المال يتذكّر ما نسيته العائلة"
    const check = (a: StoryAssessment): StoryCheck => ({ assessment: a, sources: SOURCES, attrs: { deceased: false, not_individual: false, same_person: true, gender: "male", nationality: null } })
    const on = scoreCandidate(p, { resolved: false }, {}, { topic }, check(verified("on_topic")))
    expect(on.scores.topic_fit).toBe(1)
    expect(on.scores.unmeasured).not.toContain("topic_fit")
    const off = scoreCandidate(p, { resolved: false }, {}, { topic }, check(verified("off_topic")))
    expect(off.scores.topic_fit).toBe(0)
    // No relevance, and nothing in the proposal names the topic → 0, not 0.62.
    const none = scoreCandidate(p, { resolved: false }, {}, { topic }, check(verified()))
    expect(none.scores.topic_fit).toBe(0)
    expect(none.scores.unmeasured).toContain("topic_fit")
  })
})

// ─── 5. Listen Notes sandbox ─────────────────────────────────────────────────

describe("5 — Listen Notes sandbox data is not evidence", () => {
  const p: ProposedName = { name: NAME }
  const mock: EnrichmentSignals = { podcast: { appearances: 3, configured: false, test: true } }
  const real: EnrichmentSignals = { podcast: { appearances: 3, configured: true, test: false } }

  it("test:true counts as no appearance — guestability, the reason, the helper", () => {
    expect(realPodcastAppearances(mock)).toBe(0)
    expect(realPodcastAppearances(real)).toBe(3)
    const withMock = scoreCandidate(p, { resolved: false }, mock, { topic: "t" })
    const without = scoreCandidate(p, { resolved: false }, {}, { topic: "t" })
    expect(withMock.scores.guestability).toBe(without.scores.guestability)
    expect(withMock.reasons).not.toContain("ظهر ضيفاً في بودكاست سابقاً")
    expect(withMock.scores.unmeasured).toContain("guestability")
  })

  it("sight: REAL appearances still count", () => {
    const c = scoreCandidate(p, { resolved: false }, real, { topic: "t" })
    expect(c.scores.guestability).toBeGreaterThan(scoreCandidate(p, { resolved: false }, {}, { topic: "t" }).scores.guestability)
    expect(c.scores.unmeasured).not.toContain("guestability")
  })
})

// ─── 6. Wikidata identity guards ────────────────────────────────────────────

describe("6 — a Wikidata match that contradicts the proposal is somebody else", () => {
  it("identityContradiction: nationality and implausible age", () => {
    const now = 2026
    const kw = { country: "الكويت" }
    expect(identityContradiction({ birth_year: 1960, death_year: null, citizenships: ["مصر"] }, kw, now)).toBe("nationality")
    expect(identityContradiction({ birth_year: 1960, death_year: null, citizenships: ["Egypt", "Kuwait"] }, kw, now)).toBeNull()
    expect(identityContradiction({ birth_year: 1905, death_year: null, citizenships: ["الكويت"] }, kw, now)).toBe("age")
    expect(identityContradiction({ birth_year: 1800, death_year: 1870, citizenships: [] }, kw, now)).toBe("age")
    // sight: a plausible living Kuwaiti passes; two unrelated "elsewhere" countries are not told apart.
    expect(identityContradiction({ birth_year: 1960, death_year: null, citizenships: ["دولة الكويت"] }, kw, now)).toBeNull()
    expect(identityContradiction({ birth_year: 1960, death_year: null, citizenships: ["لبنان"] }, { country: "مصر" }, now)).toBeNull()
    expect(identityContradiction({ birth_year: 1931, death_year: null, citizenships: [] }, undefined, now)).toBeNull()
  })

  it("resolvePerson returns resolved:false for the 1905 namesake (network stubbed)", async () => {
    const entity = (born: string) => ({
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
        P27: [{ mainsnak: { datavalue: { value: { id: "Q817" } } } }],
        P569: [{ mainsnak: { datavalue: { value: { time: `+${born}-01-01T00:00:00Z` } } } }],
      },
      sitelinks: {},
      labels: { ar: { value: NAME } },
      descriptions: { ar: { value: "رجل أعمال كويتي" } },
    })
    const stub = (born: string) =>
      vi.fn(async (url: string) => {
        const u = String(url)
        const body = u.includes("wbsearchentities")
          ? { search: [{ id: "Q1" }] }
          : u.includes("props=claims")
            ? { entities: { Q1: entity(born) } }
            : u.includes("props=labels")
              ? { entities: { Q817: { labels: { ar: { value: "الكويت" } } } } }
              : {}
        return { ok: true, json: async () => body } as Response
      })
    const orig = globalThis.fetch
    try {
      globalThis.fetch = stub("1905") as never
      expect((await resolvePerson(NAME, { country: "الكويت", role: "رجل أعمال" })).resolved).toBe(false)
      globalThis.fetch = stub("1962") as never
      const ok = await resolvePerson(NAME, { country: "الكويت", role: "رجل أعمال" })
      expect(ok.resolved).toBe(true) // sight
      expect(ok.birth_year).toBe(1962)
    } finally {
      globalThis.fetch = orig
    }
  })

  it("an UNTRUSTED match lends nothing: no notability, no website/socials in G, no «شخصية بارزة»", () => {
    const stranger: WikiFacts = {
      resolved: true, identity_uncertain: true, sitelink_count: 40, official_website: "https://x.example",
      social: { x: "https://x.com/s" }, birth_year: 1905, summary: "سيرة شخص آخر",
    }
    const p: ProposedName = { name: NAME }
    const u = scoreCandidate(p, stranger, {}, { topic: "t" })
    const none = scoreCandidate(p, { resolved: false }, {}, { topic: "t" })
    expect(u.scores.notability).toBe(none.scores.notability)
    expect(u.scores.guestability).toBe(none.scores.guestability)
    expect(u.reasons).not.toContain("شخصية بارزة موثّقة")
    expect(u.why).toBeNull() // not the stranger's biography
    // sight: the same entry TRUSTED does count (a capped, unchecked person
    // is shortlisted, so the "why they scored" reasons are written)
    const capped: StoryCheck = {
      assessment: { ...verified(), status: "not_checked", not_checked_reason: "cap", evidence: [] },
      sources: [],
      attrs: { deceased: false, not_individual: false, same_person: true, gender: null, nationality: null },
    }
    const t = scoreCandidate(p, { ...stranger, identity_uncertain: false, birth_year: 1960 }, {}, { topic: "t" }, capped)
    expect(t.scores.notability).toBeGreaterThan(none.scores.notability)
    expect(t.reasons).toContain("شخصية بارزة موثّقة")
  })

  it("the card hides a birth year / photo stored from an untrusted match (older rows)", () => {
    expect(wikiFactsTrusted({ flags: ["identity_uncertain"] })).toBe(false)
    expect(wikiFactsTrusted({ flags: ["identity_unverified"] })).toBe(false)
    expect(wikiFactsTrusted({ flags: ["gender_unverified"] })).toBe(true)
  })
})

// ─── 7. Story-check queue ───────────────────────────────────────────────────

describe("7 — the queue ranks topic fit first and keeps 2 of 12 for topical experts", () => {
  const TOPIC = "المال يتذكّر ما نسيته العائلة — مال ومسار"
  // Run 1e88aa03's shape (fictional): founders with confident first-hand
  // "founding stories" that never touch family money, and two economists.
  // The founders' own proposal text even brushes the topic words, so on
  // topic fit alone they outrank the economists in the public half — the
  // reserve is what keeps the experts in.
  const founder = (i: number) => ({
    p: { name: `مؤسس تجريبي ${i}`, role: "مؤسس شركة ناشئة", why: "بنى مال العائلة ونسيته الأجيال", story_claim: "أسّس شركته من غرفة صغيرة", story_type: "first_hand" as const },
    wiki: { resolved: true, qid: `Q${i}`, sitelink_count: 3, identity_uncertain: false } as WikiFacts,
    signals: {},
  })
  const economist = (n: string) => ({
    p: { name: n, role: "خبير اقتصادي", why: "يكتب عن المال", story_type: "expert" as const },
    wiki: { resolved: true, qid: `Q-${n}`, sitelink_count: 2, identity_uncertain: false } as WikiFacts,
    signals: {},
  })
  const witness = (i: number) => ({
    p: { name: `شاهد تجريبي ${i}`, role: "شاهد", story_claim: "عاش الحدث بنفسه", story_type: "first_hand" as const },
    wiki: { resolved: false } as WikiFacts,
    signals: {},
  })
  const econ = ["اقتصادي أول تجريبي", "اقتصادي ثانٍ تجريبي"]
  const pool = [
    ...Array.from({ length: 14 }, (_, i) => founder(i)),
    ...Array.from({ length: 10 }, (_, i) => witness(i)),
    ...econ.map(economist),
  ]

  it("cap 12: both topical economists are checked", () => {
    const picked = selectForStoryCheck(pool, TOPIC, 12).map((x) => x.p.name)
    expect(picked).toHaveLength(12)
    for (const n of econ) expect(picked).toContain(n)
  })

  it("the reserve scales: 2 of 12, 1 of 6, none below 6", () => {
    expect(expertReserve(12)).toBe(2)
    expect(expertReserve(6)).toBe(1)
    expect(expertReserve(5)).toBe(0)
    expect(expertReserve(24)).toBe(2)
  })

  it("an expert with NO topic fit reserves nothing", () => {
    // Both halves full: 14 public founders + 10 lesser-known witnesses whose
    // first-hand claims outrank the expert in his own half.
    const offTopicExpert = { p: { name: "مؤرخ تجريبي", role: "مؤرخ", why: "كتب عن الحروب", story_type: "expert" as const }, wiki: { resolved: false } as WikiFacts, signals: {} }
    const all = [...Array.from({ length: 14 }, (_, i) => founder(i)), ...Array.from({ length: 10 }, (_, i) => witness(i)), offTopicExpert]
    expect(selectForStoryCheck(all, TOPIC, 12).map((x) => x.p.name)).not.toContain("مؤرخ تجريبي")
    // sight: the same pool with a TOPICAL expert keeps him a slot
    const topical = economist("اقتصادي ثالث تجريبي")
    expect(selectForStoryCheck([...all, topical], TOPIC, 12).map((x) => x.p.name)).toContain("اقتصادي ثالث تجريبي")
  })
})

// ─── 9. Honest numbers ──────────────────────────────────────────────────────

describe("9 — a score with no evidence behind it is «غير مقيّم»", () => {
  it("never-checked story → story + searchability + topic_fit unmeasured; older rows infer the story one", () => {
    const c = scoreCandidate({ name: NAME, role: "شاهد" }, { resolved: false }, {}, { topic: "t" })
    expect(c.scores.unmeasured).toEqual(expect.arrayContaining(["story", "searchability", "topic_fit", "guestability"]))
    expect(unmeasuredScores({ scores: {}, story: { status: "not_checked" } }).has("story")).toBe(true)
    expect(unmeasuredScores({ scores: {}, story: { status: "unverified" } }).has("story")).toBe(false)
  })

  it("«الجنسية غير متحقّقة» only once something tried to verify it", () => {
    const p: ProposedName = { name: NAME }
    const unchecked = scoreCandidate(p, { resolved: false }, {}, { topic: "t", filters: { nationality: "kuwaiti" } })
    expect(unchecked.flags).not.toContain("nationality_unverified")
    expect(unchecked.reasons.join(" ")).not.toContain("الجنسية")
    // Checked (the story check read sources) and still unknown → the chip is true, shown.
    const checked = scoreCandidate(p, { resolved: false }, {}, { topic: "t", filters: { nationality: "kuwaiti" } }, {
      assessment: { ...verified("on_topic"), status: "unverified", evidence: [] },
      sources: SOURCES,
      attrs: { deceased: false, not_individual: false, same_person: true, gender: null, nationality: null },
    })
    expect(checked.flags).toContain("nationality_unverified")
  })
})

// ─── A2. Launch defaults ────────────────────────────────────────────────────

describe("A2 — discovery launches default to men from Kuwait", () => {
  it("the shared defaults every launcher preselects", () => {
    expect(DEFAULT_DISCOVERY_GENDER).toBe("male")
    expect([...DEFAULT_DISCOVERY_GEOGRAPHY]).toEqual(["kuwait"])
  })
})
