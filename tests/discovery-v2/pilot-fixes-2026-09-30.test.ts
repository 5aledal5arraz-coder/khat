/**
 * Discovery-v2 defects from the live pilot (2026-09-29, male + Kuwait).
 *
 *   P1 historical / deceased people with no Wikidata entry reached
 *      «تحتاج مراجعتك» (علي ناصر النجدي — the nakhuda of Villiers' 1939
 *      voyage; عيسى عبدالوهاب القطامي — an early-20th-century author);
 *   P2 the model's third_party_exposure flag alone hard-rejected a harmless
 *      anecdote (فهد الأنصاري — an official stopped him swapping his shirt);
 *   P3 the same person proposed in two runs of one season with nothing on
 *      the second card saying so (سعد الحوطي).
 *
 * Pure / mocked: no network, no DB, no paid AI.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProposedName, StorySource, WikiFacts } from "@/lib/discovery-v2/types"

vi.mock("@/lib/db", () => ({ db: null }))

const h = vi.hoisted(() => ({
  calls: [] as Array<{ taskKind: string; system: string; promptVersion?: string }>,
  people: [] as unknown[],
  classify: null as unknown,
  searched: [] as string[],
  otherRuns: new Map<string, { runId: string; topic: string | null }>(),
}))

vi.mock("@/lib/ai-router", () => ({
  runAiTask: vi.fn(async (req: { taskKind: string; promptVersion?: string; prompt: Array<{ content: string }> }) => {
    h.calls.push({ taskKind: req.taskKind, system: req.prompt[0]?.content ?? "", promptVersion: req.promptVersion })
    if (req.taskKind === "structural") return { status: "succeeded", runId: "w", parsed: { profiles: [] } }
    if (req.taskKind === "discovery") return { status: "succeeded", runId: "p", parsed: { people: h.people } }
    return { status: "succeeded", runId: "c", parsed: h.classify ?? { story_type: "none", evidence: [] } }
  }),
}))
vi.mock("@/lib/discovery-v2/sources/x-lists", () => ({
  harvestXListNames: vi.fn(async () => ({ names: [], calls: 0, users_read: 0, degraded: null, skipped: null, est_cost_usd: null })),
}))
vi.mock("@/lib/discovery-v2/harvest", () => ({
  harvestGroundedNames: vi.fn(async () => ({ names: [], queries: 0, searchCostUsd: 0, errors: [], failed: 0, failureKinds: [] })),
}))
vi.mock("@/lib/discovery-v2/sources/wikidata", () => ({
  resolvePerson: vi.fn(async (): Promise<WikiFacts> => ({ resolved: false })),
}))
vi.mock("@/lib/discovery-v2/enrich", () => ({ enrich: vi.fn(async () => ({})) }))
vi.mock("@/lib/discovery-v2/source-page", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/discovery-v2/source-page")>()),
  attachSourcePages: vi.fn(async (s: StorySource[]) => s),
}))
vi.mock("@/lib/discovery-v2/story-evidence", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/discovery-v2/story-evidence")>()),
  isStoryGroundingEnabled: () => true,
  gatherStoryWebSources: vi.fn(async (p: ProposedName) => {
    h.searched.push(p.name)
    return { sources: [], model: "gemini-test" }
  }),
}))
vi.mock("@/lib/discovery-v2/memory", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/discovery-v2/memory")>()
  return {
    ...actual,
    loadDiscoveryMemory: vi.fn(async () => ({
      excludeNames: [],
      excludeQids: new Set<string>(),
      excludeNameKeys: new Set<string>(),
      recentlySurfacedNames: [],
      otherRuns: h.otherRuns,
    })),
  }
})

import { proposeNames, PROPOSE_PROMPT_VERSION } from "@/lib/discovery-v2/propose"
import { classifyStory, STORY_PROMPT_VERSION, verifyStoryClassification } from "@/lib/discovery-v2/story-classify"
import { HISTORICAL_FIGURE_REASON, OLD_ERA_STORY_REASON, historicalFigureCue, scoreCandidate } from "@/lib/discovery-v2/score"
import { nameVariants } from "@/lib/discovery-v2/story-evidence"
import { runV2Discovery } from "@/lib/discovery-v2/pipeline"
import { discoveryNameKey, otherRunIndex } from "@/lib/discovery-v2/memory"
import { guestPolicyHits } from "@/lib/khat-map/core/policy"
import { STORY_REVIEW_FLAGS } from "@/lib/discovery-v2/types"

const INPUT = { topic: "كويتي عاش مهنة قديمة: الغوص/البحر/العود", filters: { gender: "male" as const }, geography: ["kuwait" as const] }

beforeEach(() => {
  h.calls = []
  h.people = []
  h.classify = null
  h.searched = []
  h.otherRuns = new Map()
})

function web(url: string, text: string, title = "مقال"): StorySource {
  const domain = new URL(url).hostname
  return { kind: "web", title, url, domain, text, verified: true, page: { title, author: null, text, via: "html" } }
}

// ─── P1 — historical / deceased without Wikidata ─────────────────────────────

// The pilot's two proposals, as the model returned them (role + a claim).
const NAJDI: ProposedName = {
  name: "علي ناصر النجدي",
  role: "نوخذة سفن شراعية",
  country: "الكويت",
  gender: "male",
  story_type: "first_hand",
  story_claim: "قاد بوم «بيان» في رحلة 1939 إلى زنجبار التي وثّقها آلان فيليرز",
}
const QATAMI: ProposedName = {
  name: "عيسى عبدالوهاب القطامي",
  role: "نوخذة ومؤلف بحري",
  country: "الكويت",
  gender: "male",
  story_type: "first_hand",
  story_claim: "ألّف «دليل المحتار في علم البحار» عام 1915 عن خبرته نوخذةً",
}
/** What the pilot showed: the check ran and found no public account → «قصة غير منشورة». */
const UNVERIFIED = (claim: string | null | undefined) =>
  verifyStoryClassification({ story_type: "none", evidence: [] }, [], [], claim ?? null)

