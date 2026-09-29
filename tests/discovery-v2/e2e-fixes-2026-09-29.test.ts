/**
 * Batch 3 — discovery defects from the live E2E run 1c57b1b9 (2026-09-29).
 * Topic «خرج من السجن فاشترى بدلة لا يملك ثمنها», male + Kuwait.
 *
 * Fixtures are the REAL data from that run and from the two Wikidata
 * entities it resolved (fetched 2026-09-29, free public API):
 *   - Q108052824 ياسر البحري — ar description «كاتب كويتي ومحلل سیاسي…»
 *     (note the PERSIAN yeh «ی» in «سیاسي»), arwiki extract below;
 *   - Q135410401 بدر المطيري — «لاعب كرة قدم كويتي», born 2003, 3 sitelinks.
 * Pure / mocked: no network, no paid AI.
 */

import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ db: null }))
const ai = vi.hoisted(() => ({ calls: [] as Array<{ prompt: Array<{ content: string }>; promptVersion?: string }>, reply: null as unknown }))
vi.mock("@/lib/ai-router", () => ({
  runAiTask: vi.fn(async (req: { prompt: Array<{ content: string }>; promptVersion?: string }) => {
    ai.calls.push(req)
    return { status: "succeeded", parsed: ai.reply }
  }),
}))

import { guestPolicyHits, lexiconPolicyHits } from "@/lib/khat-map/core/policy"
import { classifyStory, STORY_PROMPT_VERSION, verifyStoryClassification } from "@/lib/discovery-v2/story-classify"
import { scoreCandidate, storyScore } from "@/lib/discovery-v2/score"
import { compareCandidates } from "@/lib/discovery-v2/pipeline"
import { nameVariants } from "@/lib/discovery-v2/story-evidence"
import { resolvePerson } from "@/lib/discovery-v2/sources/wikidata"
import { selectXCandidates, topicTerms, xListsForTopic, DEFAULT_X_SEED_LISTS } from "@/lib/discovery-v2/sources/x-lists"
import { scoreEvidenceLabels } from "@/lib/discovery-v2/display"
import type { EnrichmentSignals, StorySource, V2Candidate, WikiFacts, WitnessProfile } from "@/lib/discovery-v2/types"
import type { XListMember } from "@/lib/x/client"

const TOPIC = "خرج من السجن فاشترى بدلة لا يملك ثمنها"
const INPUT = { topic: TOPIC, filters: { gender: "male" as const }, geography: ["kuwait" as const] }

// ─── Real fixtures ───────────────────────────────────────────────────────────

const BAHRI_EXTRACT =
  "ياسر عبد الجليل البحري كاتب كويتي ومحلل سیاسي ومؤلف لعدد من الكتب في أدب السجون والسیاسة. اشتهر بعد إدانته في الولايات المتحدة بتهمة التحرش الجنسي بفتاة أمريكية واغتصابها وقضى 13 سنة في السجن، بينما نفى البحري هذه التهمة واستعرض أدلة على براءته."

const BAHRI_WIKI: WikiFacts = {
  resolved: true,
  qid: "Q108052824",
  label: "Yaser Albahri",
  label_ar: "ياسر البحري",
  description: "كاتب كويتي ومحلل سیاسي ومؤلف لعدد من الكتب في أدب السجون والسیاسة",
  is_human: true,
  occupations: ["كاتب"],
  gender: "male",
  nationality_country: "الكويت",
  birth_year: 1975,
  death_year: null,
  sitelink_count: 1,
  identity_uncertain: false,
  wikipedia_ar_url: "https://ar.wikipedia.org/wiki/%D9%8A%D8%A7%D8%B3%D8%B1_%D8%A7%D9%84%D8%A8%D8%AD%D8%B1%D9%8A",
  summary: BAHRI_EXTRACT,
}

