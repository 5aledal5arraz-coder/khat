/**
 * Topic-engine defects in the hybrid generator (lib/hybrid-topics/generate.ts):
 *
 *   #3  `near_dup_consumed_original` could never fire (the generator passed
 *       `consumedOriginalTitles: []`), and an exact in-batch repeat was logged
 *       as `near_dup_khat_map`.
 *   #4  the topic call's ai_runs row had season_id NULL and a SEASON id in
 *       subject_id under subject_table "hybrid_topic_generations".
 *   #6  "lens ≤ 40%" and "≥ 4 archetypes" were prompt-only.
 *   #15 old market signals were used without saying so.
 *   #16 an original was consumed whenever its LENS matched, used or not.
 *   #18 published episodes were never excluded.
 *
 * Every AI/DB boundary is mocked — no paid call, no database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { HybridInputs } from "@/lib/hybrid-topics/inputs"

const h = vi.hoisted(() => ({
  runAiTask: vi.fn(),
  inputs: null as unknown as HybridInputs,
  persisted: [] as Array<Record<string, unknown>>,
  completed: [] as Array<Record<string, unknown>>,
  settings: { hybrid_performance_hint: false },
}))

vi.mock("@/lib/hybrid-topics/settings", () => ({
  getTopicEngineSettings: async () => h.settings,
}))

vi.mock("@/lib/ai-router", () => ({ runAiTask: h.runAiTask }))
vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/hybrid-topics/inputs", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, loadHybridInputs: vi.fn(async () => h.inputs) }
})
vi.mock("@/lib/original-thinking/lenses", () => ({
  loadLenses: async () =>
    ["unspoken_grief", "hidden_shame", "childhood_echo"].map((key) => ({
      key,
      name_ar: key,
      name_en: key,
      description: key,
      question_kinds: [],
      avoid: [],
    })),
}))
vi.mock("@/lib/khat-map/v2/editorial-enrich", () => ({
  enrichTopicsEditorially: vi.fn(async (_s: unknown, topics: unknown[]) => ({
    byIndex: new Map(),
    requested: topics.length,
    enriched: 0,
    missingIndexes: [],
  })),
}))
// Embedding unavailable → plain score order stands (keeps the test about
// the rules under test, not MMR).
vi.mock("@/lib/khat-map/learning/embeddings", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, batchEmbed: vi.fn(async () => { throw new Error("no embeddings in tests") }) }
})
vi.mock("@/lib/corpus/novelty", () => ({ getCorpusNoveltyRefs: async () => null, corpusProximity: () => ({ saturation: 0, whitespace: 0 }) }))
vi.mock("@/lib/khat-map/v2/exploration", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, loadUsedTerritoryIds: async () => new Set<string>(), loadWhiteSpaceThemes: async () => [] }
})
vi.mock("@/lib/hybrid-topics/persist", () => ({
  openGenerationLog: vi.fn(async () => ({ id: "gen-123" })),
  completeGenerationLog: vi.fn(async (x: Record<string, unknown>) => {
    h.completed.push(x)
  }),
  persistAcceptedTopics: vi.fn(async (x: { topics: Array<Record<string, unknown>> }) => {
    h.persisted.push(...x.topics)
    return x.topics.map((t, i) => ({
      candidate_id: `c${i}`,
      consumed_original_topic_id: (t.consumed_original_topic_id as string) ?? null,
    }))
  }),
}))

import { generateHybridTopics } from "@/lib/hybrid-topics/generate"

const EMPTY_REPORT = {
  generated_at: "x",
  top_episodes: [],
  weak_episodes: [],
  strong_topic_domains: [],
  weak_topic_domains: [],
  strong_episode_types: [],
  weak_episode_types: [],
  strong_guests: [],
  recommendations: [],
}

function inputs(over: Partial<HybridInputs> = {}): HybridInputs {
  return {
    language: "ar",
    market_clusters: [
      { id: "c1", label: "relationships", language: "ar", signal_count: 9, editorial_score: 9 } as never,
    ],
    original_topics: [],
    worked_report: EMPTY_REPORT,
    taste_lookup: { byTheme: new Map(), bySource: new Map(), byLanguage: new Map(), byTag: new Map() } as never,
    taste_hints: [],
    excluded_titles: [],
    khat_map_titles: [],
    published_episode_titles: [],
    consumed_original_titles: [],
    market_freshness: { status: "fresh", age_hours: 2 },
    lens_keys: [],
    ...over,
  }
}

/** A topic that passes every deterministic rule unless a test changes it. */
let seq = 0
function topic(over: Record<string, unknown> = {}): Record<string, unknown> {
  seq++
  const words = ["البحر", "الجبل", "المدينة", "القرية", "الصحراء", "النهر", "الغابة", "الجزيرة", "الوادي", "السهل", "الميناء", "السوق"]
  return {
    title: `رجل عاد إلى ${words[seq % words.length]} بعد ثلاثين سنة غياب رقم ${seq}`,
    archetype: "personal_story",
    novelty_note: "زاوية لم تُروَ",
    why_it_matters: "لأنها تجربة يعيشها كثيرون بصمت",
    why_now: "الآن",
    emotional_hook: "ماذا يحدث حين تعود إلى مكان لم يعد يعرفك ولا تعرفه أنت أيضاً؟",
    conflict_angle: "التوتر بين الحنين إلى المكان والغربة عنه بعد التغيير الكبير",
    market_inspiration: "none",
    primary_theme: "none",
    original_lens: "none",
    original_topic_id: "none",
    suggested_episode_type: "personal_story",
    suggested_topic_domain: "relationships",
    scores: { worth_telling: 8, human_experience: 8, practical_value: 7, segment_fit: 7, library_value: 7, guest_findability: 7 },
    sensitivity_flags: [],
    ...over,
  }
}