/** A verified first-hand story whose quote carries `year`, told by `name` (born `born`). */
function elder(name: string, born: number, year: number) {
  const text = `روى ${name} أنه غاص على اللؤلؤ أول مرة سنة ${year} مع نوخذة من الفريج`
  const p: ProposedName = {
    name,
    role: "غواص سابق",
    gender: "male",
    story_type: "first_hand",
    story_claim: `غاص على اللؤلؤ سنة ${year}`,
    birth_year: born,
    is_alive: true,
  }
  const check = verifyStoryClassification(
    {
      story_type: "first_hand",
      evidence: [{ source: 1, quote: `${name} أنه غاص على اللؤلؤ أول مرة سنة ${year}` }],
      topic_relevance: { value: "on_topic", source: 1, quote: `${name} أنه غاص على اللؤلؤ أول مرة سنة ${year}` },
      same_person: true,
    },
    [web(`https://alqabas.example/${born}`, text)],
    nameVariants([name]),
    p.story_claim ?? null,
  )
  return { p, check }
}

describe("P1 historical / deceased people outside Wikidata", () => {
  // Every historical cue is REVIEW-ONLY (noura QA, 2026-09-30). The pilot as
  // it happened: no public account found, only the model's own claim dates
  // them (1939 / 1915) → review with the flag + reason on top, never «مرشّح».
  it.each([NAJDI, QATAMI])("%s (pilot) → needs_review flagged likely_historical, not rejected", (p) => {
    const c = scoreCandidate(p, { resolved: false }, {}, INPUT, UNVERIFIED(p.story_claim))
    expect(historicalFigureCue(p)).toBe(HISTORICAL_FIGURE_REASON)
    expect(c.decision).toBe("needs_review")
    expect(c.reasons[0]).toBe(HISTORICAL_FIGURE_REASON)
    expect(c.flags).toContain("likely_historical")
  })

  it("النجدي even with a verified quote carrying the claim's 1939 → review, not reject", () => {
    const src = web("https://alqabas.example/bayan", "قاد النوخذة علي ناصر النجدي البوم بيان في رحلة 1939 إلى زنجبار ووثّقها فيليرز")
    const check = verifyStoryClassification(
      {
        story_type: "first_hand",
        evidence: [{ source: 1, quote: "قاد النوخذة علي ناصر النجدي البوم بيان في رحلة 1939" }],
        same_person: true,
      },
      [src],
      nameVariants([NAJDI.name]),
      NAJDI.story_claim ?? null,
    )
    expect(check.assessment.status).toBe("verified") // sight: the quote survived the guard
    const c = scoreCandidate(NAJDI, { resolved: false }, {}, INPUT, check)
    expect(c.decision).toBe("needs_review")
    expect(c.reasons[0]).toBe(HISTORICAL_FIGURE_REASON)
    expect(c.flags).toContain("likely_historical")
  })

  it.each([
    [1942, 1955],
    [1950, 1958],
  ])("a living elder born %i with a verified %i first-hand quote → review, not reject — the SOFT label", (born, year) => {
    const { p, check } = elder(`غواص كبير ${born}`, born, year)
    expect(check.assessment.status).toBe("verified") // sight: the story itself is real
    const c = scoreCandidate(p, { resolved: false }, {}, INPUT, check)
    expect(c.decision).not.toBe("rejected")
    expect(c.decision).toBe("needs_review")
    // 2026-10-02: the model says he is alive and born ≥ 1940 — the only cue is
    // the story's year, so the card must not call him «متوفّى».
    expect(c.flags).toContain("old_era_story")
    expect(c.flags).not.toContain("likely_historical")
    expect(c.reasons[0]).toBe(OLD_ERA_STORY_REASON)
  })

  it("the hard rejects stay the verified death quote and the confident Wikidata death", () => {
    const src = web("https://alqabas.example/rip", "توفي النوخذة علي ناصر النجدي رحمه الله بعد حياة طويلة في البحر")
    const dead = verifyStoryClassification(
      { story_type: "none", evidence: [], deceased: { source: 1, quote: "توفي النوخذة علي ناصر النجدي رحمه الله بعد" } },
      [src],
      nameVariants([NAJDI.name]),
      null,
    )
    expect(scoreCandidate(NAJDI, { resolved: false }, {}, INPUT, dead).decision).toBe("rejected")
    const wiki: WikiFacts = { resolved: true, identity_uncertain: false, qid: "Q1", label_ar: NAJDI.name, death_year: 1970, nationality_country: "الكويت", gender: "male" }
    expect(scoreCandidate(NAJDI, wiki, {}, INPUT, UNVERIFIED(null)).decision).toBe("rejected")
  })

  it("the model's own birth year < 1940 or is_alive=false alone → needs_review, not rejected", () => {
    const base: ProposedName = { name: "غواص تجريبي", role: "غواص سابق", story_type: "first_hand", story_claim: "غاص على اللؤلؤ" }
    expect(historicalFigureCue({ ...base, birth_year: 1932 })).toBe(HISTORICAL_FIGURE_REASON)
    expect(historicalFigureCue({ ...base, is_alive: false })).toBe(HISTORICAL_FIGURE_REASON)
    for (const p of [{ ...base, birth_year: 1932 }, { ...base, is_alive: false }]) {
      const c = scoreCandidate(p, { resolved: false }, {}, INPUT, UNVERIFIED(base.story_claim))
      expect(c.decision).toBe("needs_review")
      expect(c.flags).toContain("likely_historical")
      expect(c.reasons[0]).toBe(HISTORICAL_FIGURE_REASON)
    }
  })

  it("sight: a living witness (born 1948, alive, a 1970s claim) is NOT touched", () => {
    const p: ProposedName = {
      name: "غواص حيّ تجريبي",
      role: "غواص سابق",
      story_type: "first_hand",
      story_claim: "آخر رحلة غوص شارك فيها عام 1972",
      birth_year: 1948,
      is_alive: true,
    }
    expect(historicalFigureCue(p)).toBeNull()
    const c = scoreCandidate(p, { resolved: false }, {}, INPUT, UNVERIFIED(p.story_claim))
    expect(c.decision).toBe("needs_review")
    expect(c.flags).not.toContain("likely_historical")
  })

  it("sight: a second-hand story about a father's 1950 voyage does NOT make the teller historical", () => {
    const p: ProposedName = {
      name: "ابن نوخذة تجريبي",
      story_type: "second_hand",
      story_claim: "يروي رحلة أبيه النوخذة إلى الهند عام 1950",
    }
    expect(historicalFigureCue(p)).toBeNull()
  })

  it("the classifier's era: his birth year, in the verified quote, about HIM — review only", () => {
    const src = web("https://alqabas.example/najdi", "النوخذة علي ناصر النجدي ولد عام 1901 وقاد البوم بيان في رحلة شهيرة")
    const v = nameVariants(["علي ناصر النجدي"])
    const ok = verifyStoryClassification(
      { story_type: "none", evidence: [], era: { birth_year: 1901, source: 1, quote: "النوخذة علي ناصر النجدي ولد عام 1901" } },
      [src],
      v,
      null,
    )
    expect(ok.attrs.historical).toBe(true)
    // year not in the quote → a claim, ignored
    const bad = verifyStoryClassification(
      { story_type: "none", evidence: [], era: { birth_year: 1890, source: 1, quote: "النوخذة علي ناصر النجدي ولد عام 1901" } },
      [src],
      v,
      null,
    )
    expect(bad.attrs.historical).toBe(false)
    // a verified era is still only a review hint
    const c = scoreCandidate(
      { name: "علي ناصر النجدي", story_type: "first_hand", story_claim: "قاد البوم بيان" },
      { resolved: false },
      {},
      INPUT,
      ok,
    )
    expect(c.decision).not.toBe("rejected")
    expect(c.flags).toContain("likely_historical")
    // Arabic-Indic digits are the same year
    const ar = web("https://alqabas.example/najdi2", "النوخذة علي ناصر النجدي من مواليد ١٩٠١ في حي شرق")
    const arOk = verifyStoryClassification(
      { story_type: "none", evidence: [], era: { birth_year: 1901, source: 1, quote: "النوخذة علي ناصر النجدي من مواليد ١٩٠١" } },
      [ar],
      v,
      null,
    )
    expect(arOk.attrs.historical).toBe(true)
  })

  it("active_until is no longer a signal: «no later mentions» is not inactivity", () => {
    const src = web("https://alqabas.example/v", "النوخذة علي ناصر النجدي قاد رحلة سنة 1939 إلى زنجبار")
    const r = verifyStoryClassification(
      { story_type: "none", evidence: [], era: { active_until: 1939, source: 1, quote: "النوخذة علي ناصر النجدي قاد رحلة سنة 1939" } },
      [src],
      nameVariants(["علي ناصر النجدي"]),
      null,
    )
    expect(r.attrs.historical).toBe(false)
  })

  it("a father's 1939 birth year quoted on the son's page → no historical flag for the son", () => {
    const son = "خالد يوسف الغانم"
    const v = nameVariants([son])
    const pageText = `قال ${son} إن والده ولد عام 1939 وعمل غواصاً على اللؤلؤ`
    const src = web("https://alqabas.example/son", pageText)
    const r = verifyStoryClassification(
      { story_type: "second_hand", evidence: [], era: { birth_year: 1939, source: 1, quote: `${son} إن والده ولد عام 1939` } },
      [src],
      v,
      null,
    )
    expect(r.attrs.historical).toBe(false)
    // «ابن فلان وُلد…» names a relative, not him
    const src2 = web("https://alqabas.example/son2", `ابن ${son} ولد عام 1939 في الفريج القديم`)
    const r2 = verifyStoryClassification(
      { story_type: "none", evidence: [], era: { birth_year: 1939, source: 1, quote: `ابن ${son} ولد عام 1939 في الفريج` } },
      [src2],
      v,
      null,
    )
    expect(r2.attrs.historical).toBe(false)
    // sight: the same sentence about HIM does count
    const src3 = web("https://alqabas.example/son3", `${son} ولد عام 1939 وعمل غواصاً على اللؤلؤ`)
    const r3 = verifyStoryClassification(
      { story_type: "none", evidence: [], era: { birth_year: 1939, source: 1, quote: `${son} ولد عام 1939 وعمل غواصاً` } },
      [src3],
      v,
      null,
    )
    expect(r3.attrs.historical).toBe(true)
  })

  it("propose asks for living people with birth_year + is_alive and parses them (v2-propose-8)", async () => {
    h.people = [
      { name: "علي ناصر النجدي", gender: "male", birth_year: "1901", is_alive: false },
      { name: "غواص حيّ تجريبي", gender: "male", birth_year: 1948, is_alive: true },
      { name: "مجهول تجريبي", gender: "male", birth_year: "غير معروف", is_alive: "unknown" },
    ]
    const r = await proposeNames({ topic: INPUT.topic, filters: INPUT.filters }, 3)
    expect(PROPOSE_PROMPT_VERSION).toBe("v2-propose-8")
    const call = h.calls.find((c) => c.taskKind === "discovery")!
    expect(call.promptVersion).toBe("v2-propose-8")
    expect(call.system).toContain("أحياء")
    expect(call.system).toContain("birth_year")
    expect(call.system).toContain("is_alive")
    expect(r.names.map((n) => [n.birth_year, n.is_alive])).toEqual([
      [1901, false],
      [1948, true],
      [null, null],
    ])
  })

  it("the classifier prompt defines deceased/historical and asks for era (v2-story-6)", async () => {
    await classifyStory({ name: "علي ناصر النجدي", claim: null, topic: INPUT.topic, sources: [web("https://a.example/x", "علي ناصر النجدي نوخذة")], variants: nameVariants(["علي ناصر النجدي"]) })
    expect(STORY_PROMPT_VERSION).toBe("v2-story-6")
    const sys = h.calls.find((c) => c.taskKind === "verification")!.system
    expect(sys).toContain("رحمه الله")
    expect(sys).toContain('"era"')
    expect(sys).not.toContain("active_until")
  })

  it("pipeline: a historical cue never skips the story check; it ends in review", async () => {
    h.people = [
      { ...NAJDI },
      { name: "غواص حيّ تجريبي", role: "غواص سابق", gender: "male", story_type: "first_hand", story_claim: "غاص عام 1975", birth_year: 1955, is_alive: true },
    ]
    const r = await runV2Discovery({ ...INPUT, runId: "run-p1" })
    expect(h.searched.sort()).toEqual([NAJDI.name, "غواص حيّ تجريبي"].sort())
    const najdi = r.candidates.find((c) => c.name === NAJDI.name)!
    expect(najdi.decision).toBe("needs_review")
    expect(najdi.flags).toContain("likely_historical")
    expect(najdi.reasons[0]).toBe(HISTORICAL_FIGURE_REASON)
  })
})