const FOOTBALLER_WIKI: WikiFacts = {
  resolved: true,
  qid: "Q135410401",
  label: "Bader Al-Mutairi",
  label_ar: "بدر المطيري",
  description: "لاعب كرة قدم كويتي",
  is_human: true,
  occupations: ["لاعب كرة قدم"],
  gender: "male",
  nationality_country: "الكويت",
  birth_year: 2003,
  death_year: null,
  sitelink_count: 3,
  identity_uncertain: false,
  wikipedia_ar_url: "https://ar.wikipedia.org/wiki/x",
  summary: "بدر المطيري هو لاعب كرة قدم كويتي يلعب في مركز الوسط المهاجم مع النادي العربي الكويتي ومنتخب الكويت.",
}

/** The «3544 اقتباس» chip: OpenAlex searched by the footballer's English label. */
const BORROWED_SIGNALS: EnrichmentSignals = { scholar: { works: 51, cited_by: 3544 } }

function web(url: string, domain: string, text: string, title = "مقابلة"): StorySource {
  return { kind: "web", title, url, domain, text, verified: true }
}

const BADER_SRC = web(
  "https://alqabas.example/bader",
  "alqabas.example",
  "بدر المطيري مواطن كويتي قضى سنوات في السجن المركزي بالكويت نتيجة تشابه أسماء وخطأ في البصمات، وبعد خروجه روى قصته بنفسه في مقابلة مطوّلة مع الصحيفة",
)
const BADER_Q = "بدر المطيري مواطن كويتي قضى سنوات في السجن المركزي بالكويت"
const BADER_RAW = {
  story_type: "first_hand",
  story_summary: "مواطن كويتي قضى سنوات في السجن المركزي بالكويت نتيجة تشابه أسماء وخطأ في البصمات",
  evidence: [{ source: 1, quote: BADER_Q }],
  topic_relevance: { value: "on_topic", source: 1, quote: BADER_Q },
  self_told: { value: true, source: 1, quote: "وبعد خروجه روى قصته بنفسه في مقابلة مطوّلة مع الصحيفة" },
  gender: { value: "male", source: 1, quote: BADER_Q },
  nationality: { value: "Kuwait", source: 1, quote: BADER_Q },
  same_person: true,
}

const BAHRI_SRC = web(
  "https://aljarida.example/bahri",
  "aljarida.example",
  "الكاتب ياسر البحري يروي في كتابه تجربة السجن الطويلة في أمريكا وكيف خرج ليبدأ حياته من جديد",
)
const BAHRI_Q = "الكاتب ياسر البحري يروي في كتابه تجربة السجن الطويلة"
const BAHRI_RAW = {
  story_type: "first_hand",
  story_summary: "قضى سنوات في سجن أمريكي ثم خرج وبدأ من جديد",
  evidence: [{ source: 1, quote: BAHRI_Q }],
  topic_relevance: { value: "on_topic", source: 1, quote: BAHRI_Q },
  self_told: { value: true, source: 1, quote: BAHRI_Q },
  same_person: true,
}

const bader = () => verifyStoryClassification(BADER_RAW, [BADER_SRC], nameVariants(["بدر المطيري"]), null)
const bahri = (raw: Record<string, unknown> = BAHRI_RAW) =>
  verifyStoryClassification(raw, [BAHRI_SRC], nameVariants(["ياسر البحري"]), null)

// ─── D1 — the guest-side policy gate ─────────────────────────────────────────