function aiReturns(topics: Array<Record<string, unknown>>) {
  h.runAiTask.mockResolvedValue({
    runId: "run-1",
    status: "succeeded",
    parsed: { topics },
    errorMessage: null,
  })
}

const REQ = { seasonId: "season-1", language: "ar" as const, count: 10 }

beforeEach(() => {
  h.runAiTask.mockReset()
  h.persisted = []
  h.completed = []
  h.inputs = inputs()
  h.settings = { hybrid_performance_hint: false }
  seq = 0
})

describe("#4 ai_runs subject ids for the topic call", () => {
  it("passes season_id AND the generation id as the subject", async () => {
    aiReturns([topic()])
    await generateHybridTopics(REQ)
    const call = h.runAiTask.mock.calls[0][0]
    expect(call.seasonId).toBe("season-1")
    expect(call.subjectTable).toBe("hybrid_topic_generations")
    expect(call.subjectId).toBe("gen-123")
  })
})

describe("#3 duplicate rules report the right code", () => {
  it("an exact in-batch repeat is in_batch_duplicate, not near_dup_khat_map", async () => {
    const t = topic()
    aiReturns([t, { ...t }])
    const r = await generateHybridTopics(REQ)
    expect(r.rejection_summary).toEqual({ in_batch_duplicate: 1 })
    expect(r.rejected[0].rejection_reasons).toEqual(["in_batch_duplicate"])
  })

  it("near_dup_consumed_original now fires against consumed original titles", async () => {
    h.inputs = inputs({ consumed_original_titles: ["الأب الذي لم يقل أحبك لابنه قط"] })
    aiReturns([topic({ title: "الأب الذي لم يقل أحبك لابنه قط" })])
    const r = await generateHybridTopics(REQ)
    expect(r.rejected[0].rejection_reasons).toContain("near_dup_consumed_original")
    expect(r.rejected[0].rejection_reasons).not.toContain("near_dup_khat_map")
  })

  it("the judge reads the FULL candidate list, not the prompt's capped one", async () => {
    // 200 candidate titles; the prompt list is capped at 120 — the duplicate
    // sits past the cap and must still be caught.
    const many = Array.from({ length: 200 }, (_, i) => `عنوان قديم رقم ${i} عن موضوع مختلف تماماً ${i}`)
    many[180] = "الطبيب الذي فقد ابنه في غرفة العمليات"
    h.inputs = inputs({ khat_map_titles: many, excluded_titles: many.slice(0, 120) })
    aiReturns([topic({ title: "الطبيب الذي فقد ابنه في غرفة العمليات" })])
    const r = await generateHybridTopics(REQ)
    expect(r.rejected[0]?.rejection_reasons).toContain("near_dup_khat_map")
  })
})

describe("#18 published episodes are excluded", () => {
  it("rejects a topic that re-proposes a published episode", async () => {
    h.inputs = inputs({ published_episode_titles: ["قصة الأسير السابق ناصر سالمين و أحداث الإعتقالات في العراق"] })
    aiReturns([topic({ title: "قصة الأسير السابق ناصر سالمين وأحداث الاعتقالات في العراق" })])
    const r = await generateHybridTopics(REQ)
    expect(r.rejected[0].rejection_reasons).toContain("near_dup_published_episode")
    expect(r.accepted).toHaveLength(0)
  })
})

