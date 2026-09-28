/**
 * discovery-v2 story-first — the approved criterion (Khaled, 2026-09-26) as
 * executable fixtures. No network, no paid calls: the router, the grounded-
 * evidence service, Wikidata and enrichment are all mocked.
 *
 * Every person here is FICTIONAL — names and biographies are invented so no
 * real guest's story lives in test data.
 *
 *   F1 pow-story-not-in-wikidata  F2 famous-expert-no-story
 *   F3 hallucinated-story         F4 no-footprint
 *   F5 namesake (single Wikidata hit, deceased stranger)
 *   F6 ex-guest-respelled         F7 filter-unknown
 *   F8 grounding-off              F9 second-hand
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GroundedEvidence, GroundedSource } from "@/lib/ai/grounded-evidence"
import type {
  EnrichmentSignals,
  ProposedName,
  StoryCheck,
  StorySource,
  V2Candidate,
  V2RunInput,
  WikiFacts,
} from "@/lib/discovery-v2/types"
import type { RawStoryClassification } from "@/lib/discovery-v2/story-classify"

// ─── Mocks ───────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  proposal: [] as unknown[],
  /** the witness-profiles reply (D2) — none by default: the harvest then skips */
  witness: [] as unknown[],
  classify: new Map<string, unknown>(),
  web: new Map<string, unknown[]>(),
  wiki: new Map<string, unknown>(),
  signals: new Map<string, unknown>(),
  configured: true,
  memoryKeys: [] as string[],
  aiCalls: [] as Array<{
    taskKind: string
    user: string
    system: string
    promptVersion?: string
    providerOptions?: Record<string, unknown>
    timeoutMs?: number
    maxRetries?: number
  }>,
  gatherQueries: [] as string[],
  enrichCalls: [] as string[],
  /** names whose grounded search throws (budget spent / transient) */
  webFail: new Set<string>(),
  /** names whose classifier call fails */
  classifyFail: new Set<string>(),
  /** per-call propose replies (shifted in order); falls back to `proposal` */
  proposals: [] as unknown[][],
  /** propose call indexes (0-based) that fail */
  proposeFail: new Set<number>(),
  proposeCalls: 0,
  /** fake-clock ms each propose call "takes" (needs vi.useFakeTimers) */
  proposeDelayMs: 0,
  /** fake-clock ms each story search "takes" (needs vi.useFakeTimers) */
  gatherDelayMs: 0,
  /** every story search: when it started + the timeout it was given */
  gatherLog: [] as Array<{ at: number; timeoutMs?: number }>,
  /** every classifier call: when it started (timeout/retries are in aiCalls) */
  classifyAt: [] as number[],
}))

vi.mock("@/lib/ai-router", () => ({
  runAiTask: vi.fn(async (req: {
    taskKind: string
    promptVersion?: string
    prompt: Array<{ content: string }>
    providerOptions?: Record<string, unknown>
    timeoutMs?: number
    maxRetries?: number
  }) => {
    const user = req.prompt[1]?.content ?? ""
    h.aiCalls.push({
      taskKind: req.taskKind,
      user,
      system: req.prompt[0]?.content ?? "",
      promptVersion: req.promptVersion,
      providerOptions: req.providerOptions,
      timeoutMs: req.timeoutMs,
      maxRetries: req.maxRetries,
    })
    if (req.taskKind === "structural") {
      // D2 witness profiles (witness.ts) — answered explicitly, never a classify.
      return { status: "succeeded", runId: "witness-run", parsed: { profiles: h.witness } }
    }
    if (req.taskKind === "discovery") {
      const i = h.proposeCalls++
      if (h.proposeDelayMs) vi.setSystemTime(Date.now() + h.proposeDelayMs)
      if (h.proposeFail.has(i)) {
        return { status: "failed", runId: `propose-run-${i}`, errorClass: "timeout", errorMessage: "timeout" }
      }
      const people = h.proposals.length ? h.proposals.shift() : h.proposal
      return { status: "succeeded", runId: `propose-run-${i}`, parsed: { people } }
    }
    h.classifyAt.push(Date.now())
    const name = /^الشخص: ([^(\n—]+)/.exec(user)?.[1]?.trim() ?? ""
    if (h.classifyFail.has(name)) {
      return { status: "failed", runId: `cls-${name}`, errorClass: "timeout", errorMessage: "timeout" }
    }
    return { status: "succeeded", runId: `cls-${name}`, parsed: h.classify.get(name) ?? { story_type: "none", evidence: [] } }
  }),
}))

vi.mock("@/lib/ai/grounded-evidence", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ai/grounded-evidence")>()
  return {
    ...actual,
    isGroundedEvidenceConfigured: () => h.configured,
    gatherGroundedEvidence: vi.fn(async (q: string, opts?: { timeoutMs?: number }): Promise<GroundedEvidence> => {
      h.gatherQueries.push(q)
      h.gatherLog.push({ at: Date.now(), timeoutMs: opts?.timeoutMs })
      if (h.gatherDelayMs) vi.setSystemTime(Date.now() + h.gatherDelayMs)
      if ([...h.webFail].some((n) => q.includes(`"${n}"`))) throw new Error("daily grounded budget exhausted")
      // Per-person story queries quote the name; a "harvest:<words>" key
      // answers the D1 harvest query that contains <words>.
      const hit = [...h.web.entries()].find(([name]) =>
        name.startsWith("harvest:") ? q.includes(name.slice(8)) : q.includes(`"${name}"`),
      )
      return {
        sources: (hit?.[1] ?? []) as GroundedSource[],
        provenance: { provider: "gemini", model: "gemini-test" },
        queryCount: 1,
        estimatedCostUsd: 0.014,
      }
    }),
  }
})

// D5 — X is off in these tests (no network, no token); x-lists has its own tests.
vi.mock("@/lib/discovery-v2/sources/x-lists", () => ({
  harvestXListNames: vi.fn(async () => ({ names: [], calls: 0, users_read: 0, degraded: null, est_cost_usd: null })),
}))

vi.mock("@/lib/discovery-v2/sources/wikidata", () => ({
  resolvePerson: vi.fn(async (name: string) => (h.wiki.get(name) as WikiFacts) ?? { resolved: false }),
}))

vi.mock("@/lib/discovery-v2/enrich", () => ({
  enrich: vi.fn(async (name: string) => {
    h.enrichCalls.push(name)
    return (h.signals.get(name) as EnrichmentSignals) ?? {}
  }),
}))

vi.mock("@/lib/discovery-v2/memory", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/discovery-v2/memory")>()
  return {
    ...actual,
    loadDiscoveryMemory: vi.fn(async () => ({
      excludeNames: h.memoryKeys,
      excludeQids: new Set<string>(),
      excludeNameKeys: new Set(h.memoryKeys.map(actual.discoveryNameKey)),
      recentlySurfacedNames: [],
    })),
  }
})

import {
  DISCOVERY_JOB_BUDGET_MS,
  POST_PROPOSE_RESERVE_MS,
  POST_STORY_RESERVE_MS,
  STORY_CHECK_MIN_MS,
  STORY_SEARCH_TIMEOUT_MS,
  TOPUP_MIN_MS,
  classifyBudget,
  runV2Discovery,
} from "@/lib/discovery-v2/pipeline"
import { PROPOSE_MAX_OUTPUT_TOKENS, PROPOSE_PROMPT_VERSION } from "@/lib/discovery-v2/propose"
import { khatConstitutionBlock } from "@/lib/khat-map/core/constitution"
import { scoreCandidate } from "@/lib/discovery-v2/score"
import { verifyStoryClassification, STORY_MIN_QUOTE_WORDS } from "@/lib/discovery-v2/story-classify"
import {
  geographyOfNationality,
  inferGenderFromSources,
  nameVariants,
  hasPublicFootprint,
  notCheckedStory,
  possiblyDeceasedCue,
  rankForStoryCheck,
  resolveGeography,
  selectForStoryCheck,
} from "@/lib/discovery-v2/story-evidence"

// ─── Fixtures (fictional) ────────────────────────────────────────────────────

const TOPIC = "الأسرى الكويتيون في الغزو العراقي"

const src = (over: Partial<GroundedSource>): GroundedSource => ({
  title: "مقابلة",
  url: "https://example.com/a",
  domain: "example.com",
  snippet: "",
  verified: true,
  ...over,
})

// F1 — first-hand POW story, not in Wikidata, told on two live domains.
const F1 = "جاسم ضاري المطوّع"
const F1_Q1 = "روى جاسم ضاري المطوع قصة أسره في أغسطس 1990 حين اقتادته القوات العراقية إلى البصرة"
const F1_Q2 = "قال إنه عاش أيام الاحتلال في الكويت مقاوماً قبل أن يؤسر في نهاية الشهر"
const F1_PROPOSED: ProposedName = {
  name: F1,
  name_en: "Jasem Dhari Almutawa",
  role: "أسير سابق ومقاوم",
  country: "الكويت",
  why: "عاش الأسر بنفسه",
  story_claim: "أُسر في أغسطس 1990 ونُقل إلى البصرة",
  story_type: "first_hand",
}
const F1_WEB = [
  src({ url: "https://www.alanba.com.kw/x1", domain: "alanba.com.kw", title: "شهادة أسير كويتي سابق", snippet: `${F1_Q1} وبقي سبعة أشهر.` }),
  src({ url: "https://www.alqabas.com/x2", domain: "alqabas.com", title: `لقاء مع ${F1}`, snippet: `في اللقاء ${F1_Q2}.` }),
]
const F1_CLASSIFY: RawStoryClassification = {
  story_type: "first_hand",
  story_summary: "أُسر بعد الغزو العراقي 1990 ونُقل إلى البصرة",
  evidence: [
    // Hamza/taa-marbuta spelling differs from the snippet on purpose — the fold must carry it.
    { source: 1, quote: "روى جاسم ضاري المطوع قصة اسره في اغسطس 1990 حين اقتادته القوات العراقيه" },
    { source: 2, quote: F1_Q2 },
  ],
  gulf_event: { event: "الأسر 1990", source: 1, quote: "قصة أسره في أغسطس 1990 حين اقتادته القوات العراقية" },
  // The classifier now judges the story against the episode topic, backed
  // by a verified quote (2026-09-28) — a POW story on a POW episode.
  topic_relevance: { value: "on_topic", source: 1, quote: "قصة أسره في أغسطس 1990 حين اقتادته القوات العراقية" },
  is_individual: true,
  same_person: true,
}
const F1_SIGNALS: EnrichmentSignals = {
  youtube: { talk_url: "https://www.youtube.com/watch?v=abc", talk_title: `${F1} يروي قصة الأسر`, talk_description: "" },
  news: { recent_mentions: 1 },
}

// F1 with sources whose grammar never states his gender (no «روى/قال»
// next to the name) — the "gender unknown" case under a strict filter.
const F1_NEUTRAL_Q = "قصة أسره في أغسطس 1990 حين اقتادته القوات العراقية إلى البصرة"
const F1_WEB_NEUTRAL = [
  src({ url: "https://www.alanba.com.kw/x1", domain: "alanba.com.kw", title: "شهادة أسير كويتي سابق", snippet: `في شهادة ${F1} ${F1_NEUTRAL_Q} وبقي سبعة أشهر.` }),
  src({ url: "https://www.alqabas.com/x2", domain: "alqabas.com", title: `لقاء مع ${F1}`, snippet: `في اللقاء ${F1_Q2}.` }),
]
const F1_CLASSIFY_NEUTRAL: RawStoryClassification = {
  ...F1_CLASSIFY,
  evidence: [
    { source: 1, quote: F1_NEUTRAL_Q },
    { source: 2, quote: F1_Q2 },
  ],
  gulf_event: { event: "الأسر 1990", source: 1, quote: F1_NEUTRAL_Q },
  topic_relevance: { value: "on_topic", source: 1, quote: F1_NEUTRAL_Q },
}

// FW — a woman who lived it, not in Wikidata; her sources say «روت».
const FW = "هيا سالم البدر"
const FW_Q1 = `روت ${FW} كيف أخفت جيرانها في سرداب بيتها خلال أيام الاحتلال العراقي`
const FW_Q2 = `وقالت ${FW} إنها بقيت في الكويت حتى التحرير تنقل الطعام للأسر المحاصرة`
const FW_PROPOSED: ProposedName = {
  name: FW,
  role: "شاهدة ومتطوّعة",
  country: "الكويت",
  why: "عاشت الاحتلال في الكويت",
  story_claim: "أخفت جيرانها خلال الاحتلال العراقي 1990",
  story_type: "first_hand",
}
const FW_WEB = [
  src({ url: "https://www.alanba.com.kw/w1", domain: "alanba.com.kw", title: "شهادة من أيام الاحتلال", snippet: `${FW_Q1}.` }),
  src({ url: "https://www.alqabas.com/w2", domain: "alqabas.com", title: `لقاء مع ${FW}`, snippet: `${FW_Q2}.` }),
]
const FW_CLASSIFY: RawStoryClassification = {
  story_type: "first_hand",
  story_summary: "أخفت جيرانها خلال الاحتلال",
  evidence: [
    { source: 1, quote: FW_Q1 },
    { source: 2, quote: FW_Q2 },
  ],
  gulf_event: { event: "الاحتلال 1990", source: 1, quote: FW_Q1 },
  topic_relevance: { value: "on_topic", source: 1, quote: FW_Q1 },
  is_individual: true,
  same_person: true,
}