describe("D1 guest policy gate", () => {
  it("the Persian-yeh «سیاسي» of the real Wikidata text is still «سياسي»", () => {
    expect(lexiconPolicyHits("محلل سیاسي")).toContain("politics")
  })

  it("البحري's real Wikipedia text hits politics AND a sexual-offence conviction", () => {
    const hits = guestPolicyHits(BAHRI_EXTRACT)
    expect(hits).toContain("politics")
    expect(hits).toContain("scandal")
  })

  it("البحري (trusted Wikidata, verified prison story) is REJECTED, not «مرشّح قويّ»", () => {
    const c = scoreCandidate({ name: "ياسر البحري", role: "كاتب وسجين سابق" }, BAHRI_WIKI, {}, INPUT, bahri())
    expect(c.scores.story).toBeGreaterThanOrEqual(0.8) // sight: the story itself was strong
    expect(c.decision).toBe("rejected")
    expect(c.reasons[0]).toContain("مخالف لدستور خط")
    expect(c.flags).toContain("policy_violation")
  })

  it("prison alone never triggers: بدر المطيري (jailed by a name mix-up) passes the gate", () => {
    expect(guestPolicyHits(`${BADER_RAW.story_summary} ${BADER_Q}`)).toEqual([])
    const c = scoreCandidate({ name: "بدر المطيري", role: "مواطن سُجن بالخطأ" }, { resolved: false }, {}, INPUT, bader())
    expect(c.decision).not.toBe("rejected")
    expect(c.flags ?? []).not.toContain("policy_violation")
  })

  it.each([
    "خرجت من السجن بعد عشر سنوات واشتريت بدلة لا أملك ثمنها",
    "قضى سنوات في السجن ثم الإفراج عنه وبدأ مشروعه",
    "سُجن ظلماً بتهمة الاحتيال ثم ظهرت براءته",
    "أفرج عنه بعد أن قضى محكوميته",
  ])("a prison-topic witness with no scandal passes: %s", (text) => {
    expect(guestPolicyHits(text)).toEqual([])
  })

  it.each([
    ["أدين بتهمة التحرش بزميلته", "scandal"],
    ["مدان بتهمة الاغتصاب", "scandal"],
    ["ناشط حقوقي معروف", "politics"],
    ["ناشط سياسي ومعارض", "politics"],
    ["فضيحة مالية باسمه", "scandal"],
  ])("guest-side terms hit: %s → %s", (text, cat) => {
    expect(guestPolicyHits(text)).toContain(cat)
  })

  it("topic-side lexicon is unchanged: a conviction phrase does not reject a TOPIC", () => {
    expect(lexiconPolicyHits("أدين بتهمة الاحتيال ثم عاد للمجتمع")).toEqual([])
  })

  it("the classifier's sensitivity_flags reject on their own; unknown flags are ignored", () => {
    const flagged = bahri({ ...BAHRI_RAW, sensitivity_flags: ["ongoing_case", "grief"] })
    expect(flagged.attrs.sensitivity_flags).toEqual(["ongoing_case"])
    const c = scoreCandidate({ name: "ياسر البحري" }, { resolved: false }, {}, INPUT, flagged)
    expect(c.decision).toBe("rejected")
    expect(c.reasons[0]).toContain("مخالف لدستور خط")
    // flags about a namesake's sources say nothing about OUR person
    const namesake = bahri({ ...BAHRI_RAW, sensitivity_flags: ["scandal"], same_person: false })
    expect(namesake.attrs.sensitivity_flags).toEqual([])
  })
})

// ─── D2 — namesake identity borrowed ─────────────────────────────────────────