// ─── P2 — third_party_exposure needs a quoted sensitive fact ────────────────

const ANSARI_TEXT =
  "روى فهد الأنصاري أنه في أول مباراة له مع الاتحاد منعه إداري الفريق من خلع قميصه لإعطائه لاعباً منافساً"
const ANSARI_Q = "فهد الأنصاري أنه في أول مباراة له مع الاتحاد منعه إداري الفريق"
const ANSARI_SRC = web("https://kooora.example/ansari", ANSARI_TEXT, "لقاء")
const ansariRaw = (extra: Record<string, unknown> = {}) => ({
  story_type: "first_hand",
  story_summary: "أول مباراة دولية له",
  evidence: [{ source: 1, quote: ANSARI_Q }],
  topic_relevance: { value: "on_topic", source: 1, quote: ANSARI_Q },
  gender: { value: "male", source: 1, quote: ANSARI_Q },
  nationality: { value: "Kuwait", source: 1, quote: ANSARI_Q },
  same_person: true,
  sensitivity_flags: ["third_party_exposure"],
  ...extra,
})
const ansari = (extra?: Record<string, unknown>) =>
  verifyStoryClassification(ansariRaw(extra), [ANSARI_SRC], nameVariants(["فهد الأنصاري"]), null)
const SPORT = { topic: "لاعب كرة كويتي يروي أول مباراة دولية", filters: { gender: "male" as const }, geography: ["kuwait" as const] }
const ANSARI_P: ProposedName = { name: "فهد الأنصاري", role: "لاعب وسط دولي سابق", story_type: "first_hand" }