// F2 — famous expert, rich Wikidata, huge audience, no personal story.
const F2 = "د. يوسف بدر الحمدان"
const F2_WIKI = (): WikiFacts => ({
  resolved: true,
  qid: "Q2002",
  label: "Yousef Alhamdan",
  label_ar: F2,
  description: "مؤرخ كويتي متخصص في تاريخ الغزو العراقي",
  occupations: ["historian"],
  gender: "male",
  nationality_country: "Kuwait",
  sitelink_count: 30,
  official_website: "https://hamdan.example",
  social: { x: "https://x.com/hamdan" },
  identity_uncertain: false,
})
const F2_SIGNALS = (followers = 500_000): EnrichmentSignals => ({
  scholar: { works: 120, cited_by: 5000 },
  news: { recent_mentions: 6 },
  youtube: { channel_url: "https://youtube.com/channel/h", talk_url: "https://www.youtube.com/watch?v=h" },
  x: {
    url: "https://x.com/hamdan",
    username: "hamdan",
    followers,
    verified: true,
    posting: "active",
    recent_posts: 20,
    avg_engagement: 900,
    recent_sample: [],
  },
})
const F2_Q = `يرى ${F2} أن الغزو العراقي كان نتيجة حسابات إقليمية خاطئة`
const F2_WEB = [
  src({ url: "https://aljarida.com/e1", domain: "aljarida.com", title: `${F2} في قراءة لذكرى الغزو`, snippet: F2_Q }),
  src({ url: "https://alraimedia.com/e2", domain: "alraimedia.com", title: `محاضرة ${F2} عن الغزو`, snippet: `حوار مع ${F2} عن الغزو` }),
]
const F2_CLASSIFY: RawStoryClassification = {
  story_type: "expert_only",
  evidence: [{ source: 1, quote: F2_Q }],
  gulf_event: null,
  // A historian of the invasion IS on topic — as an expert, not a witness.
  topic_relevance: { value: "on_topic", source: 1, quote: F2_Q },
  same_person: true,
  is_individual: true,
}

// F3 — the model "remembers" a story; the source says something else.
const F3 = "منيرة عادل السبيعي"
const F3_WEB = [
  src({ url: "https://alwatan.example/f3", domain: "alwatan.example", title: F3, snippet: `${F3} مهندسة معمارية تحدثت عن تصميم المباني الحديثة في الكويت` }),
]
const F3_PARAPHRASE = "روت منيرة عادل السبيعي تجربتها خلال أيام الاحتلال العراقي للكويت"
const F3_CLASSIFY: RawStoryClassification = {
  story_type: "first_hand",
  evidence: [{ source: 1, quote: F3_PARAPHRASE }],
  same_person: true,
}

// F4 — invented name: the web was searched and nothing names it.
const F4 = "عبدالكريم نجم الوسمي"

// F9 — narrates his father's story.
const F9 = "حمد فيصل العنزي"
const F9_Q = `يروي ${F9} قصة والده الذي فقد في الغزو عام 1990`
const F9_WEB = [src({ url: "https://alanba.com.kw/f9", domain: "alanba.com.kw", title: F9, snippet: F9_Q })]
const F9_CLASSIFY: RawStoryClassification = {
  story_type: "second_hand",
  evidence: [{ source: 1, quote: F9_Q }],
  topic_relevance: { value: "on_topic", source: 1, quote: F9_Q },
  same_person: true,
}

const input = (over: Partial<V2RunInput> = {}): V2RunInput => ({ topic: TOPIC, runId: "run-1", ...over })

function setupF1F2() {
  h.proposal = [
    { name: F2, name_en: "Yousef Alhamdan", role: "مؤرخ", country: "الكويت", why: "خبير", story_type: "expert" },
    F1_PROPOSED,
  ]
  h.wiki.set(F2, F2_WIKI())
  h.signals.set(F2, F2_SIGNALS())
  h.web.set(F2, F2_WEB)
  h.classify.set(F2, F2_CLASSIFY)
  h.signals.set(F1, F1_SIGNALS)
  h.web.set(F1, F1_WEB)
  h.classify.set(F1, F1_CLASSIFY)
}

const ENV = { ...process.env }
beforeEach(() => {
  h.proposal = []
  h.witness = []
  h.classify.clear()
  h.web.clear()
  h.wiki.clear()
  h.signals.clear()
  h.configured = true
  h.memoryKeys = []
  h.aiCalls = []
  h.gatherQueries = []
  h.enrichCalls = []
  h.webFail.clear()
  h.classifyFail.clear()
  h.proposals = []
  h.proposeFail.clear()
  h.proposeCalls = 0
  h.proposeDelayMs = 0
  h.gatherDelayMs = 0
  h.gatherLog = []
  h.classifyAt = []
  delete process.env.DISCOVERY_STORY_GROUNDING
  delete process.env.DISCOVERY_STORY_MAX_CANDIDATES
  delete process.env.DISCOVERY_WEB_GROUNDED_ENABLED
})
afterEach(() => {
  process.env = { ...ENV }
  vi.useRealTimers()
})

const classifyCalls = () => h.aiCalls.filter((c) => c.taskKind === "verification")
const byName = <T extends { name: string }>(cs: T[], n: string) => cs.find((c) => c.name === n)

// ─── F1 / F2 — the criterion itself ──────────────────────────────────────────

describe("F1 vs F2 — a verified story outranks fame", () => {
  it("F1 (not in Wikidata) is enriched, needs_review, ≥0.70, and ranks #1 over F2", async () => {
    setupF1F2()
    const r = await runV2Discovery(input())
    const f1 = byName(r.candidates, F1)!
    const f2 = byName(r.candidates, F2)!

    // Guards pipeline.ts:80 from coming back: the unresolved name WAS enriched.
    expect(h.enrichCalls).toContain(F1)
    expect(f1.story?.status).toBe("verified")
    expect(f1.scores.story).toBe(1) // two distinct live domains
    expect(f1.scores.gulf_hook).toBe(1)
    expect(f1.decision).toBe("needs_review")
    expect(f1.flags).toContain("identity_unverified")
    expect(f1.scores.overall).toBeGreaterThanOrEqual(0.7)
    expect(r.candidates[0].name).toBe(F1)

    expect(f2.decision).toBe("shortlist")
    expect(f2.scores.story).toBe(0)
    expect(f2.scores.overall).toBeLessThan(f1.scores.overall)
    expect(f2.scores.overall).toBeLessThan(0.55)
  })

  it("follower neutrality — 0 vs 5,000,000 followers gives an identical overall", () => {
    // Deliberately NOT F2's saturated notability (it clamps at 1.0 with or
    // without a follower bonus, which made this test blind): a mid-profile
    // expert where any follower term would show.
    const score = (followers: number, sitelinks = 4) =>
      scoreCandidate(
        { name: F2, role: "مؤرخ" },
        { ...F2_WIKI(), sitelink_count: sitelinks, official_website: null },
        { ...F2_SIGNALS(followers), scholar: null },
        { topic: TOPIC },
      ).scores
    expect(score(0).overall).toBe(score(5_000_000).overall)
    expect(score(5_000_000).overall).toBe(score(0).overall)
    expect(score(0).notability).toBe(score(5_000_000).notability)
    // Sight check: the same probe DOES see a real notability change, so the
    // equality above is not a clamped/blind comparison.
    expect(score(0, 0).overall).not.toBe(score(0, 4).overall)
    expect(score(0).notability).toBeLessThan(1)
  })
})

// ─── F3 — the quote guard, both directions ───────────────────────────────────

describe("F3 — a hallucinated story never scores", () => {
  const sources: StorySource[] = F3_WEB.map((s) => ({
    kind: "web",
    title: s.title,
    url: s.url,
    domain: s.domain,
    text: s.snippet,
    verified: s.verified,
  }))
  const variants = nameVariants([F3])

  it("a paraphrased quote is dropped → unverified, S = 0, not strong", async () => {
    const check = verifyStoryClassification(F3_CLASSIFY, sources, variants, "روت تجربتها في الاحتلال")
    expect(check.assessment.status).toBe("unverified")
    expect(check.assessment.story_type).toBe("none")
    expect(check.assessment.evidence).toHaveLength(0)

    h.proposal = [{ name: F3, role: "شاهدة", story_claim: "روت تجربتها في الاحتلال", story_type: "first_hand" }]
    h.web.set(F3, F3_WEB)
    h.classify.set(F3, F3_CLASSIFY)
    h.signals.set(F3, { news: { recent_mentions: 2 } })
    const r = await runV2Discovery(input())
    const c = byName(r.candidates, F3)!
    expect(c.story?.status).toBe("unverified")
    expect(c.scores.story).toBe(0)
    // Khaled «أ» (2026-09-26): an unproven first-hand claim goes to HIS
    // review with its own chip — never accepted, never a strong story.
    expect(c.decision).not.toBe("accepted")
    expect(c.decision).toBe("needs_review")
    expect(c.flags).toContain("story_unpublished")
    expect(c.story?.evidence).toHaveLength(0)
  })

  it("mutation check — the SAME quote made verbatim in the source counts (S = 0.8)", () => {
    const withQuote = sources.map((s) => ({ ...s, text: `${s.text}. ${F3_PARAPHRASE} بعد سنوات` }))
    const check = verifyStoryClassification(
      { ...F3_CLASSIFY, topic_relevance: { value: "on_topic", source: 1, quote: F3_PARAPHRASE } },
      withQuote,
      variants,
      null,
    )
    expect(check.assessment.status).toBe("verified")
    const scored = scoreCandidate({ name: F3 }, { resolved: false }, {}, { topic: TOPIC }, check)
    expect(scored.scores.story).toBe(0.8) // one live domain
  })

  it("each guard clause bites: dead source, short quote, other person", () => {
    const quote = F3_PARAPHRASE
    const live = [{ ...sources[0], text: `${quote} بعد سنوات` }]
    const ok = verifyStoryClassification({ story_type: "first_hand", evidence: [{ source: 1, quote }] }, live, variants, null)
    expect(ok.assessment.evidence).toHaveLength(1)
    // dead link
    const dead = verifyStoryClassification({ story_type: "first_hand", evidence: [{ source: 1, quote }] }, [{ ...live[0], verified: false }], variants, null)
    expect(dead.assessment.evidence).toHaveLength(0)
    // five words: verbatim, names the person, still below the 6-word floor
    // (a literal, not derived from the constant — lowering the floor must fail here)
    expect(STORY_MIN_QUOTE_WORDS).toBe(6)
    const short = "روت منيرة عادل السبيعي تجربتها"
    const tooShort = verifyStoryClassification({ story_type: "first_hand", evidence: [{ source: 1, quote: short }] }, live, variants, null)
    expect(tooShort.assessment.evidence).toHaveLength(0)
    // verbatim, live — but neither quote nor source names THIS person
    const other = verifyStoryClassification({ story_type: "first_hand", evidence: [{ source: 1, quote }] }, live, nameVariants(["شخص آخر تماماً"]), null)
    expect(other.assessment.evidence).toHaveLength(0)
    // out-of-range source index
    const oob = verifyStoryClassification({ story_type: "first_hand", evidence: [{ source: 7, quote }] }, live, variants, null)
    expect(oob.assessment.evidence).toHaveLength(0)
  })
})

// ─── F4 — the anti-invention floor that replaced the Wikidata gate ──────────

describe("F4 — no footprint anywhere", () => {
  it("without a first-hand claim: rejected with the no-footprint reason, and no classifier is paid for", async () => {
    h.proposal = [{ name: F4, role: "راوٍ", story_type: "adjacent" }]
    const r = await runV2Discovery(input())
    const c = byName(r.candidates, F4)!
    expect(c.decision).toBe("rejected")
    expect(c.reasons[0]).toContain("لا أثر له على الويب")
    expect(classifyCalls()).toHaveLength(0)
  })

  it("WITH a first-hand claim: R5 is waived (Khaled «أ») — needs_review, flagged «لا أثر رقمي», still no classifier paid", async () => {
    h.proposal = [{ name: F4, role: "راوٍ", story_type: "first_hand", story_claim: "قصة لم تُروَ علناً" }]
    const r = await runV2Discovery(input())
    const c = byName(r.candidates, F4)!
    expect(c.decision).toBe("needs_review")
    expect(c.flags).toEqual(expect.arrayContaining(["story_unpublished", "no_web_footprint"]))
    expect(c.reasons[0]).toBe("قصة غير منشورة — تحتاج مراجعتك")
    expect(c.reasons).toContain("لا أثر رقمي — تحقّق من وجوده قبل التواصل")
    expect(c.scores.story).toBe(0)
    expect(classifyCalls()).toHaveLength(0)
  })
})

// ─── F5 — single Wikidata hit that is a stranger ─────────────────────────────