describe("D2 namesake identity", () => {
  it("resolver: the footballer is NOT a confident match for «مواطن كويتي سُجن» (nationality words are not a role match)", async () => {
    const entity = {
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
        P569: [{ mainsnak: { datavalue: { value: { time: "+2003-09-26T00:00:00Z" } } } }],
      },
      sitelinks: { arwiki: { title: "بدر المطيري" }, enwiki: { title: "Bader Al-Mutairi" }, ukwiki: { title: "x" } },
      labels: { ar: { value: "بدر المطيري" }, en: { value: "Bader Al-Mutairi" } },
      descriptions: { ar: { value: "لاعب كرة قدم كويتي" }, en: { value: "Kuwaiti footballer" } },
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = url.includes("wbsearchentities")
          ? { search: [{ id: "Q135410401" }] }
          : url.includes("props=claims")
            ? { entities: { Q135410401: entity } }
            : { entities: {} }
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    try {
      const w = await resolvePerson("بدر المطيري", { role: "مواطن كويتي سُجن بالخطأ", country: "الكويت" })
      expect(w.resolved).toBe(true)
      expect(w.identity_uncertain).toBe(true)
      // sight: a real footballer hint still matches confidently
      const ok = await resolvePerson("بدر المطيري", { role: "لاعب كرة قدم", country: "الكويت" })
      expect(ok.identity_uncertain).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("scorer: a trusted entity whose occupation the verified story never mentions is DROPPED", () => {
    const c = scoreCandidate({ name: "بدر المطيري", role: "مواطن سُجن بالخطأ" }, FOOTBALLER_WIKI, BORROWED_SIGNALS, INPUT, bader())
    expect(c.wiki.resolved).toBe(false)
    expect(c.wiki.qid ?? null).toBeNull()
    expect(c.wiki.identity_dropped?.qid).toBe("Q135410401")
    expect(c.flags).toContain("identity_unverified")
    expect(c.decision).toBe("needs_review") // «قصة قوية — راجِع الهوية»
    expect(c.reasons.join(" ")).toContain("راجِع الهوية")
    // none of the stranger's notability reaches the card or the score
    expect(c.signals.scholar ?? null).toBeNull()
    const plain = scoreCandidate({ name: "بدر المطيري", role: "مواطن سُجن بالخطأ" }, { resolved: false }, {}, INPUT, bader())
    expect(c.scores.notability).toBe(plain.scores.notability)
    expect(c.role).toBe("مواطن سُجن بالخطأ")
  })

  it("sight: an entity whose occupation the evidence DOES mention is kept", () => {
    const c = scoreCandidate({ name: "ياسر البحري" }, BAHRI_WIKI, {}, { topic: "أدب السجون" }, bahri())
    expect(c.wiki.resolved).toBe(true)
    expect(c.wiki.qid).toBe("Q108052824")
  })

  it("the classifier's wikidata_match=false drops the QID too (it can only remove trust)", () => {
    const raw = { ...BAHRI_RAW, wikidata_match: false }
    const c = scoreCandidate({ name: "ياسر البحري" }, BAHRI_WIKI, {}, { topic: "أدب السجون" }, bahri(raw))
    expect(c.wiki.resolved).toBe(false)
    expect(c.flags).toContain("identity_unverified")
  })

  it("the classifier now SEES the entity (description, occupation, birth year)", async () => {
    ai.calls.length = 0
    ai.reply = BADER_RAW
    await classifyStory({
      name: "بدر المطيري",
      role: "مواطن سُجن بالخطأ",
      claim: null,
      topic: TOPIC,
      sources: [BADER_SRC],
      variants: nameVariants(["بدر المطيري"]),
      entity: FOOTBALLER_WIKI,
    })
    const text = ai.calls[0].prompt.map((m) => m.content).join("\n")
    expect(text).toContain("لاعب كرة قدم")
    expect(text).toContain("2003")
    expect(text).toContain("wikidata_match")
    expect(text).toContain("sensitivity_flags")
    expect(ai.calls[0].promptVersion).toBe(STORY_PROMPT_VERSION)
    expect(STORY_PROMPT_VERSION).toBe("v2-story-4")
  })
})

// ─── D3 — X source topic-awareness ──────────────────────────────────────────

function member(over: Partial<XListMember & { via: string }> = {}): XListMember & { via: string } {
  return {
    id: "1",
    username: "u1",
    name: "فهد ناصر",
    description: "",
    verified: false,
    followers: 1000,
    following: 100,
    tweet_count: 10,
    created_at: null,
    location: "الكويت",
    listed_count: 20,
    via: "بورصة الكويت",
    ...over,
  }
}

const PRISON_PROFILES: WitnessProfile[] = [
  { profile: "رجل كويتي خرج من السجن وبدأ من جديد", where_told: ["مقابلة صحفية"], search_terms: ["السجن", "الإفراج", "الكويت"] },
]

describe("D3 X lists", () => {
  it("a prison topic reads NO seed list (0 calls) — «بورصة الكويت» is not relevant", () => {
    const picked = xListsForTopic(DEFAULT_X_SEED_LISTS, topicTerms(TOPIC, PRISON_PROFILES))
    expect(picked).toEqual([])
  })

  it("sight: an education topic picks the education lists, never the stock exchange", () => {
    const picked = xListsForTopic(DEFAULT_X_SEED_LISTS, topicTerms("تربية الأبناء في زمن الشاشات"))
    expect(picked.length).toBeGreaterThan(0)
    expect(picked.map((l) => l.label)).not.toContain("بورصة الكويت")
    expect(picked.map((l) => l.label)).toContain("Education")
  })

  it("topicTerms drops geo / nationality words", () => {
    const t = topicTerms(TOPIC, PRISON_PROFILES)
    for (const geo of ["كويت", "الكويت", "كويتي"]) expect(t).not.toContain(geo)
    expect(t).toContain("سجن")
  })

  it("«حب الكويت يجمعنا» no longer matches a prison topic through «الكويت»", () => {
    const m = member({ id: "love", name: "سالم العتيبي", description: "حب الكويت يجمعنا — مهتم بالأسهم والتداول اليومي" })
    expect(selectXCandidates([m], topicTerms(TOPIC, PRISON_PROFILES), ["kuwait"], () => false)).toEqual([])
  })

  it("«Al-Waseet Financial Business Co.» is an organisation", () => {
    const m = member({
      id: "waseet",
      name: "Al-Waseet Financial Business Co.",
      description: "شركة الوسيط للأعمال المالية — وساطة في بورصة الكويت. هاتف 22345678 واتساب 99887766",
    })
    // even on a topic its bio matches, it is not a person
    expect(selectXCandidates([m], topicTerms("الوساطة المالية في بورصة الكويت"), ["kuwait"], () => false)).toEqual([])
  })

  it("the harvest skips X entirely when no list is relevant (0 calls, says why)", async () => {
    vi.resetModules()
    const getListMembers = vi.fn(async () => ({ members: [], status: 200 }))
    vi.doMock("@/lib/x/client", () => ({ isXConfigured: () => true, getListMembers }))
    const { harvestXListNames } = await import("@/lib/discovery-v2/sources/x-lists")
    const r = await harvestXListNames({ topic: TOPIC, profiles: PRISON_PROFILES, geography: ["kuwait"], exclude: () => false })
    expect(getListMembers).not.toHaveBeenCalled()
    expect(r).toMatchObject({ names: [], calls: 0, skipped: "no_relevant_list" })
    vi.doUnmock("@/lib/x/client")
    vi.resetModules()
  })
})

// ─── D4 — scores that don't discriminate ────────────────────────────────────

describe("D4 story scores are ordinal buckets — shown as evidence, ranked with a real tiebreak", () => {
  // Three strong cards on the live run all read القصة 80 / الملاءمة 100 / يُبحث عنه 50.
  const one = web("https://a.example/1", "a.example", "خالد العنزي خرج من السجن بعد سنوات واشترى بدلة لا يملك ثمنها وروى ذلك")
  const two = web("https://a.example/2", "a.example", "خالد العنزي يروي كيف عاد إلى أهله بعد خروجه من السجن وبدأ عملاً جديداً")
  const Q1 = "خالد العنزي خرج من السجن بعد سنوات"
  const Q2 = "خالد العنزي يروي كيف عاد إلى أهله"
  const base = {
    story_type: "first_hand",
    topic_relevance: { value: "on_topic", source: 1, quote: Q1 },
    self_told: { value: true, source: 1, quote: Q1 },
    same_person: true,
  }
  const v = nameVariants(["خالد العنزي"])
  const thin = verifyStoryClassification({ ...base, evidence: [{ source: 1, quote: Q1 }] }, [one, two], v, null)
  const deep = verifyStoryClassification(
    { ...base, evidence: [{ source: 1, quote: Q1 }, { source: 2, quote: Q2 }] },
    [one, two],
    v,
    null,
  )

  it("the numbers are the design's buckets (same domain → both 0.8) — root cause, pinned", () => {
    expect(storyScore(thin.assessment)).toBe(0.8)
    expect(storyScore(deep.assessment)).toBe(0.8)
  })

  it("the card shows the evidence behind each bucket, so different evidence reads differently", () => {
    const a = scoreEvidenceLabels({ story: thin.assessment, scores: { searchability: 0.5 } })
    const b = scoreEvidenceLabels({ story: deep.assessment, scores: { searchability: 0.5 } })
    expect(a.story).not.toBe(b.story)
    expect(b.story).toContain("اقتباسان")
    expect(a.topic_fit).toBe("في صلب الموضوع")
    expect(a.searchability).toBe("موقع واحد")
  })

  it("ranking tiebreak: same tier and same S → more independent evidence first, even with lower fame", () => {
    const mk = (a: typeof thin, overall: number): V2Candidate => {
      const c = scoreCandidate({ name: "خالد العنزي" }, { resolved: false }, {}, INPUT, a)
      return { ...c, scores: { ...c.scores, overall } }
    }
    const famousThin = mk(thin, 0.62)
    const deeper = mk(deep, 0.58)
    expect([famousThin, deeper].sort(compareCandidates)[0]).toBe(deeper)
  })
})

// ─── QA round (noura, 2026-09-29) ───────────────────────────────────────────

import { judgeGuestPolicy, FINANCIAL_RECORD_POLICY } from "@/lib/khat-map/core/policy"
import { entityOccupationTokens, identityDropReason } from "@/lib/discovery-v2/identity"

describe("QA D1 — guest gate precision", () => {
  it.each([
    // 1) exoneration judged per sentence, not per «،» clause
    "اتُّهم بالتزوير، ثم ثبتت براءته بعد سنوات",
    // 2) «برأته» is exoneration
    "أُدين بالاحتيال ثم برأته محكمة التمييز",
    // 3) accusing someone else is not being accused
    "اتهم شريكه بالاختلاس",
    // 4) broad political words
    "واجه المعارضة من أهله",
    "محامٍ ومستشار حقوقي في قضايا الأسرة",
    "باحث حقوقي",
    // 5) «سياسي» inside a title, or political-science teaching
    "مؤلف كتاب «السجين السياسي» عن تجربته",
    "مدرس علوم سياسية",
    // sexual-offence variants: only the acquittal can clear these (a fraud
    // case would pass as a review anyway, so it cannot prove the acquittal)
    "أدين بالتحرش ثم برأته المحكمة",
    "اتُّهم بالتحرش، ثم ثبتت براءته",
  ])("passes (no reject): %s", (text) => {
    expect(judgeGuestPolicy(text).ok).toBe(true)
  })

  it.each([
    "اتُّهم بالتزوير، ثم ثبتت براءته بعد سنوات",
    "أُدين بالاحتيال ثم برأته محكمة التمييز",
  ])("an acquitted fraud/forgery charge is not even a review: %s", (text) => {
    expect(judgeGuestPolicy(text).review).toBeNull()
  })

  it.each([
    "ناشط حقوقي",
    "ناشط سياسي",
    "محلل سياسي",
    "رموز المعارضة السياسية",
    // 6) bare «خطأ» is not exoneration
    "أدين بالتحرش بسبب خطأ في المحكمة كما يقول",
  ])("still rejects: %s", (text) => {
    expect(judgeGuestPolicy(text).ok).toBe(false)
  })

  it("«سُجن بالخطأ» / «تشابه أسماء» still clear a charge (tied to arrest/identity)", () => {
    expect(judgeGuestPolicy("سُجن بالخطأ بتهمة الاحتيال لتشابه أسماء").review).toBeNull()
    expect(judgeGuestPolicy("سُجن بالخطأ بتهمة الاحتيال لتشابه أسماء").ok).toBe(true)
  })

  it("البحري stays rejected: «أدلة على براءته» is his claim, not an acquittal", () => {
    const j = judgeGuestPolicy(BAHRI_EXTRACT)
    expect(j.ok).toBe(false)
    expect(j.lexicon).toContain("scandal")
  })

  it("7) a SERVED financial conviction → review «سابقة مالية — قرار خالد», not reject (one flippable constant)", () => {
    expect(FINANCIAL_RECORD_POLICY).toBe("review")
    // (was a hard reject in the first cut — now the flippable review default)
    expect(judgeGuestPolicy("أدين بتهمة الاحتيال على المستثمرين").review).toBe("سابقة مالية — قرار خالد")
    const j = judgeGuestPolicy("أدين بالاختلاس وقضى محكوميته ثم بدأ من جديد")
    expect(j.ok).toBe(true)
    expect(j.review).toBe("سابقة مالية — قرار خالد")
    // sexual offences stay a hard reject
    expect(judgeGuestPolicy("أدين بالتحرش وقضى محكوميته").ok).toBe(false)

    const src = web("https://x.example/f", "x.example", "خالد العنزي أدين بالاختلاس وقضى محكوميته ثم خرج من السجن وبدأ من جديد")
    const q = "خالد العنزي أدين بالاختلاس وقضى محكوميته ثم خرج"
    const check = verifyStoryClassification(
      {
        story_type: "first_hand",
        evidence: [{ source: 1, quote: q }],
        topic_relevance: { value: "on_topic", source: 1, quote: q },
        self_told: { value: true, source: 1, quote: q },
        same_person: true,
      },
      [src],
      nameVariants(["خالد العنزي"]),
      null,
    )
    const c = scoreCandidate({ name: "خالد العنزي" }, { resolved: false }, {}, INPUT, check)
    expect(c.decision).toBe("needs_review")
    expect(c.flags).toContain("policy_review")
    expect(c.reasons).toContain("سابقة مالية — قرار خالد")
  })
})

describe("QA D2 — identity guard precision", () => {
  it("unlabelled QIDs («Q12345», the labelsFor fallback) are not occupation words", () => {
    expect(entityOccupationTokens({ resolved: true, occupations: ["Q937857"], description: null })).toEqual([])
  })

  it("only a window around the name counts — not a whole page that mentions him once", () => {
    const filler = " كلام عام عن الرياضة والملاعب والمباريات".repeat(30)
    const page = web(
      "https://x.example/page",
      "x.example",
      `بدر المطيري مواطن كويتي قضى سنوات في السجن المركزي بالكويت نتيجة تشابه أسماء${filler} وفي خبر آخر لاعب الوسط سجّل هدفاً`,
    )
    const check = verifyStoryClassification(BADER_RAW, [page], nameVariants(["بدر المطيري"]), null)
    expect(identityDropReason(FOOTBALLER_WIKI, check, { name: "بدر المطيري" })).toBe("occupation_absent")
  })
})

describe("QA D3 — X precision", () => {
  const terms = topicTerms("تربية الأبناء في زمن الشاشات")
  it.each(["معلم كويتي 1985 - 2015، أكتب عن تربية الأبناء والمراهقة", "معلم، خريج 2008 2012، أكتب عن تربية الأبناء في الكويت"])(
    "year ranges are not phone numbers: %s",
    (description) => {
      expect(selectXCandidates([member({ description })], terms, ["kuwait"], () => false)).toHaveLength(1)
    },
  )
  it.each(["معلم كويتي يكتب عن تربية الأبناء، للتواصل 99887766", "معلم كويتي عن تربية الأبناء +965 9988 7766"])(
    "a real phone number is still an org signal: %s",
    (description) => {
      expect(selectXCandidates([member({ description })], terms, ["kuwait"], () => false)).toEqual([])
    },
  )
  it("keywords match whole words / stems, never a longer different word", () => {
    const heritage = DEFAULT_X_SEED_LISTS.filter((l) => l.label === "interesting kuwaitis")
    expect(xListsForTopic(heritage, ["حرفيا"])).toEqual([])
    const research = DEFAULT_X_SEED_LISTS.filter((l) => l.label === "Kwt Researchers")
    expect(xListsForTopic(research, ["علمتني"])).toEqual([])
    expect(xListsForTopic(research, ["علمي"])).toHaveLength(1) // sight
    for (const l of DEFAULT_X_SEED_LISTS) for (const k of l.keywords) expect(k.length).toBeGreaterThanOrEqual(3)
  })
})