describe("P2 third_party_exposure false positive", () => {
  it("the lexicon never fired on the anecdote — the reject came from the model flag alone", () => {
    expect(guestPolicyHits(ANSARI_TEXT)).toEqual([])
  })

  it("an unbacked third_party_exposure flag → needs_review with the flag shown, not rejected (pilot)", () => {
    const c = scoreCandidate(ANSARI_P, { resolved: false }, {}, SPORT, ansari())
    expect(c.decision).toBe("needs_review")
    expect(c.flags).toContain("policy_exposure_unbacked")
    expect(c.flags).not.toContain("policy_violation")
    expect(c.reasons[0]).toContain("كشف خصوصيات الغير")
    expect(STORY_REVIEW_FLAGS).toContain("policy_exposure_unbacked")
  })

  it("backed by a verbatim quote of a private fact about a named third party → still rejected", () => {
    const src = web(
      "https://example.example/x",
      "روى فهد الأنصاري أن زميله في المنتخب كان يتعاطى المنشطات سراً وأن زوجته طلبت الطلاق بسبب ذلك",
    )
    const check = verifyStoryClassification(
      ansariRaw({
        evidence: [{ source: 1, quote: "روى فهد الأنصاري أن زميله في المنتخب كان يتعاطى" }],
        third_party_exposure: {
          source: 1,
          quote: "زميله في المنتخب كان يتعاطى المنشطات سراً وأن زوجته طلبت الطلاق",
          kind: "health",
          about: "زميله في المنتخب",
        },
      }),
      [src],
      nameVariants(["فهد الأنصاري"]),
      null,
    )
    expect(check.attrs.sensitivity_flags).toContain("third_party_exposure")
    const c = scoreCandidate(ANSARI_P, { resolved: false }, {}, SPORT, check)
    expect(c.decision).toBe("rejected")
    expect(c.reasons[0]).toContain("كشف خصوصيات الغير")
  })

  it.each([
    ["a paraphrase", { source: 1, quote: "الإداري منعه من إعطاء قميصه للاعب", kind: "family", about: "إداري الفريق" }],
    ["a kind outside the list", { source: 1, quote: ANSARI_Q, kind: "embarrassing", about: "إداري الفريق" }],
    ["no named third party", { source: 1, quote: ANSARI_Q, kind: "family", about: "" }],
  ])("backing that is %s does not count → review", (_l, backing) => {
    const check = ansari({ third_party_exposure: backing })
    expect(check.attrs.sensitivity_flags ?? []).not.toContain("third_party_exposure")
    expect(check.attrs.exposure_unbacked).toBe(true)
  })

  it("unchanged: scandal / politics from the model still hard-reject on their own", () => {
    for (const flag of ["scandal", "politics", "ongoing_case"]) {
      const c = scoreCandidate(ANSARI_P, { resolved: false }, {}, SPORT, ansari({ sensitivity_flags: [flag] }))
      expect(c.decision).toBe("rejected")
      expect(c.flags).toContain("policy_violation")
    }
  })

  it("the prompt defines third_party_exposure with a coach/official counter-example", async () => {
    await classifyStory({ name: "فهد الأنصاري", claim: null, topic: SPORT.topic, sources: [ANSARI_SRC], variants: nameVariants(["فهد الأنصاري"]) })
    const sys = h.calls.find((c) => c.taskKind === "verification")!.system
    expect(sys).toContain("مدرب")
    expect(sys).toContain('"third_party_exposure"')
  })
})