describe("F5 — namesake: a lone Wikidata hit does not donate its death year", () => {
  it("resolvePerson flags identity_uncertain when the only hit contradicts the hint", async () => {
    const { resolvePerson } = await vi.importActual<typeof import("@/lib/discovery-v2/sources/wikidata")>(
      "@/lib/discovery-v2/sources/wikidata",
    )
    const entity = {
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
        P570: [{ mainsnak: { datavalue: { value: { time: "+1985-01-01T00:00:00Z" } } } }],
      },
      sitelinks: {},
      labels: { ar: { value: F1 } },
      descriptions: { ar: { value: "لاعب كرة قدم مصري" } },
    }
    const fetchMock = vi.fn(async (url: string) => {
      const body = url.includes("wbsearchentities")
        ? { search: [{ id: "Q9150" }] }
        : url.includes("props=claims")
          ? { entities: { Q9150: entity } }
          : { entities: {} }
      return new Response(JSON.stringify(body), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)
    try {
      const wiki = await resolvePerson(F1, { role: "أسير سابق ومقاوم", country: "الكويت" })
      expect(wiki.resolved).toBe(true)
      expect(wiki.death_year).toBe(1985)
      expect(wiki.identity_uncertain).toBe(true)

      // Sight check: the same lone hit WITH a matching hint stays certain.
      const match = await resolvePerson(F1, { role: "لاعب كرة قدم", country: "مصر" })
      expect(match.identity_uncertain).toBe(false)

      // Scored with the verified POW story → not rejected as deceased.
      const sources: StorySource[] = F1_WEB.map((s) => ({ kind: "web", title: s.title, url: s.url, domain: s.domain, text: s.snippet, verified: true }))
      const check = verifyStoryClassification(F1_CLASSIFY, sources, nameVariants([F1]), null)
      const c = scoreCandidate(F1_PROPOSED, wiki, F1_SIGNALS, { topic: TOPIC }, check)
      expect(c.decision).not.toBe("rejected")
      expect(c.reasons.join(" ")).not.toContain("متوفّى")
      expect(c.flags).toContain("identity_uncertain")
      expect(c.decision).toBe("needs_review")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// ─── F6 — memory by folded name ──────────────────────────────────────────────

describe("F6 — an ex-guest respelled is still dropped", () => {
  it("hamza / spacing variants collapse to the memory key", async () => {
    h.memoryKeys = ["انور حمود "]
    h.proposal = [{ name: "أنور حمود" }, { name: "أنورحمود" }, F1_PROPOSED]
    h.signals.set(F1, F1_SIGNALS)
    h.web.set(F1, F1_WEB)
    h.classify.set(F1, F1_CLASSIFY)
    const r = await runV2Discovery(input())
    expect(r.candidates.map((c) => c.name)).toEqual([F1])
    expect(h.enrichCalls).not.toContain("أنور حمود")
    expect(h.enrichCalls).not.toContain("أنورحمود")
  })
})

// ─── F7 — unknown attribute under a strict filter ────────────────────────────

describe("F7 — filter attribute unverifiable", () => {
  it("nationality filter + unresolved strong story → needs_review with nationality_unverified, never rejected", async () => {
    h.proposal = [F1_PROPOSED]
    h.signals.set(F1, F1_SIGNALS)
    h.web.set(F1, F1_WEB)
    h.classify.set(F1, F1_CLASSIFY)
    const r = await runV2Discovery(input({ filters: { nationality: "kuwaiti" } }))
    const c = byName(r.candidates, F1)!
    expect(c.decision).toBe("needs_review")
    expect(c.flags).toContain("nationality_unverified")
    expect(c.flags).not.toContain("gender_unverified")
    expect(c.scores.penalty).toBeCloseTo(0.09, 5) // unresolved 0.06 + filter 0.03
  })

  it("a VERIFIED nationality outside the selected geography is rejected (Kuwait-only default)", async () => {
    h.proposal = [F1_PROPOSED]
    h.signals.set(F1, F1_SIGNALS)
    h.web.set(F1, F1_WEB)
    h.classify.set(F1, {
      ...F1_CLASSIFY,
      nationality: { value: "Egypt", source: 2, quote: F1_Q2 },
    })
    const r = await runV2Discovery(input())
    expect(byName(r.candidates, F1)!.decision).toBe("rejected")
    // …and accepted into scope when the operator opts into that geography? No —
    // Egypt is outside every Gulf option, so it stays out; Saudi is in scope
    // only when switched on:
    h.classify.set(F1, { ...F1_CLASSIFY, nationality: { value: "Saudi Arabia", source: 2, quote: F1_Q2 } })
    const kw = await runV2Discovery(input())
    expect(byName(kw.candidates, F1)!.decision).toBe("rejected")
    const sa = await runV2Discovery(input({ geography: ["kuwait", "saudi"] }))
    expect(byName(sa.candidates, F1)!.decision).toBe("needs_review")
  })

  it("gender filter + unknown gender → the flag names GENDER, not nationality", async () => {
    h.proposal = [F1_PROPOSED]
    h.signals.set(F1, F1_SIGNALS)
    // Sources whose grammar never states his gender — with F1_WEB («روى
    // جاسم…») the text inference now reads "male" and this is not unknown.
    h.web.set(F1, F1_WEB_NEUTRAL)
    // Nationality verified (Kuwait, in scope), gender never stated.
    h.classify.set(F1, { ...F1_CLASSIFY_NEUTRAL, nationality: { value: "Kuwait", source: 2, quote: F1_Q2 } })
    const r = await runV2Discovery(input({ filters: { gender: "male" } }))
    const c = byName(r.candidates, F1)!
    expect(c.decision).toBe("needs_review")
    expect(c.flags).toContain("gender_unverified")
    expect(c.flags).not.toContain("nationality_unverified")
    expect(c.reasons.join(" ")).toContain("تعذّر التحقّق من الجنس")
    expect(c.scores.penalty).toBeCloseTo(0.09, 5) // unresolved 0.06 + filter 0.03
  })

  it("an unknown nationality under the geography scope is flagged but NOT penalised", async () => {
    // No filters at all: F1's nationality is unknown, so only the scope
    // can't be checked. Penalty = the identity penalty alone.
    setupF1F2()
    const r = await runV2Discovery(input())
    const f1 = byName(r.candidates, F1)!
    expect(f1.flags).toContain("nationality_unverified")
    expect(f1.scores.penalty).toBeCloseTo(0.06, 5)
    expect(f1.decision).toBe("needs_review")
  })

  it("the legacy non_kuwaiti filter scopes the run to Saudi + Gulf", async () => {
    h.proposal = [F1_PROPOSED]
    h.signals.set(F1, F1_SIGNALS)
    h.web.set(F1, F1_WEB)
    h.classify.set(F1, { ...F1_CLASSIFY, nationality: { value: "Saudi Arabia", source: 2, quote: F1_Q2 } })
    const r = await runV2Discovery(input({ filters: { nationality: "non_kuwaiti" } }))
    // In scope only through the non_kuwaiti → ["saudi","gulf"] mapping: under
    // the Kuwait default a verified Saudi nationality is rejected (see above).
    expect(byName(r.candidates, F1)!.decision).toBe("needs_review")
    expect(resolveGeography({ filters: { nationality: "non_kuwaiti" } })).toEqual(["saudi", "gulf"])
    // An explicit selection still wins over the legacy filter.
    expect(resolveGeography({ geography: ["kuwait"], filters: { nationality: "non_kuwaiti" } })).toEqual(["kuwait"])
  })
})

// ─── Nationality → scope is whole-word ───────────────────────────────────────

describe("geographyOfNationality", () => {
  it("matches whole words, never substrings («Romania» contains «oman»)", () => {
    expect(geographyOfNationality("Romania")).toBe("other")
    expect(geographyOfNationality("Oman")).toBe("gulf")
    expect(geographyOfNationality("Sultanate of Oman")).toBe("gulf")
    expect(geographyOfNationality("سلطنة عُمان")).toBe("gulf")
    expect(geographyOfNationality("عماني")).toBe("gulf")
    // Bare «عمان» is also Amman — never assumed Gulf.
    expect(geographyOfNationality("عمان")).toBe("other")
  })

  it("maps the common forms of each scope, and unknown → null", () => {
    expect(geographyOfNationality("State of Kuwait")).toBe("kuwait")
    expect(geographyOfNationality("كويتية")).toBe("kuwait")
    expect(geographyOfNationality("الكويت")).toBe("kuwait")
    expect(geographyOfNationality("Saudi Arabia")).toBe("saudi")
    expect(geographyOfNationality("السعودية")).toBe("saudi")
    expect(geographyOfNationality("United Arab Emirates")).toBe("gulf")
    expect(geographyOfNationality("الإمارات العربية المتحدة")).toBe("gulf")
    expect(geographyOfNationality("البحرين")).toBe("gulf")
    expect(geographyOfNationality("Qatar")).toBe("gulf")
    expect(geographyOfNationality("Egypt")).toBe("other")
    expect(geographyOfNationality("")).toBeNull()
    expect(geographyOfNationality(null)).toBeNull()
  })
})

// ─── H reads verified quotes only ────────────────────────────────────────────

describe("H — the Gulf hook never reads the propose-time hypothesis", () => {
  const CLAIM = "أُسر في أغسطس 1990 خلال الغزو ونُقل إلى البصرة من الكويت"

  it("an unverified story whose claim names the invasion scores H = 0", () => {
    const check: StoryCheck = {
      assessment: { ...notCheckedStory(null, CLAIM), status: "unverified" },
      sources: [],
      attrs: { deceased: false, not_individual: false, same_person: true, gender: null, nationality: null },
    }
    const c = scoreCandidate({ name: F1, story_claim: CLAIM }, { resolved: false }, F1_SIGNALS, { topic: TOPIC }, check)
    expect(c.scores.gulf_hook).toBe(0)
  })

  it("a VERIFIED story with no event in its quotes scores H = 0 even when the claim names one", () => {
    const quote = `قال ${F1} إنه تعلّم الصبر من سنوات عمله الطويلة في البحر`
    const check: StoryCheck = {
      assessment: {
        status: "verified",
        not_checked_reason: null,
        story_type: "first_hand",
        summary: null,
        evidence: [{ url: "https://alanba.com.kw/h1", domain: "alanba.com.kw", quote }],
        gulf_event: null,
        claim_from_propose: CLAIM,
        topic_relevance: { value: "on_topic", url: "https://alanba.com.kw/h1", quote },
      },
      sources: [],
      attrs: { deceased: false, not_individual: false, same_person: true, gender: null, nationality: null },
    }
    const c = scoreCandidate({ name: F1, story_claim: CLAIM }, { resolved: false }, F1_SIGNALS, { topic: TOPIC }, check)
    expect(c.scores.story).toBe(0.8) // sight: the story WAS counted
    expect(c.scores.gulf_hook).toBe(0)
    // Sight: the same event words in a verified quote DO score.
    const hooked = scoreCandidate(
      { name: F1 },
      { resolved: false },
      F1_SIGNALS,
      { topic: TOPIC },
      { ...check, assessment: { ...check.assessment, evidence: [{ ...check.assessment.evidence[0], quote: CLAIM }] } },
    )
    expect(hooked.scores.gulf_hook).toBe(1)
  })
})

// ─── F8 — grounding unavailable ──────────────────────────────────────────────

describe("F8 — Gemini unconfigured", () => {
  it("F1 lands in shortlist with the honest reason; zero Gemini / classifier calls", async () => {
    h.configured = false
    setupF1F2()
    const r = await runV2Discovery(input())
    const f1 = byName(r.candidates, F1)!
    expect(f1.story?.status).toBe("not_checked")
    expect(f1.decision).toBe("shortlist")
    expect(f1.reasons[0]).toContain("لم يُفحص للقصة")
    expect(f1.reasons.join(" ")).toContain("البحث الحيّ غير متاح")
    expect(h.gatherQueries).toHaveLength(0)
    expect(classifyCalls()).toHaveLength(0)
  })

  it("the kill switch behaves the same", async () => {
    process.env.DISCOVERY_STORY_GROUNDING = "off"
    setupF1F2()
    await runV2Discovery(input())
    expect(h.gatherQueries).toHaveLength(0)
    expect(classifyCalls()).toHaveLength(0)
  })
})

// ─── F9 — second-hand ────────────────────────────────────────────────────────

describe("F9 — a family story told closely", () => {
  it("scores S = 0.5", async () => {
    h.proposal = [{ name: F9, role: "ابن مفقود", story_type: "adjacent" }]
    h.web.set(F9, F9_WEB)
    h.classify.set(F9, F9_CLASSIFY)
    const r = await runV2Discovery(input())
    expect(byName(r.candidates, F9)!.scores.story).toBe(0.5)
  })
})

// ─── Propose never scores, the cap, no double-pay ────────────────────────────

describe("cost + provenance contracts", () => {
  it("a propose-time story_claim with a classifier 'none' scores S = 0", async () => {
    h.proposal = [F1_PROPOSED]
    h.signals.set(F1, F1_SIGNALS)
    h.web.set(F1, F1_WEB)
    h.classify.set(F1, { story_type: "none", evidence: [] })
    const r = await runV2Discovery(input())
    const c = byName(r.candidates, F1)!
    expect(c.story?.claim_from_propose).toBeTruthy()
    expect(c.scores.story).toBe(0)
  })

  it("cap: 20 candidates, cap 12 → exactly 12 searches + 12 classifications; the rest not_checked(cap)", async () => {
    const names = Array.from({ length: 20 }, (_, i) => `راوي تجريبي رقم ${i + 1}`)
    h.proposal = names.map((n) => ({ name: n, role: "شاهد" }))
    for (const n of names) {
      h.web.set(n, [src({ url: `https://alanba.com.kw/${encodeURIComponent(n)}`, domain: "alanba.com.kw", title: n, snippet: `${n} يتحدث` })])
    }
    const r = await runV2Discovery(input())
    expect(h.gatherQueries).toHaveLength(12)
    expect(classifyCalls()).toHaveLength(12)
    const notChecked = r.candidates.filter((c) => c.story?.status === "not_checked")
    expect(notChecked).toHaveLength(8)
    expect(notChecked.every((c) => c.story?.not_checked_reason === "cap")).toBe(true)
    expect(r.stats.story_checked).toBe(12)
    // Spec §2.2: the cap alone never rejects. Unchecked, a non-Wikidata
    // person tops out below SHORTLIST_BAR, so the old path rejected all 8
    // as «إشارات ضعيفة» without ever looking.
    for (const c of notChecked) {
      expect(c.decision).toBe("shortlist")
      expect(c.scores.overall).toBeLessThan(0.4) // sight: the bar alone would have rejected them
      expect(c.reasons[0]).toBe("لم يُفحص للقصة — خارج حدّ الفحص لهذا التشغيل (التكلفة)")
      expect(c.reasons.join(" ")).not.toContain("إشارات ضعيفة")
    }
  })

  it("error: a failed search (budget spent) or a failed classifier never rejects", async () => {
    h.proposal = [F1_PROPOSED, { name: F9, role: "ابن مفقود", story_type: "adjacent" }]
    h.signals.set(F1, F1_SIGNALS)
    h.web.set(F1, F1_WEB)
    h.webFail.add(F1) // the grounded search throws
    h.web.set(F9, F9_WEB)
    h.classifyFail.add(F9) // the search ran, the classifier failed
    const r = await runV2Discovery(input())
    for (const n of [F1, F9]) {
      const c = byName(r.candidates, n)!
      expect(c.story?.status).toBe("not_checked")
      expect(c.story?.not_checked_reason).toBe("error")
      expect(c.decision).toBe("shortlist")
      expect(c.scores.overall).toBeLessThan(0.4)
      expect(c.reasons[0]).toBe("لم يُفحص للقصة — نفدت ميزانية البحث أو خطأ مؤقّت")
      expect(c.reasons.join(" ")).not.toContain("إشارات ضعيفة")
    }
    // Sight: the classifier WAS called for F9 (so the error is the classifier's).
    expect(classifyCalls().some((c) => c.user.includes(F9))).toBe(true)
    expect(classifyCalls().some((c) => c.user.includes(F1))).toBe(false)
  })

  it("an unchecked person with a verified contradiction is still rejected (hard rejects first)", () => {
    const check: StoryCheck = {
      assessment: notCheckedStory("cap", null),
      sources: [],
      attrs: { deceased: false, not_individual: false, same_person: true, gender: null, nationality: null },
    }
    const wiki: WikiFacts = { resolved: true, nationality_country: "Egypt", identity_uncertain: false }
    const c = scoreCandidate({ name: F2 }, wiki, {}, { topic: TOPIC }, check)
    expect(c.decision).toBe("rejected")
    expect(c.reasons[0]).toContain("خارج النطاق الجغرافي")
  })

  it("no double-pay: a story-checked candidate is not grounded again by the presence stamp", async () => {
    process.env.DISCOVERY_WEB_GROUNDED_ENABLED = "true"
    setupF1F2()
    const r = await runV2Discovery(input())
    const presenceQueries = h.gatherQueries.filter((q) => q.includes("شخص حقيقي"))
    expect(presenceQueries.some((q) => q.includes(F1))).toBe(false)
    expect(presenceQueries.some((q) => q.includes(F2))).toBe(false)
    // …and the stamp is still there, derived from the story search.
    expect(byName(r.candidates, F1)!.grounded?.presence).toBe("confirmed")
  })
})

// ─── Story-check order: story potential, not fame (trial 2026-09-26) ─────────

describe("story-check order — the cap goes to story potential, not fame", () => {
  const wiki = (sitelinks: number): WikiFacts => ({
    resolved: true,
    qid: `Q${sitelinks}00`,
    sitelink_count: sitelinks,
    gender: "male",
    nationality_country: "Kuwait",
    identity_uncertain: false,
  })
  const CLAIM = "عاش الغزو العراقي داخل الكويت وروى ذلك في مقابلة"
  const fh = (name: string): ProposedName => ({ name, role: "شاهد", why: "عاش الغزو", story_claim: CLAIM, story_type: "first_hand" })

  it("unit: first-hand claim > second-hand > none, and lesser-known first on a tie", () => {
    const pool = [
      { p: { name: "وزير سابق تجريبي", role: "وزير", story_type: "expert" as const }, wiki: wiki(30) },
      { p: { name: "ممثل مشهور تجريبي", role: "ممثل" }, wiki: wiki(20) },
      { p: fh("نائب معروف تجريبي"), wiki: wiki(12) },
      { p: { ...fh("ابن شاهد تجريبي"), story_type: "second_hand" as const }, wiki: { resolved: false } as WikiFacts },
      { p: fh("قائد لواء تجريبي"), wiki: { resolved: false } as WikiFacts },
      { p: fh("طيّار تجريبي"), wiki: wiki(1) },
    ]
    const order = rankForStoryCheck(pool, "الغزو العراقي للكويت").map((x) => x.p.name)
    expect(order).toEqual([
      "قائد لواء تجريبي", // first-hand, not in Wikidata
      "طيّار تجريبي", // first-hand, 1 edition
      "نائب معروف تجريبي", // first-hand, 12 editions — same priority, famous last
      "ابن شاهد تجريبي", // second-hand
      "ممثل مشهور تجريبي", // no claim, no type
      "وزير سابق تجريبي", // expert, no claim
    ])
  })

  it("pipeline: cap 2 — the lesser-known witness still gets its half even though every famous name also claims first-hand", async () => {
    process.env.DISCOVERY_STORY_MAX_CANDIDATES = "2"
    // The trial's real shape: the famous ALSO claim first-hand (all 24 did),
    // so the old key (first_hand, then pre-score = fame) sent the cap to them.
    const famousClaim = ["نائب معروف تجريبي", "ممثل معروف تجريبي"]
    const famousNoClaim = ["وزير سابق تجريبي", "مذيع مشهور تجريبي"]
    const lesser = ["قائد لواء تجريبي", "طيّار تجريبي"]
    // Famous first in the proposal, so proposal order alone cannot pass this.
    h.proposal = [
      ...famousClaim.map(fh),
      { name: famousNoClaim[0], role: "وزير", story_type: "expert" },
      { name: famousNoClaim[1], role: "مذيع" },
      ...lesser.map(fh),
    ]
    for (const n of [...famousClaim, ...famousNoClaim]) {
      h.wiki.set(n, { ...wiki(30), qid: `Q-${n}`, label_ar: n })
      h.signals.set(n, F2_SIGNALS())
    }
    const r = await runV2Discovery(input({ topic: "الغزو العراقي للكويت" }))
    // Split (Khaled, after trial 5): 1 public-footprint + 1 lesser-known.
    expect(h.gatherQueries).toHaveLength(2)
    const checked = (n: string) => h.gatherQueries.some((q) => q.includes(`"${n}"`))
    expect(checked(famousClaim[0])).toBe(true) // public half: first-hand claim beats expert/no-claim
    expect(checked(lesser[0])).toBe(true) // lesser-known half
    for (const n of [famousClaim[1], ...famousNoClaim, lesser[1]]) {
      const c = byName(r.candidates, n)!
      expect(c.story?.status).toBe("not_checked")
      expect(c.story?.not_checked_reason).toBe("cap")
    }
    // Sight: by pre-score the famous rank first, so the lesser-known check
    // above is the split at work, not the pre-score.
    const famousPre = scoreCandidate(fh(famousClaim[0]), wiki(30), F2_SIGNALS(), { topic: "الغزو العراقي للكويت" }).scores.overall
    const lesserPre = scoreCandidate(fh(lesser[0]), { resolved: false }, {}, { topic: "الغزو العراقي للكويت" }).scores.overall
    expect(famousPre).toBeGreaterThan(lesserPre)
  })
})

// ─── Story-check split: public footprint + lesser-known (trial 5) ────────────

describe("story-check split — every run checks both kinds (Khaled, after trial 5)", () => {
  const TOPIC_INV = "الغزو العراقي للكويت"
  // Topic-neutral wording, like trial 5's «شاركت في إخماد آبار النفط»: the
  // proposal text alone does not hit the topic, so the free evidence can.
  const CLAIM = "بقي في بيته طوال الأشهر السبعة وساعد جيرانه"
  const fh = (name: string): ProposedName => ({ name, role: "شاهد", why: "عاش الغزو", story_claim: CLAIM, story_type: "first_hand" })
  const sure = (name: string, sitelinks: number, extra: Partial<WikiFacts> = {}): WikiFacts => ({
    resolved: true, qid: `Q-${name}`, label_ar: name, sitelink_count: sitelinks, identity_uncertain: false, ...extra,
  })
  const talk = (title: string): EnrichmentSignals => ({
    youtube: { talk_url: `https://www.youtube.com/watch?v=${encodeURIComponent(title).slice(0, 11)}`, talk_title: title },
  })
  const channelOnly = (channel: string): EnrichmentSignals => ({
    youtube: { channel_url: "https://youtube.com/channel/x", channel_title: channel },
  })
  const item = (name: string, w: WikiFacts = { resolved: false }, signals: EnrichmentSignals = {}) => ({ p: fh(name), wiki: w, signals })

  it("hasPublicFootprint: confident Wikidata / a talk or headline naming them — not a channel-name hit, an uncertain entry or a podcast count", () => {
    const n = "شاهد عام تجريبي"
    expect(hasPublicFootprint(item(n, sure(n, 1)))).toBe(true)
    expect(hasPublicFootprint(item(n, { ...sure(n, 7), identity_uncertain: true }))).toBe(false)
    expect(hasPublicFootprint(item(n, undefined, talk(`لقاء ${n} عن ذكرياته`)))).toBe(true)
    expect(hasPublicFootprint(item(n, undefined, talk("لقاء مع شاهد آخر تجريبي")))).toBe(false)
    expect(hasPublicFootprint(item(n, undefined, channelOnly("Shahid Aam")))).toBe(false)
    expect(hasPublicFootprint(item(n, undefined, { news: { recent_mentions: 2, latest_url: "https://example.com/n", latest_title: `${n} يتحدث عن ذكرياته` } }))).toBe(true)
    expect(hasPublicFootprint(item(n, undefined, { news: { recent_mentions: 2, latest_url: "https://example.com/n", latest_title: "خبر عن شخص آخر" } }))).toBe(false)
    // Listen Notes matches names loosely (trial 5) — a count is not a footprint.
    expect(hasPublicFootprint(item(n, undefined, { podcast: { appearances: 10, configured: true, test: false } }))).toBe(false)
  })

  it("mixed pool: cap 4 → 2 public + 2 lesser-known, interleaved; public ordered by claim → topic footprint → notability", () => {
    const pool = [
      item("مشهور بلا قصة تجريبي", sure("مشهور بلا قصة تجريبي", 20)),
      item("مشهور متوسط تجريبي", sure("مشهور متوسط تجريبي", 5)),
      item("راوٍ منشور تجريبي", sure("راوٍ منشور تجريبي", 1), talk("راوٍ منشور تجريبي يروي تفاصيل الغزو العراقي")),
      item("مجهول أول تجريبي"),
      item("مجهول ثان تجريبي"),
      item("مجهول ثالث تجريبي"),
    ]
    const picked = selectForStoryCheck(pool, TOPIC_INV, 4).map((x) => x.p.name)
    expect(picked).toEqual([
      "راوٍ منشور تجريبي", // public: a talk already names him with the topic
      "مجهول أول تجريبي", // lesser: proposal order on a tie
      "مشهور بلا قصة تجريبي", // public: then notability breaks the tie (20 > 5)
      "مجهول ثان تجريبي",
    ])
    // Claim strength still leads notability inside the public half.
    const withExpert = [
      { p: { name: "خبير شهير تجريبي", role: "مؤرخ", story_type: "expert" as const }, wiki: sure("خبير شهير تجريبي", 40), signals: {} },
      item("نائب قليل الشهرة تجريبي", sure("نائب قليل الشهرة تجريبي", 1)),
    ]
    expect(selectForStoryCheck(withExpert, TOPIC_INV, 2).map((x) => x.p.name)).toEqual(["نائب قليل الشهرة تجريبي", "خبير شهير تجريبي"])
    expect(selectForStoryCheck(withExpert, TOPIC_INV, 1).map((x) => x.p.name)).toEqual(["نائب قليل الشهرة تجريبي"])
  })

  it("leftover: a pool short of its half gives the rest to the other; the cap is never exceeded", () => {
    const pubs = ["عام أ تجريبي", "عام ب تجريبي", "عام ج تجريبي", "عام د تجريبي", "عام هـ تجريبي", "عام و تجريبي"].map((n) => item(n, sure(n, 2)))
    const lessers = ["خفي أ تجريبي", "خفي ب تجريبي", "خفي ج تجريبي", "خفي د تجريبي", "خفي هـ تجريبي"].map((n) => item(n))
    const isPub = (x: { p: ProposedName }) => x.p.name.startsWith("عام")

    const fewPub = selectForStoryCheck([pubs[0], ...lessers], TOPIC_INV, 4)
    expect(fewPub.filter(isPub)).toHaveLength(1)
    expect(fewPub.filter((x) => !isPub(x))).toHaveLength(3)

    const fewLesser = selectForStoryCheck([...pubs, lessers[0]], TOPIC_INV, 4)
    expect(fewLesser.filter(isPub)).toHaveLength(3)
    expect(fewLesser.filter((x) => !isPub(x))).toHaveLength(1)

    expect(selectForStoryCheck([...pubs, ...lessers], TOPIC_INV, 12)).toHaveLength(11) // everyone, no more
    expect(selectForStoryCheck([...pubs, ...lessers], TOPIC_INV, 0)).toEqual([])
    const odd = selectForStoryCheck([...pubs, ...lessers], TOPIC_INV, 5)
    expect([odd.filter(isPub).length, odd.filter((x) => !isPub(x)).length]).toEqual([2, 3])
    // Deterministic.
    expect(selectForStoryCheck([...pubs, ...lessers], TOPIC_INV, 7)).toEqual(selectForStoryCheck([...pubs, ...lessers], TOPIC_INV, 7))
  })

  it("replay of trial 5's shape (fictional): the people with a published account are checked, and so are 6 lesser-known", async () => {
    process.env.DISCOVERY_STORY_MAX_CANDIDATES = "12"
    // Trial 5: 24 first-hand claims; three people with known published
    // accounts (confident Wikidata + a talk about the invasion) went
    // «not_checked (cap)» while 12 checks went to obscure names.
    const published = [["راوية الحي تجريبي", 11], ["عقيد الدفاع تجريبي", 2], ["طبيب المستشفى تجريبي", 1]] as const
    const publicOther = [["مغني مقيم تجريبي", 13], ["مذيعة الإذاعة تجريبي", 6], ["رياضي سابق تجريبي", 5], ["مدرس المدرسة تجريبي", 3]] as const
    const talkOnly = ["شاعر شعبي تجريبي", "تاجر السوق تجريبي", "لاعب نادي تجريبي", "موظف الوزارة تجريبي"]
    const martyrUncertain = "شهيد الموقع تجريبي"
    const martyrTalk = "شهيد البيت تجريبي"
    const deadSure = "متوفى مؤكد تجريبي"
    const obscure = ["جار الحي تجريبي", "سائق الإسعاف تجريبي", "حارس المبنى تجريبي", "ممرضة الوردية تجريبي", "بائع الخبز تجريبي", "صياد الميناء تجريبي", "طالب الجامعة تجريبي", "ربة البيت تجريبي", "فني الكهرباء تجريبي", "مزارع الوفرة تجريبي"]

    // Proposal order puts the obscure FIRST, as trial 5's lesser-known-first order effectively did.
    h.proposal = [...obscure, ...talkOnly, martyrTalk, martyrUncertain, deadSure, ...publicOther.map((x) => x[0]), ...published.map((x) => x[0])].map(fh)
    for (const [n, sl] of published) {
      h.wiki.set(n, sure(n, sl))
      h.signals.set(n, talk(`${n} يروي تفاصيل الغزو العراقي للكويت`))
    }
    for (const [n, sl] of publicOther) {
      h.wiki.set(n, sure(n, sl))
      h.signals.set(n, talk(`مقابلة ${n} في برنامج منوّعات`))
    }
    for (const n of talkOnly) h.signals.set(n, talk(`لقاء ${n} عن مجلس الشباب`))
    h.wiki.set(martyrUncertain, { ...sure(martyrUncertain, 1), identity_uncertain: true, death_year: 1990 })
    h.signals.set(martyrUncertain, talk(`${martyrUncertain} والله ما نزل العلم 1990`))
    h.signals.set(martyrTalk, talk(`بيت الشهيد - الشهيد ${martyrTalk}`))
    h.wiki.set(deadSure, sure(deadSure, 3, { death_year: 2023 }))
    h.signals.set(obscure[0], channelOnly("Jar Alhay"))
    h.signals.set(obscure[1], { podcast: { appearances: 10, configured: true, test: true } })

    const r = await runV2Discovery(input({ topic: TOPIC_INV }))
    const checked = (n: string) => h.gatherQueries.some((q) => q.includes(`"${n}"`))
    expect(h.gatherQueries).toHaveLength(12)
    for (const [n] of published) expect(checked(n)).toBe(true)
    // 6 + 6.
    const pubNames = [...published.map((x) => x[0]), ...publicOther.map((x) => x[0]), ...talkOnly, martyrTalk, martyrUncertain] as string[]
    expect(pubNames.filter(checked)).toHaveLength(6)
    expect(obscure.filter(checked)).toHaveLength(6)
    // Notability only broke the tie after the topic footprint: 13 > 6 > 5.
    expect(publicOther.slice(0, 3).every(([n]) => checked(n))).toBe(true)
    // Hard-reject and possibly-deceased: never ahead of anyone.
    expect(checked(deadSure)).toBe(false)
    expect(checked(martyrTalk)).toBe(false)
    expect(checked(martyrUncertain)).toBe(false)
    for (const n of [martyrTalk, martyrUncertain]) {
      const c = byName(r.candidates, n)!
      expect(c.decision).toBe("shortlist")
      expect(c.reasons.join(" ")).toContain("قد يكون متوفّى")
    }

    // Sight: trial 5's order (lesser-known first, no split) leaves all three out.
    const oldPick = rankForStoryCheck(
      h.proposal.map((p) => ({ p: p as ProposedName, wiki: (h.wiki.get((p as ProposedName).name) as WikiFacts) ?? { resolved: false } }))
        .filter((x) => !(x.wiki.resolved && !x.wiki.identity_uncertain && x.wiki.death_year)),
      TOPIC_INV,
    ).slice(0, 12).map((x) => x.p.name)
    for (const [n] of published) expect(oldPick).not.toContain(n)
  })
})

// ─── Possibly deceased (soft cue) ────────────────────────────────────────────

describe("possibly deceased — a soft cue, never a rejection", () => {
  const n = "شهيد الحي تجريبي"
  const src = (text: string): StorySource => ({ kind: "youtube", title: text, url: "https://www.youtube.com/watch?v=d", domain: "youtube.com", text, verified: true })
  const v = nameVariants([n])

  it("fires on «الشهيد/المرحوم <full name>» and an uncertain Wikidata death year; not on a lone first name, a namesake told-own-story, or plain text", () => {
    expect(possiblyDeceasedCue({ resolved: false }, [src(`بيت الشهيد - الشهيد ${n}`)], v)).toContain("قد يكون متوفّى")
    expect(possiblyDeceasedCue({ resolved: false }, [src(`رحيل والمرحوم ${n}`)], v)).toContain("قد يكون متوفّى")
    expect(possiblyDeceasedCue({ resolved: false }, [src("الشهيد شهيد في الذاكرة")], v)).toBeNull()
    expect(possiblyDeceasedCue({ resolved: false }, [src(`لقاء ${n} عن الغزو`)], v)).toBeNull()
    const uncertainDead: WikiFacts = { resolved: true, identity_uncertain: true, death_year: 1990 }
    expect(possiblyDeceasedCue(uncertainDead, [], v)).toContain("1990")
    expect(possiblyDeceasedCue(uncertainDead, [], v, true)).toBeNull()
  })

  it("order: a cued person is checked after everyone else in their pool, never dropped", () => {
    const fh2 = (name: string): ProposedName => ({ name, role: "شاهد", story_claim: "عاش الغزو", story_type: "first_hand" })
    const talkOf = (t: string): EnrichmentSignals => ({ youtube: { talk_url: "https://www.youtube.com/watch?v=t", talk_title: t } })
    const other = "شاهد حي تجريبي"
    const pub = [
      { p: fh2(n), wiki: { resolved: false } as WikiFacts, signals: talkOf(`بيت الشهيد - الشهيد ${n}`) },
      { p: fh2(other), wiki: { resolved: false } as WikiFacts, signals: talkOf(`لقاء ${other}`) },
    ]
    expect(selectForStoryCheck(pub, "الغزو العراقي للكويت", 1).map((x) => x.p.name)).toEqual([other])
    expect(selectForStoryCheck(pub, "الغزو العراقي للكويت", 2).map((x) => x.p.name)).toEqual([other, n])
    // An UNCERTAIN Wikidata entry's death year is a stranger's until proven
    // otherwise (2026-09-28): it no longer demotes a living candidate in the
    // queue. Same entry shape on both, so only the death year differs — the
    // old cue sorted n last; now proposal order stands.
    const lesser = [
      { p: fh2(n), wiki: { resolved: true, identity_uncertain: true, death_year: 1990 } as WikiFacts, signals: {} },
      { p: fh2(other), wiki: { resolved: true, identity_uncertain: true } as WikiFacts, signals: {} },
    ]
    expect(rankForStoryCheck(lesser, "الغزو العراقي للكويت").map((x) => x.p.name)).toEqual([n, other])
    // …while the SOURCE cue («الشهيد <name>») still sorts last.
    const withSourceCue = [
      { p: fh2(n), wiki: { resolved: false } as WikiFacts, signals: talkOf(`بيت الشهيد - الشهيد ${n}`) },
      { p: fh2(other), wiki: { resolved: false } as WikiFacts, signals: {} },
    ]
    expect(rankForStoryCheck(withSourceCue, "الغزو العراقي للكويت").map((x) => x.p.name)).toEqual([other, n])
  })

  it("score: the cue keeps the person out of «accepted» and says why, without rejecting", () => {
    const c = scoreCandidate(
      { name: n, role: "شاهد", story_claim: "عاش الغزو", story_type: "first_hand" },
      { resolved: false },
      { youtube: { talk_url: "https://www.youtube.com/watch?v=d", talk_title: `بيت الشهيد - الشهيد ${n}` } },
      { topic: "الغزو العراقي للكويت" },
      { assessment: notCheckedStory("cap", "عاش الغزو"), sources: [src(`بيت الشهيد - الشهيد ${n}`)], attrs: { deceased: false, not_individual: false, same_person: true, gender: null, nationality: null } },
    )
    expect(c.decision).not.toBe("rejected")
    expect(c.decision).not.toBe("accepted")
    expect(c.reasons.join(" ")).toContain("قد يكون متوفّى")
  })
})

// ─── Strict gender filter ────────────────────────────────────────────────────

describe("gender — Arabic grammar next to the full name", () => {
  const S = (text: string, verified = true): StorySource => ({
    kind: "web", title: "", url: "https://example.com/g", domain: "example.com", text, verified,
  })
  const v = nameVariants([FW])

  it("reads «روت» / «وقالت» / a female title as female, «روى» / a rank as male", () => {
    expect(inferGenderFromSources([S(`روت ${FW} قصتها`)], v)).toBe("female")
    expect(inferGenderFromSources([S(`وقالت ${FW} إنها بقيت`)], v)).toBe("female")
    expect(inferGenderFromSources([S(`الدكتورة ${FW} في لقاء`)], v)).toBe("female")
    expect(inferGenderFromSources([S(`${FW} روت ما رأته`)], v)).toBe("female")
    const m = nameVariants([F1])
    expect(inferGenderFromSources([S(`روى ${F1} قصة أسره`)], m)).toBe("male")
    expect(inferGenderFromSources([S(`اللواء ${F1} في شهادته`)], m)).toBe("male")
  })

  it("never guesses: relative pronouns, a lone first name, an unverified source, a conflict → null", () => {
    // «الذي» agrees with «منزل», not with her.
    expect(inferGenderFromSources([S(`منزل ${FW} الذي أخفت فيه جيرانها`)], v)).toBeNull()
    expect(inferGenderFromSources([S("قال هيا إن الوضع صعب")], v)).toBeNull()
    expect(inferGenderFromSources([S(`روت ${FW} قصتها`, false)], v)).toBeNull()
    expect(inferGenderFromSources([S(`روت ${FW} قصتها`), S(`قال ${FW} إن`)], v)).toBeNull()
    expect(inferGenderFromSources([S(`في شهادة ${FW} عن الاحتلال`)], v)).toBeNull()
  })
})

describe("gender filter is strict", () => {
  function setupFW() {
    h.web.set(FW, FW_WEB)
    h.classify.set(FW, FW_CLASSIFY)
  }
  function setupF1(web = F1_WEB, cls: RawStoryClassification = F1_CLASSIFY) {
    h.signals.set(F1, F1_SIGNALS)
    h.web.set(F1, web)
    h.classify.set(F1, cls)
  }

  it("male-only: a woman documented by her sources' grammar is rejected; the man is not", async () => {
    h.proposal = [FW_PROPOSED, F1_PROPOSED]
    setupFW()
    setupF1()
    const r = await runV2Discovery(input({ filters: { gender: "male" } }))
    const w = byName(r.candidates, FW)!
    expect(w.decision).toBe("rejected")
    expect(w.reasons[0]).toBe("يخالف فلتر الجنس المطلوب")
    const m = byName(r.candidates, F1)!
    expect(m.decision).toBe("needs_review") // not in Wikidata — identity, not gender
    expect(m.flags).not.toContain("gender_unverified")
    expect(m.scores.filter_match).toBe(1)
  })

  it("female-only: the mirror — the man is rejected, the woman is not", async () => {
    h.proposal = [FW_PROPOSED, F1_PROPOSED]
    setupFW()
    setupF1()
    const r = await runV2Discovery(input({ filters: { gender: "female" } }))
    expect(byName(r.candidates, F1)!.decision).toBe("rejected")
    expect(byName(r.candidates, F1)!.reasons[0]).toBe("يخالف فلتر الجنس المطلوب")
    const w = byName(r.candidates, FW)!
    expect(w.decision).toBe("needs_review")
    expect(w.flags).not.toContain("gender_unverified")
  })

  it("a trusted Wikidata P21 of the other gender is a hard reject before any paid check", async () => {
    h.proposal = [FW_PROPOSED]
    h.wiki.set(FW, { resolved: true, qid: "Q777", label_ar: FW, gender: "female", nationality_country: "Kuwait", sitelink_count: 2, identity_uncertain: false })
    setupFW()
    const r = await runV2Discovery(input({ filters: { gender: "male" } }))
    expect(byName(r.candidates, FW)!.decision).toBe("rejected")
    expect(h.gatherQueries.some((q) => q.includes(`"${FW}"`))).toBe(false)
    // …and a YouTube title that already says «الشاعرة» does the same for free.
    h.wiki.clear()
    h.gatherQueries = []
    h.signals.set(FW, { youtube: { talk_url: "https://www.youtube.com/watch?v=w", talk_title: `الشاعرة ${FW} تروي أيام الاحتلال`, talk_description: "" } })
    const r2 = await runV2Discovery(input({ filters: { gender: "male" } }))
    expect(byName(r2.candidates, FW)!.decision).toBe("rejected")
    expect(h.gatherQueries.some((q) => q.includes(`"${FW}"`))).toBe(false)
  })

  it("unknown gender under a filter is NEVER accepted — even a trusted Wikidata person with a strong story", async () => {
    const trusted: WikiFacts = {
      resolved: true, qid: "Q555", label_ar: F1, label: "Jasem Almutawa", gender: null,
      nationality_country: "Kuwait", sitelink_count: 3, identity_uncertain: false,
    }
    h.proposal = [F1_PROPOSED]
    h.wiki.set(F1, trusted)
    setupF1(F1_WEB_NEUTRAL, F1_CLASSIFY_NEUTRAL)
    // Sight: with no filter this exact person IS accepted…
    const open = await runV2Discovery(input())
    expect(byName(open.candidates, F1)!.decision).toBe("accepted")
    for (const g of ["male", "female"] as const) {
      const r = await runV2Discovery(input({ filters: { gender: g } }))
      const c = byName(r.candidates, F1)!
      expect(c.decision).toBe("needs_review")
      expect(c.flags).toContain("gender_unverified")
    }
    // …and once Wikidata states the gender, the male filter accepts him.
    h.wiki.set(F1, { ...trusted, gender: "male" })
    const known = await runV2Discovery(input({ filters: { gender: "male" } }))
    expect(byName(known.candidates, F1)!.decision).toBe("accepted")
  })

  it("classifier and grammar disagree → unknown (needs_review), never a guess", async () => {
    h.proposal = [F1_PROPOSED]
    // Sources say «روى جاسم…» (male); the classifier claims female with a verified quote.
    setupF1(F1_WEB, { ...F1_CLASSIFY, gender: { value: "female", source: 2, quote: F1_Q2 } })
    const r = await runV2Discovery(input({ filters: { gender: "male" } }))
    const c = byName(r.candidates, F1)!
    expect(c.decision).toBe("needs_review")
    expect(c.flags).toContain("gender_unverified")
  })

  it("a proposal that self-reports the other gender is dropped before enrichment", async () => {
    h.proposal = [{ ...FW_PROPOSED, gender: "female" }, { ...F1_PROPOSED, gender: "male" }]
    setupFW()
    setupF1()
    const r = await runV2Discovery(input({ filters: { gender: "male" } }))
    expect(h.enrichCalls).not.toContain(FW)
    expect(byName(r.candidates, FW)).toBeUndefined()
    expect(h.enrichCalls).toContain(F1)
    // Sight: with no filter she is enriched as usual.
    h.enrichCalls = []
    await runV2Discovery(input())
    expect(h.enrichCalls).toContain(FW)
  })

  it("the propose prompt states the filter as a prohibition, drops the story quota, and is v2-propose-7", async () => {
    h.proposal = []
    await runV2Discovery(input({ filters: { gender: "female" } }))
    const call = h.aiCalls.find((c) => c.taskKind === "discovery")!
    expect(PROPOSE_PROMPT_VERSION).toBe("v2-propose-7")
    expect(call.promptVersion).toBe("v2-propose-7")
    // The constitution (compact) is the first block.
    expect(call.system.startsWith(khatConstitutionBlock("compact"))).toBe(true)
    // The rules that must survive.
    expect(call.system).toContain("فرضيتان ستُفحصان لاحقاً")
    expect(call.system).toContain("لا تختلق")
    expect(call.system).toContain("نساء فقط")
    expect(call.system).toContain("لا تقترح أيّ رجل")
    // Worth telling, not a quota (Khaled 2026-09-28): the two-thirds rule and
    // the public-figure cap are gone; politicians / court cases / exposing
    // others are excluded; every proposal names where he told it.
    expect(call.system).not.toContain("ثلثا القائمة")
    expect(call.system).not.toContain("ربع القائمة")
    expect(call.system).toContain("تستحق أن تُروى")
    expect(call.system).toContain("السياسيين")
    expect(call.system).toContain("قضية منظورة أمام المحاكم")
    expect(call.system).toContain("تفضح غيره")
    expect(call.system).toContain("public_account_ref")
    h.aiCalls = []
    await runV2Discovery(input({ filters: { gender: "male" }, taste: "famous" }))
    const m = h.aiCalls.find((c) => c.taskKind === "discovery")!
    expect(m.system).toContain("لا تقترح أيّ امرأة")
  })

  it("witness profiles steer propose (D2) and every discovery call carries the run id", async () => {
    h.witness = [
      { profile: "رجل كويتي خسر تجارته ثم بدأ من جديد", where_told: ["بودكاست كويتي"], search_terms: ["إفلاس"] },
      { profile: "أب كويتي ربّى أبناءه وحده بعد وفاة زوجته", where_told: ["مقابلة صحفية"], search_terms: ["أرمل"] },
    ]
    h.proposal = [FW_PROPOSED]
    setupFW()
    await runV2Discovery(input({ runId: "run-telemetry" }))
    const witnessCall = h.aiCalls.find((c) => c.taskKind === "structural")!
    expect(witnessCall.promptVersion).toBe("v2-witness-1")
    expect(witnessCall.maxRetries).toBe(0)
    const call = h.aiCalls.find((c) => c.taskKind === "discovery")!
    expect(call.system).toContain("رجل كويتي خسر تجارته ثم بدأ من جديد")
    expect(call.system).toContain("يرويها عادة في: بودكاست كويتي")
    const { runAiTask } = await import("@/lib/ai-router")
    const reqs = vi.mocked(runAiTask).mock.calls.map((c) => c[0] as { subjectTable?: string; subjectId?: string })
    expect(reqs.length).toBeGreaterThan(0)
    for (const r of reqs.slice(-h.aiCalls.length)) {
      expect(r.subjectTable).toBe("discovery_runs")
      expect(r.subjectId).toBe("run-telemetry")
    }
  })

  it("a harvested name (D1) is story-checked from its own sources — no second search", async () => {
    h.witness = [{ profile: "رجل كويتي خسر تجارته ثم بدأ من جديد", where_told: [], search_terms: ["إفلاس"] }]
    const HARVESTED = "سالم عبدالله المطيري"
    const quote = "أنا سالم عبدالله المطيري خسرت تجارتي كلها عام ٢٠٠٨ ثم بدأت من الصفر"
    const src = {
      title: "مقابلة القبس",
      url: "https://alqabas.com/harvest-1",
      domain: "alqabas.com",
      snippet: quote,
      verified: true,
    }
    // The harvest search: any query that is not a per-person story query.
    h.web.set("harvest:رجال كويتيين", [src])
    h.proposal = []
    const { runAiTask } = await import("@/lib/ai-router")
    const base = vi.mocked(runAiTask).getMockImplementation()!
    vi.mocked(runAiTask).mockImplementation(async (req) => {
      if (req.promptVersion === "v2-harvest-extract-1") {
        return {
          status: "succeeded",
          runId: "harvest-extract",
          parsed: { people: [{ name: HARVESTED, source: 1, quote, story_claim: "خسر تجارته ثم بدأ من جديد" }] },
        } as never
      }
      return base(req)
    })
    try {
      h.classify.set(HARVESTED, {
        story_type: "first_hand",
        evidence: [{ source: 1, quote }],
        topic_relevance: { value: "on_topic", source: 1, quote },
        self_told: { value: true, source: 1, quote },
        same_person: true,
      })
      const before = h.gatherQueries.length
      const r = await runV2Discovery(input())
      const c = byName(r.candidates, HARVESTED)!
      expect(c).toBeDefined()
      expect(c.origin).toBe("harvest_web")
      expect(c.public_account_ref).toBe(src.url)
      expect(c.story?.status).toBe("verified")
      // Only the ONE harvest search ran — no per-person story search for him.
      const queries = h.gatherQueries.slice(before)
      expect(queries).toHaveLength(1)
      expect(queries[0]).not.toContain(`"${HARVESTED}"`)
      expect(r.stats.harvested_web).toBe(1)
      expect(r.stats.harvest_queries).toBe(1)
    } finally {
      vi.mocked(runAiTask).mockImplementation(base)
    }
  })
})

describe("propose call budget (2026-09-26 timeout)", () => {
  it("caps output tokens and leaves effort/timeout/retries to the registry (Settings stays in control)", async () => {
    h.proposal = []
    await runV2Discovery(input())
    const call = h.aiCalls.find((c) => c.taskKind === "discovery")!
    expect(call.providerOptions).toEqual({ max_output_tokens: PROPOSE_MAX_OUTPUT_TOKENS })
    expect(PROPOSE_MAX_OUTPUT_TOKENS).toBe(12_000)
    // A per-call effort would beat the Settings override inside the adapter.
    expect(call.providerOptions).not.toHaveProperty("reasoningEffort")
    expect(call.timeoutMs).toBeUndefined()
    expect(call.maxRetries).toBeUndefined()
  })

  it("asks for a terse list — per-field length caps are in the prompt", async () => {
    h.proposal = []
    await runV2Discovery(input())
    const call = h.aiCalls.find((c) => c.taskKind === "discovery")!
    expect(call.system).toContain("role بست كلمات على الأكثر")
    expect(call.system).toContain("لا تتجاوز ١٥ كلمة")
    expect(call.system).toContain("في ٢٥ كلمة على الأكثر")
  })
})

// ─── Khaled «أ» — unpublished first-hand stories are reviewed, not rejected ──
//
// Mirrors of the 2026-09-26 trial-4 shapes (v2-propose-5 run
// eceb01b6…: all 7 proposals were story_type "first_hand"). Names are
// FICTIONAL per this file's rule; each fixture copies the real case's shape:
//   UA (≈ الشطي)  classifier expert_only, has a footprint → unverified
//   UB (≈ الفاضل) classifier none, has a footprint        → unverified
//   UC (≈ خاجه)   no web source at all                    → unverified, no footprint
//   UD (≈ النوت)  classifier second_hand, verified        → told by others
//   UE (≈ النوت as it really came back) second_hand + a verified death quote

const UA = "بدر ناصر الحشاش"
const UA_Q = `يرى ${UA} أن المستشفيات الكويتية واجهت نقصاً حاداً في الأدوية`
const UB = "طلال عيسى المنيس"
const UB_TXT = `${UB} غواص كويتي ومدرّب سباحة في نادي الغوص`
const UC = "فواز جاسر العتال"
const UD = "مشاري حمود الفرج"
const UD_Q = `يروي ${UD} ما حكاه له والده عن أيام المقاومة في الفروانية`
const UD_DEATH = `وقد توفي ${UD} رحمه الله في حادث سير عام 2019`

const firstHand = (name: string, claim: string, role = "شاهد"): ProposedName => ({
  name,
  role,
  country: "الكويت",
  story_claim: claim,
  story_type: "first_hand",
})

function setupUnpublished() {
  h.proposal = [
    firstHand(UA, "عمل طبيباً وعالج مصابين أثناء الاحتلال عام 1990", "طبيب"),
    firstHand(UB, "شارك في إزالة مخلفات الغزو من السواحل بعد التحرير 1991", "غواص"),
    firstHand(UC, "صوّر سراً القوات العراقية بين أغسطس 1990 وفبراير 1991", "مصوّر"),
  ]
  h.web.set(UA, [src({ url: "https://alqabas.com/ua", domain: "alqabas.com", title: `${UA} في ندوة`, snippet: UA_Q })])
  h.classify.set(UA, { story_type: "expert_only", evidence: [{ source: 1, quote: UA_Q }], same_person: true, is_individual: true })
  h.web.set(UB, [src({ url: "https://alanba.com.kw/ub", domain: "alanba.com.kw", title: UB, snippet: UB_TXT })])
  h.classify.set(UB, { story_type: "none", evidence: [], same_person: true })
  // UC: nothing anywhere (no web entry, no signals)
}

describe("Khaled «أ» — an unpublished first-hand story goes to review, not the bin", () => {
  it("≈ الشطي / الفاضل / خاجه → needs_review «قصة غير منشورة», S = 0, never «إشارات ضعيفة»", async () => {
    setupUnpublished()
    const r = await runV2Discovery(input())
    for (const n of [UA, UB, UC]) {
      const c = byName(r.candidates, n)!
      expect(c.story?.status).toBe("unverified")
      expect(c.decision).toBe("needs_review")
      expect(c.flags).toContain("story_unpublished")
      expect(c.reasons[0]).toBe("قصة غير منشورة — تحتاج مراجعتك")
      expect(c.reasons.join(" ")).not.toContain("إشارات ضعيفة")
      expect(c.scores.story).toBe(0) // no fake evidence
      // sight: the bar alone would have rejected them (as trial 4 did)
      expect(c.scores.overall).toBeLessThan(0.4)
    }
    // Only the one nothing names is flagged «لا أثر رقمي».
    expect(byName(r.candidates, UA)!.flags).not.toContain("no_web_footprint")
    expect(byName(r.candidates, UB)!.flags).not.toContain("no_web_footprint")
    expect(byName(r.candidates, UC)!.flags).toContain("no_web_footprint")
    expect(r.stats.needs_review).toBe(3)
  })

  it("≈ النوت told by others → needs_review «قصته يرويها غيره» (S = 0.5)", async () => {
    h.proposal = [firstHand(UD, "شارك في المقاومة في الفروانية عام 1990")]
    h.web.set(UD, [src({ url: "https://alanba.com.kw/ud", domain: "alanba.com.kw", title: UD, snippet: UD_Q })])
    h.classify.set(UD, {
      story_type: "second_hand",
      evidence: [{ source: 1, quote: UD_Q }],
      topic_relevance: { value: "on_topic", source: 1, quote: UD_Q },
      same_person: true,
    })
    const r = await runV2Discovery(input())
    const c = byName(r.candidates, UD)!
    expect(c.story?.status).toBe("verified")
    expect(c.scores.story).toBe(0.5)
    expect(c.decision).toBe("needs_review")
    expect(c.flags).toContain("story_second_hand")
    expect(c.flags).not.toContain("story_unpublished")
    expect(c.reasons[0]).toBe("قصته يرويها غيره — تحتاج مراجعتك")
  })

  it("≈ النوت as trial 4 really returned it — second-hand + a verified death — is still rejected (hard rejects first)", async () => {
    h.proposal = [firstHand(UD, "شارك في المقاومة في الفروانية عام 1990")]
    h.web.set(UD, [src({ url: "https://alanba.com.kw/ud", domain: "alanba.com.kw", title: UD, snippet: `${UD_Q}. ${UD_DEATH}` })])
    h.classify.set(UD, {
      story_type: "second_hand",
      evidence: [{ source: 1, quote: UD_Q }],
      deceased: { source: 1, quote: UD_DEATH },
      same_person: true,
    })
    const r = await runV2Discovery(input())
    const c = byName(r.candidates, UD)!
    expect(c.decision).toBe("rejected")
    expect(c.reasons[0]).toContain("متوفّى")
    expect(c.flags).not.toContain("story_second_hand")
  })

  it("no claim and no evidence is still rejected — with a footprint («إشارات ضعيفة») and without one (R5)", async () => {
    const NOCLAIM = "سعود راشد الهاجري"
    h.proposal = [
      { name: NOCLAIM, role: "مهتمّ بالتاريخ", story_type: "expert" },
      { name: F4, role: "راوٍ" },
    ]
    h.web.set(NOCLAIM, [src({ url: "https://alanba.com.kw/nc", domain: "alanba.com.kw", title: NOCLAIM, snippet: `${NOCLAIM} يكتب عن التاريخ` })])
    h.classify.set(NOCLAIM, { story_type: "none", evidence: [], same_person: true })
    const r = await runV2Discovery(input())
    const weak = byName(r.candidates, NOCLAIM)!
    expect(weak.decision).toBe("rejected")
    expect(weak.reasons[0]).toBe("إشارات ضعيفة (قصة/ملاءمة/حضور)")
    const ghost = byName(r.candidates, F4)!
    expect(ghost.decision).toBe("rejected")
    expect(ghost.reasons[0]).toContain("لا أثر له على الويب")
    for (const c of [weak, ghost]) expect(c.flags).not.toContain("story_unpublished")
  })

  it("a claim labelled anything but first_hand does not qualify", async () => {
    h.proposal = [{ ...firstHand(UB, "شارك في إزالة مخلفات الغزو"), story_type: "adjacent" }]
    h.web.set(UB, [src({ url: "https://alanba.com.kw/ub", domain: "alanba.com.kw", title: UB, snippet: UB_TXT })])
    h.classify.set(UB, { story_type: "none", evidence: [], same_person: true })
    const r = await runV2Discovery(input())
    expect(byName(r.candidates, UB)!.decision).toBe("rejected")
  })

  it("hard rejects still apply: a VERIFIED out-of-scope nationality, a verified other gender", () => {
    const check: StoryCheck = {
      assessment: { ...notCheckedStory(null, "عاش الاحتلال"), status: "unverified" },
      sources: [],
      attrs: { deceased: false, not_individual: false, same_person: true, gender: null, nationality: null },
    }
    const p = firstHand(UA, "عاش الاحتلال")
    const egypt: WikiFacts = { resolved: true, nationality_country: "Egypt", identity_uncertain: false }
    const out = scoreCandidate(p, egypt, {}, { topic: TOPIC }, check)
    expect(out.decision).toBe("rejected")
    expect(out.reasons[0]).toContain("خارج النطاق الجغرافي")
    const woman: WikiFacts = { resolved: true, gender: "female", nationality_country: "Kuwait", identity_uncertain: false }
    const g = scoreCandidate(p, woman, {}, { topic: TOPIC, filters: { gender: "male" } }, check)
    expect(g.decision).toBe("rejected")
    expect(g.reasons[0]).toBe("يخالف فلتر الجنس المطلوب")
    // sight: the same person with no contradiction is reviewed
    const kw: WikiFacts = { resolved: true, nationality_country: "Kuwait", identity_uncertain: false }
    expect(scoreCandidate(p, kw, {}, { topic: TOPIC }, check).decision).toBe("needs_review")
  })

  it("ranking: verified stories › unpublished (footprint) › shortlist › unpublished (no footprint) › rejected", async () => {
    setupUnpublished()
    h.proposal = [
      ...(h.proposal as ProposedName[]),
      F1_PROPOSED,
      { name: F9, role: "ابن مفقود", story_type: "adjacent" },
      { name: "سعود راشد الهاجري", role: "مهتمّ بالتاريخ", story_type: "expert" },
    ]
    h.signals.set(F1, F1_SIGNALS)
    h.web.set(F1, F1_WEB)
    h.classify.set(F1, F1_CLASSIFY)
    h.web.set(F9, F9_WEB)
    h.webFail.add(F9) // not checked (error) → shortlist
    h.web.set("سعود راشد الهاجري", [src({ url: "https://alanba.com.kw/nc", domain: "alanba.com.kw", title: "سعود راشد الهاجري", snippet: "سعود راشد الهاجري يكتب عن التاريخ" })])
    const r = await runV2Discovery(input())
    const order = r.candidates.map((c) => c.name)
    const at = (n: string) => order.indexOf(n)
    expect(at(F1)).toBe(0)
    expect(at(UA)).toBeLessThan(at(F9))
    expect(at(UB)).toBeLessThan(at(F9))
    expect(at(F9)).toBeLessThan(at(UC))
    expect(at(UC)).toBeLessThan(at("سعود راشد الهاجري"))
    expect(byName(r.candidates, F9)!.decision).toBe("shortlist")
  })

  // Trial 6 (2026-09-26): «عيسى بويابس» — a VERIFIED first-hand story on one
  // live domain (S = 0.8), not in Wikidata → overall 0.47 < ACCEPT_BAR →
  // «قائمة مختصرة», ranked BELOW six unverified «قصة غير منشورة». VB is a
  // fictional name shaped like him.
  const VB = "عيسى راشد البوحمد"
  const VB_Q = `روى ${VB} كيف اعتقلته القوات العراقية في سبتمبر 1990 من بيته في الجابرية`
  const VB_PROPOSED = firstHand(VB, "اعتُقل من بيته أثناء الاحتلال عام 1990")
  const setupVB = (snippet = `${VB_Q} وبقي في الأسر أشهراً.`) => {
    h.web.set(VB, [src({ url: "https://alraimedia.com/vb", domain: "alraimedia.com", title: `شهادة ${VB}`, snippet })])
    h.classify.set(VB, {
      story_type: "first_hand",
      story_summary: "اعتُقل من بيته في سبتمبر 1990",
      evidence: [{ source: 1, quote: VB_Q }],
      topic_relevance: { value: "on_topic", source: 1, quote: VB_Q },
      is_individual: true,
      same_person: true,
    })
  }

  it("trial 6: a VERIFIED first-hand story outside Wikidata is reviewed, never shortlisted — and ranks above every unpublished story", async () => {
    setupUnpublished()
    h.proposal = [...(h.proposal as ProposedName[]), VB_PROPOSED]
    setupVB()
    const r = await runV2Discovery(input())
    const vb = byName(r.candidates, VB)!
    expect(vb.story?.status).toBe("verified")
    expect(vb.scores.story).toBe(0.8) // one live domain
    // Trial 6 scored him < 0.55 on the 0.62 fit prior; with a VERIFIED
    // on-topic relevance F = 1 and he clears the bar — and is still
    // reviewed, not accepted, because nothing confirms his identity.
    expect(vb.scores.topic_fit).toBe(1)
    expect(vb.decision).toBe("needs_review")
    expect(vb.flags).toContain("identity_unverified")
    expect(vb.reasons[0]).toBe("قصة موثّقة — ليس في ويكي‌داتا، راجِع الهوية")
    // one identity reason, not two
    expect(vb.reasons.filter((x) => x.includes("ويكي‌داتا"))).toHaveLength(1)
    const order = r.candidates.map((c) => c.name)
    for (const u of [UA, UB, UC]) {
      expect(byName(r.candidates, u)!.flags).toContain("story_unpublished")
      expect(order.indexOf(VB)).toBeLessThan(order.indexOf(u))
    }
  })

  // A lived story with no Gulf event in it (H = 0), under a nationality
  // filter nobody could verify (−0.03), not in Wikidata (−0.06).
  const BOAT_Q = `روى ${VB} كيف بنى بيديه أول قارب خشبي صنعه في حياته على الشاطئ`
  const boatCheck = (relevance: "on_topic" | "off_topic") =>
    verifyStoryClassification(
      {
        story_type: "first_hand",
        evidence: [{ source: 1, quote: BOAT_Q }],
        topic_relevance: { value: relevance, source: 1, quote: BOAT_Q },
        is_individual: true,
        same_person: true,
      },
      [{ kind: "web", title: "شهادة", url: "https://alraimedia.com/vb", domain: "alraimedia.com", text: BOAT_Q, verified: true }],
      nameVariants([VB]),
      null,
    )

  it("a verified ON-TOPIC first-hand story weaker still (below the accept bar) is reviewed, never «إشارات ضعيفة»", () => {
    const c = scoreCandidate(VB_PROPOSED, { resolved: false }, {}, { topic: "صناعة القوارب الخشبية", filters: { nationality: "kuwaiti" } }, boatCheck("on_topic"))
    expect(c.scores.story).toBe(0.8)
    expect(c.scores.gulf_hook).toBe(0)
    expect(c.scores.overall).toBeLessThan(0.55)
    expect(c.decision).toBe("needs_review")
    expect(c.reasons.join(" ")).not.toContain("إشارات ضعيفة")
  })

  it("the same verified story OFF the episode topic counts nothing (2026-09-28): S = 0, never a strong story", () => {
    // Before topic relevance this scored S = 0.8 on an episode about video
    // games — the founders'-founding-story failure of run 1e88aa03.
    const c = scoreCandidate(VB_PROPOSED, { resolved: false }, {}, { topic: "صناعة الألعاب الإلكترونية", filters: { nationality: "kuwaiti" } }, boatCheck("off_topic"))
    expect(c.story?.status).toBe("verified")
    expect(c.story?.topic_relevance?.value).toBe("off_topic")
    expect(c.scores.story).toBe(0)
    expect(c.scores.topic_fit).toBe(0)
    expect(c.reasons.join(" ")).not.toContain("قصة موثّقة — الدرجة الكلية")
  })
})

// ─── The accept gate — each condition must bite on its own ──────────────────

describe("accept gate — a strong verified story on trusted Wikidata is accepted only when nothing is open", () => {
  // Trusted entry, gender stated, and F1's two-domain verified story: the
  // candidate every condition below is measured against.
  const trusted = (over: Partial<WikiFacts> = {}): WikiFacts => ({
    resolved: true, qid: "Q777", label_ar: F1, label: "Jasem Almutawa", gender: "male",
    nationality_country: "Kuwait", sitelink_count: 3, identity_uncertain: false, ...over,
  })
  const run = async (wiki: WikiFacts, web = F1_WEB) => {
    h.proposal = [F1_PROPOSED]
    h.wiki.set(F1, wiki)
    h.signals.set(F1, F1_SIGNALS)
    h.web.set(F1, web)
    h.classify.set(F1, F1_CLASSIFY)
    const r = await runV2Discovery(input())
    return byName(r.candidates, F1)!
  }

  it("an unknown nationality (flag present, no penalty) keeps him at needs_review — not accepted", async () => {
    // Sight: the identical person with a known nationality IS accepted.
    const open = await run(trusted())
    expect(open.decision).toBe("accepted")
    expect(open.flags).toEqual([])

    const c = await run(trusted({ nationality_country: null }))
    expect(c.story?.status).toBe("verified")
    expect(c.scores.story).toBe(1)
    expect(c.scores.overall).toBeGreaterThanOrEqual(0.55) // the bar is not what stops it
    expect(c.scores.penalty).toBe(0) // …nor a penalty: the scope flag is unpenalised
    expect(c.flags).toEqual(["nationality_unverified"])
    expect(c.decision).toBe("needs_review")
  })

  it("the «قد يكون متوفّى» cue demotes an otherwise-accepted candidate to needs_review, with the reason", async () => {
    const cued = [
      ...F1_WEB,
      src({ url: "https://alanba.com.kw/x3", domain: "alanba.com.kw", title: `ذكرى الشهيد ${F1}`, snippet: "" }),
    ]
    // Sight: the same sources minus the cue are accepted.
    expect((await run(trusted())).decision).toBe("accepted")

    const c = await run(trusted(), cued)
    expect(c.story?.status).toBe("verified")
    expect(c.scores.overall).toBeGreaterThanOrEqual(0.55)
    expect(c.flags).toEqual([])
    expect(c.decision).toBe("needs_review")
    expect(c.reasons.join(" ")).toContain("قد يكون متوفّى")
  })
})

// ─── Story-phase deadline (the job budget) ─────────────────────────────────

describe("story-phase deadline — the checks never outrun the job budget", () => {
  const witnesses = (n: number) =>
    Array.from({ length: n }, (_, i) => firstHand(`شاهد تجريبي رقم ${i + 1}`, "عاش أيام الاحتلال عام 1990"))
  const setupWitnesses = (ps: ProposedName[]) => {
    h.proposal = ps
    for (const p of ps) {
      const q = `روى ${p.name} كيف عاش أيام الاحتلال العراقي في منطقة الجابرية عام 1990`
      h.web.set(p.name, [src({ url: `https://alanba.com.kw/${encodeURIComponent(p.name)}`, domain: "alanba.com.kw", title: p.name, snippet: q })])
      h.classify.set(p.name, { story_type: "first_hand", evidence: [{ source: 1, quote: q }], is_individual: true, same_person: true })
    }
  }
  const unchecked = (c: V2Candidate) => {
    expect(c.story?.status).toBe("not_checked")
    expect(c.story?.not_checked_reason).toBe("error")
    expect(c.decision).toBe("shortlist")
    expect(c.reasons[0]).toBe("لم يُفحص للقصة — نفدت ميزانية البحث أو خطأ مؤقّت")
  }

  it("no check starts when the budget left can't fit one — nothing is paid, every queued person is «لم يُفحص»", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    // Propose "took" so long that less than STORY_CHECK_MIN_MS is left
    // before the story deadline.
    h.proposeDelayMs = DISCOVERY_JOB_BUDGET_MS - POST_STORY_RESERVE_MS - STORY_CHECK_MIN_MS + 1_000
    const ps = witnesses(3)
    setupWitnesses(ps)
    const r = await runV2Discovery(input())
    expect(h.gatherQueries).toHaveLength(0)
    expect(classifyCalls()).toHaveLength(0)
    for (const p of ps) unchecked(byName(r.candidates, p.name)!)
    expect(r.stats.story_checked).toBe(0)
  })

  it("sight: with the budget intact the same people ARE checked", async () => {
    const ps = witnesses(3)
    setupWitnesses(ps)
    const r = await runV2Discovery(input())
    expect(h.gatherQueries).toHaveLength(3)
    for (const p of ps) expect(byName(r.candidates, p.name)!.story?.status).toBe("verified")
    // …and with nothing to cut, the calls keep their normal bounds.
    expect(h.gatherLog.every((g) => g.timeoutMs === STORY_SEARCH_TIMEOUT_MS)).toBe(true)
    expect(classifyCalls().every((c) => c.timeoutMs === 120_000 && c.maxRetries === 2)).toBe(true)
  })

  it("slow searches: every call is bounded by what is left, and the checks the clock cut are «لم يُفحص», not rejected", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const t0 = Date.now()
    const deadline = t0 + DISCOVERY_JOB_BUDGET_MS - POST_STORY_RESERVE_MS
    // 140s left for the story phase; each search "takes" 50s.
    h.proposeDelayMs = DISCOVERY_JOB_BUDGET_MS - POST_STORY_RESERVE_MS - 140_000
    h.gatherDelayMs = 50_000
    const ps = witnesses(5)
    setupWitnesses(ps)
    const r = await runV2Discovery(input())

    // Two start (140s, 90s left); after them 40s < STORY_CHECK_MIN_MS.
    expect(h.gatherLog).toHaveLength(2)
    expect(r.stats.story_checked).toBe(2)
    const cut = r.candidates.filter((c) => ps.some((p) => p.name === c.name) && c.story?.status === "not_checked")
    expect(cut).toHaveLength(3)
    for (const c of cut) unchecked(c)

    // No call was allowed past the deadline.
    for (const g of h.gatherLog) {
      expect(g.timeoutMs).toBeLessThanOrEqual(STORY_SEARCH_TIMEOUT_MS)
      expect(g.at + g.timeoutMs!).toBeLessThanOrEqual(deadline)
    }
    const cls = classifyCalls()
    expect(cls).toHaveLength(2)
    cls.forEach((c, i) => {
      // worst case: every attempt times out, with the max backoff between them
      const worst = c.timeoutMs! * (1 + c.maxRetries!) + 8_000 * c.maxRetries!
      expect(h.classifyAt[i] + worst).toBeLessThanOrEqual(deadline)
      expect(c.maxRetries).toBe(0) // 40s left: one attempt, no 120s × 3
    })
  })

  it("classifyBudget keeps the registry policy when it fits and never overruns what is left", () => {
    expect(classifyBudget(600_000)).toEqual({ timeoutMs: 120_000, maxRetries: 2 })
    expect(classifyBudget(260_000)).toEqual({ timeoutMs: 120_000, maxRetries: 1 })
    expect(classifyBudget(40_000)).toEqual({ timeoutMs: 40_000, maxRetries: 0 })
    for (const left of [1_000, 30_000, 127_999, 128_000, 255_999, 383_999, 384_000, 1_000_000]) {
      const b = classifyBudget(left)
      expect(Math.min(b.timeoutMs, left)).toBe(b.timeoutMs)
      expect(b.timeoutMs * (1 + b.maxRetries) + 8_000 * b.maxRetries).toBeLessThanOrEqual(left)
    }
  })
})

// ─── Propose top-up (trial 4: 7 names for want = 24) ─────────────────────────

describe("propose top-up — one follow-up call when the reply is short", () => {
  const names = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${i + 1}`, role: "شاهد" }))
  const proposeCalls = () => h.aiCalls.filter((c) => c.taskKind === "discovery")

  it("a short first reply triggers exactly ONE top-up for the missing count, excluding what was proposed", async () => {
    // limit 12 → want 24 → threshold ceil(14.4) = 15; the first reply gives 7.
    const first = names("شاهد أول", 7)
    h.proposals = [first, [{ name: "شاهد جديد", role: "شاهد" }]]
    const r = await runV2Discovery(input())
    expect(proposeCalls()).toHaveLength(2)
    const [a, b] = proposeCalls()
    expect(JSON.parse(a.user).want).toBe(24)
    expect(JSON.parse(b.user).want).toBe(17) // 24 − 7
    for (const p of first) expect(b.system).toContain(p.name)
    expect(a.system).not.toContain("اقترحتها في هذه الجولة")
    expect(b.system).toContain("اقترحتها في هذه الجولة")
    // exact count is asked, with the no-invention escape
    expect(a.system).toContain("اسماً بالضبط")
    expect(a.system).toContain("لا تختلق اسماً لإكمال العدد")
    // the top-up alone carries a budget-derived timeout; the first keeps the registry's
    expect(a.timeoutMs).toBeUndefined()
    expect(b.timeoutMs).toBeGreaterThanOrEqual(TOPUP_MIN_MS)
    expect(b.timeoutMs).toBeLessThanOrEqual(300_000)
    // …as ONE attempt: the registry's timeout retry would double it past `spare`.
    expect(a.maxRetries).toBeUndefined()
    expect(b.maxRetries).toBe(0)
    expect(r.stats.proposed).toBe(8)
    expect(r.stats.proposed_top_up).toBe(1)
  })

  it("dedupes the merge on folded names — a respelled repeat is dropped", async () => {
    h.proposals = [
      [{ name: "أحمد سالم الإبراهيم", role: "شاهد" }],
      [
        { name: "احمد سالم الابراهيم", role: "شاهد" }, // hamza respelling of the first
        { name: "أحمدسالم الإبراهيم", role: "شاهد" }, // spacing variant
        { name: "خالد يوسف البدر", role: "شاهد" },
      ],
    ]
    const r = await runV2Discovery(input())
    expect(proposeCalls()).toHaveLength(2)
    expect(r.stats.proposed).toBe(2)
    expect(r.stats.proposed_top_up).toBe(1)
    expect(r.candidates).toHaveLength(2)
    expect(r.candidates.map((c) => c.name).sort()).toEqual(["أحمد سالم الإبراهيم", "خالد يوسف البدر"].sort())
  })

  it("no top-up when the first reply is enough", async () => {
    // limit 3 → want 6 → threshold ceil(3.6) = 4
    h.proposals = [names("شاهد", 4)]
    await runV2Discovery(input({ limit: 3 }))
    expect(proposeCalls()).toHaveLength(1)
    // sight: one fewer does top up
    h.aiCalls = []
    h.proposals = [names("راوٍ", 3), []]
    await runV2Discovery(input({ limit: 3 }))
    expect(proposeCalls()).toHaveLength(2)
  })

  it("self-contradicting gender and memory-excluded names don't count as usable", async () => {
    h.memoryKeys = ["شاهد 1", "شاهد 2"]
    const first = [
      ...names("شاهد", 4),
      { name: "شاهدة", role: "شاهدة", gender: "female" },
    ]
    h.proposals = [first, []]
    // limit 3 → want 6 → need 4; usable = 2 (2 in memory, 1 wrong gender)
    await runV2Discovery(input({ limit: 3, filters: { gender: "male" } }))
    expect(proposeCalls()).toHaveLength(2)
    expect(JSON.parse(proposeCalls()[1].user).want).toBe(4)
  })

  it("skipped when the job budget cannot spare it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    // First propose "takes" long enough that less than TOPUP_MIN_MS is left
    // after reserving the rest of the run.
    h.proposeDelayMs = DISCOVERY_JOB_BUDGET_MS - POST_PROPOSE_RESERVE_MS - TOPUP_MIN_MS + 1_000
    h.proposals = [names("شاهد", 7)]
    const r = await runV2Discovery(input())
    expect(proposeCalls()).toHaveLength(1)
    expect(r.stats.proposed).toBe(7)
    expect(r.stats.proposed_top_up).toBe(0)
  })

  it("with some budget left, the top-up gets only what the budget can spare", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    // first call took 560s → 960 − 560 − 240 = 160s spare (budget 960s since batch 2)
    h.proposeDelayMs = 560_000
    h.proposals = [names("شاهد", 7), []]
    await runV2Discovery(input())
    expect(proposeCalls()).toHaveLength(2)
    expect(proposeCalls()[1].timeoutMs).toBe(DISCOVERY_JOB_BUDGET_MS - 560_000 - POST_PROPOSE_RESERVE_MS)
    expect(proposeCalls()[1].timeoutMs).toBe(160_000)
  })

  it("a failed top-up keeps the first list (never fails the run)", async () => {
    h.proposals = [names("شاهد", 7)]
    h.proposeFail.add(1)
    const r = await runV2Discovery(input())
    expect(proposeCalls()).toHaveLength(2)
    expect(r.error).toBeUndefined()
    expect(r.stats.proposed).toBe(7)
    expect(r.stats.proposed_top_up).toBe(0)
  })

  it("a failed FIRST propose is not retried by the top-up (the router owns the one timeout retry)", async () => {
    h.proposeFail.add(0)
    const r = await runV2Discovery(input())
    expect(proposeCalls()).toHaveLength(1)
    expect(r.error).toBeTruthy()
    // the failure is typed for the run page: a timeout is not "no names"
    expect(r.errorKind).toBe("propose_timeout")
  })

  it("a reply with no names at all is the genuine zero case — errorKind no_names", async () => {
    h.proposals = [[], []]
    const r = await runV2Discovery(input())
    expect(r.error).toBe("no names proposed")
    expect(r.errorKind).toBe("no_names")
  })
})