describe("#16 an original is consumed only when its idea was used", () => {
  const ORIGINALS = [
    { id: "ot-new", title: "أ", lens: "unspoken_grief", philosophical_frame: "", conflict: "", emotional_hook: "" },
    { id: "ot-old", title: "ب", lens: "unspoken_grief", philosophical_frame: "", conflict: "", emotional_hook: "" },
  ]

  it("same lens, no id → nothing consumed (used to consume the newest same-lens row)", async () => {
    h.inputs = inputs({ original_topics: ORIGINALS })
    aiReturns([topic({ original_lens: "unspoken_grief", original_topic_id: "none" })])
    const r = await generateHybridTopics(REQ)
    expect(r.accepted[0].consumed_original_topic_id).toBeNull()
  })

  it("a named id from the feed is consumed — exactly that one", async () => {
    h.inputs = inputs({ original_topics: ORIGINALS })
    aiReturns([topic({ original_lens: "unspoken_grief", original_topic_id: "ot-old" })])
    const r = await generateHybridTopics(REQ)
    expect(r.accepted[0].consumed_original_topic_id).toBe("ot-old")
  })

  it("an id that was not in the feed is ignored", async () => {
    h.inputs = inputs({ original_topics: ORIGINALS })
    aiReturns([topic({ original_topic_id: "invented-id" })])
    const r = await generateHybridTopics(REQ)
    expect(r.accepted[0].consumed_original_topic_id).toBeNull()
  })
})

describe("#6 prompt variety rules are enforced as ranking constraints", () => {
  it("lens over 40% → extras demoted + flagged, never dropped", async () => {
    // 10 topics, 6 on one lens → cap 4: two demoted to the end.
    const ts = Array.from({ length: 10 }, (_, i) =>
      topic({
        original_lens: i < 6 ? "hidden_shame" : "none",
        archetype: ["personal_story", "hidden_world", "contrarian", "taboo", "reframe"][i % 5],
        scores: { worth_telling: 10 - i * 0.5, human_experience: 8, practical_value: 7, segment_fit: 7, library_value: 7, guest_findability: 7 },
      }),
    )
    aiReturns(ts)
    const r = await generateHybridTopics(REQ)
    expect(r.accepted).toHaveLength(10)
    const flagged = r.accepted.filter((t) => t.diversity_flags?.includes("lens_over_cap"))
    expect(flagged).toHaveLength(2)
    // Demoted to the tail.
    expect(r.accepted.slice(-2).every((t) => t.diversity_flags?.includes("lens_over_cap"))).toBe(true)
    // At most 4 of that lens ahead of the demoted tail.
    expect(r.accepted.slice(0, 8).filter((t) => t.original_lens === "hidden_shame")).toHaveLength(4)
  })

  it("'none' is exempt from the lens cap", async () => {
    aiReturns(Array.from({ length: 6 }, (_, i) => topic({ original_lens: "none", archetype: ["personal_story", "hidden_world", "contrarian", "taboo", "reframe", "big_idea"][i] })))
    const r = await generateHybridTopics(REQ)
    expect(r.accepted.some((t) => t.diversity_flags?.length)).toBe(false)
  })

  it("the first positions span distinct archetypes; a batch under 4 shapes is warned", async () => {
    const ts = [
      topic({ archetype: "personal_story", scores: { worth_telling: 10, human_experience: 10, practical_value: 10, segment_fit: 10, library_value: 10, guest_findability: 10 } }),
      topic({ archetype: "personal_story", scores: { worth_telling: 9, human_experience: 9, practical_value: 9, segment_fit: 9, library_value: 9, guest_findability: 9 } }),
      topic({ archetype: "hidden_world", scores: { worth_telling: 5, human_experience: 5, practical_value: 5, segment_fit: 5, library_value: 5, guest_findability: 5 } }),
    ]
    aiReturns(ts)
    const r = await generateHybridTopics(REQ)
    expect(r.accepted.map((t) => (t as { archetype?: string }).archetype)).toEqual(["personal_story", "hidden_world", "personal_story"])
    expect(r.diversity_warnings).toContain("archetype_span_below_min")
  })
})