// ─── P3 — same person proposed in another run of the season ─────────────────

describe("P3 cross-run duplicate hint", () => {
  it("otherRunIndex keys other runs' names, skips this run, keeps the newest", () => {
    const idx = otherRunIndex(
      [
        { name: "سعد الحوطي", run_id: "run-pow", topic: "الأسرى الكويتيون" },
        { name: "سعد  الحوطي", run_id: "run-old", topic: "قديم" },
        { name: "لاعب آخر", run_id: "run-now", topic: "الرياضة" },
        { name: null, run_id: "run-x", topic: null },
      ],
      "run-now",
    )
    expect(idx.get(discoveryNameKey("سعد الحوطي"))).toEqual({ runId: "run-pow", topic: "الأسرى الكويتيون" })
    expect(idx.has(discoveryNameKey("لاعب آخر"))).toBe(false)
    expect(idx.size).toBe(1)
  })

  it("a name already in another run is marked «مقترح في بحث آخر», not blocked", async () => {
    h.otherRuns = new Map([[discoveryNameKey("سعد الحوطي"), { runId: "run-pow", topic: "الأسرى الكويتيون" }]])
    h.people = [
      { name: "سعد الحوطي", role: "لاعب كرة سابق", gender: "male", story_type: "first_hand", story_claim: "لعب في منتخب 1982" },
      { name: "لاعب جديد تجريبي", role: "لاعب", gender: "male", story_type: "first_hand", story_claim: "لعب عام 1990" },
    ]
    const r = await runV2Discovery({ ...SPORT, runId: "run-sport" })
    const hout = r.candidates.find((c) => c.name === "سعد الحوطي")!
    expect(hout).toBeTruthy()
    expect(hout.flags).toContain("seen_in_other_run")
    expect(hout.reasons.join(" ")).toContain("مقترح في بحث آخر")
    expect(hout.reasons.join(" ")).toContain("الأسرى الكويتيون")
    const fresh = r.candidates.find((c) => c.name === "لاعب جديد تجريبي")!
    expect(fresh.flags ?? []).not.toContain("seen_in_other_run")
    // not blocked, same decision path as without the hint
    expect(hout.decision).toBe(fresh.decision)
  })
})