describe("#15 stale market signals are declared", () => {
  it("prompt labels old signals and the result carries the staleness", async () => {
    h.inputs = inputs({ market_freshness: { status: "stale", age_hours: 191 } })
    aiReturns([topic()])
    const r = await generateHybridTopics(REQ)
    const user = h.runAiTask.mock.calls[0][0].prompt[1].content as string
    expect(user).toMatch(/These signals are OLD \(last collected 8 day\(s\) ago\)/)
    expect(r.market_signals_stale).toMatchObject({ status: "stale", age_hours: 191, withheld: false })
  })

  it("fresh signals carry no staleness note", async () => {
    aiReturns([topic()])
    const r = await generateHybridTopics(REQ)
    const user = h.runAiTask.mock.calls[0][0].prompt[1].content as string
    expect(user).not.toMatch(/OLD/)
    expect(r.market_signals_stale).toBeNull()
  })
})

describe("#17 performance memory — behind a flag, default OFF", () => {
  const REPORT = {
    ...EMPTY_REPORT,
    strong_topic_domains: [
      { key: "relationships", sample_size: 6, mean_score: 0.7, median_views: 123456 },
      { key: "parenting", sample_size: 3, mean_score: 0.8, median_views: 50 },
    ],
    weak_topic_domains: [{ key: "technology_ai", sample_size: 7, mean_score: 0.2, median_views: 999 }],
  }

  it("is NOT in the prompt by default (archive over views)", async () => {
    h.inputs = inputs({ worked_report: REPORT })
    aiReturns([topic()])
    await generateHybridTopics(REQ)
    const user = h.runAiTask.mock.calls[0][0].prompt[1].content as string
    expect(user).not.toContain("drew more viewers")
    expect(user).not.toContain("relationships (6 episodes)")
  })

  it("when switched on: honest label, strong only, sample ≥ 5, never view counts", async () => {
    h.settings = { hybrid_performance_hint: true }
    h.inputs = inputs({ worked_report: REPORT })
    aiReturns([topic()])
    await generateHybridTopics(REQ)
    const user = h.runAiTask.mock.calls[0][0].prompt[1].content as string
    expect(user).toContain("drew more viewers (views-weighted)")
    expect(user).toContain("relationships (6 episodes)")
    expect(user).not.toContain("parenting") // sample 3 < 5
    expect(user).not.toContain("technology_ai") // no weak list
    expect(user).not.toContain("landed quietly")
    expect(user).not.toContain("123456")
  })
})

describe("#5 (review) signals older than 14 days are not sent at all", () => {
  it("withholds the clusters, records why, and warns", async () => {
    h.inputs = inputs({ market_freshness: { status: "stale", age_hours: 15 * 24 } })
    aiReturns([topic()])
    const r = await generateHybridTopics(REQ)
    const user = h.runAiTask.mock.calls[0][0].prompt[1].content as string
    expect(user).not.toContain("- relationships (ar)")
    expect(r.market_signals_stale).toMatchObject({ withheld: true })
    const { openGenerationLog } = await import("@/lib/hybrid-topics/persist")
    const snap = vi.mocked(openGenerationLog).mock.calls.at(-1)![0].inputSnapshot as unknown as Record<string, unknown>
    expect(snap.market_clusters_withheld).toBe("stale_over_14_days")
    expect(snap.market_cluster_count).toBe(0)
  })

  it("8-day-old signals are still sent, labelled OLD", async () => {
    h.inputs = inputs({ market_freshness: { status: "stale", age_hours: 191 } })
    aiReturns([topic()])
    const r = await generateHybridTopics(REQ)
    const user = h.runAiTask.mock.calls[0][0].prompt[1].content as string
    expect(user).toContain("- relationships (ar)")
    expect(r.market_signals_stale).toMatchObject({ withheld: false })
  })
})

describe("#9 (review) one SOFT HINTS block, no header conflict", () => {
  it("soft inputs sit under one strongest → weakest heading; originals defer to rule 3", async () => {
    h.inputs = inputs({
      original_topics: [{ id: "ot-1", title: "أ", lens: "unspoken_grief", philosophical_frame: "", conflict: "c", emotional_hook: "h" }],
    })
    aiReturns([topic()])
    await generateHybridTopics(REQ)
    const user = h.runAiTask.mock.calls[0][0].prompt[1].content as string
    expect(user).toContain("SOFT HINTS — strongest → weakest")
    const iOrig = user.indexOf("FRESH ORIGINAL TOPICS")
    const iTaste = user.indexOf("EDITORIAL TASTE HINTS")
    const iMarket = user.indexOf("MARKET CLUSTERS")
    expect(iOrig).toBeGreaterThan(user.indexOf("SOFT HINTS"))
    expect(iOrig).toBeLessThan(iTaste)
    expect(iTaste).toBeLessThan(iMarket)
    expect(user).not.toContain("set original_topic_id to its id and original_lens to its lens")
    expect(user).toContain("original_lens follows rule 3")
  })
})