// ─── 2026-10-02: a living elder's old story is not «متوفّى» ──────────────────

describe("historical label — strong only for a death / era signal", () => {
  const claim1950: ProposedName = {
    name: "راوٍ كبير تجريبي",
    role: "غواص سابق",
    story_type: "first_hand",
    story_claim: "غاص على اللؤلؤ سنة 1952 مع والده",
  }
  it.each([
    ["is_alive true", { is_alive: true }],
    ["birth_year 1940", { birth_year: 1940 }],
    ["birth_year 1945 + alive", { birth_year: 1945, is_alive: true }],
  ])("old first-hand year + %s → soft copy", (_l, over) => {
    expect(historicalFigureCue({ ...claim1950, ...over })).toBe(OLD_ERA_STORY_REASON)
  })
  it.each([
    ["no life signal (the pilot)", {}],
    ["is_alive false", { is_alive: false }],
    ["birth_year 1932 even if alive", { birth_year: 1932, is_alive: true }],
  ])("%s → strong label", (_l, over) => {
    expect(historicalFigureCue({ ...claim1950, ...over })).toBe(HISTORICAL_FIGURE_REASON)
  })
  it("a verified era (attrs.historical) stays strong even when the model says alive", () => {
    expect(historicalFigureCue({ ...claim1950, is_alive: true, birth_year: 1950 }, { historical: true } as never)).toBe(
      HISTORICAL_FIGURE_REASON,
    )
  })
  it("the soft case is still review, never accepted unseen", () => {
    const p = { ...claim1950, is_alive: true, birth_year: 1944 }
    const c = scoreCandidate(p, { resolved: false }, {}, INPUT, UNVERIFIED(p.story_claim))
    expect(c.decision).toBe("needs_review")
    expect(c.flags).toContain("old_era_story")
    expect(c.flags).not.toContain("likely_historical")
  })
})
