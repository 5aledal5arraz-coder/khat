/**
 * Batch 2 — «دستور خط» wired everywhere + topic & guest sourcing redesign.
 * Approved by Khaled 2026-09-28. Pure / mocked: no network, no paid AI.
 *
 *   1. The constitution is data: 7 doors, 50+ unique fields, two segments.
 *   2. Guard: the constitution is the FIRST system block of every topic
 *      generator (hybrid, original thinking, season batch / editorial /
 *      guest-anchored). Discovery propose + prep_v2 are pinned in their own
 *      suites (story-first.test.ts, prep-v2-course-format.test.ts).
 *   3. Exploration: forbidden territories are NEVER sampled; no field repeats
 *      in a batch; both segments appear; a 7-slot batch touches all 7 doors.
 *   4. Policy (T5): lexicon + model flags reject, in both directions.
 *   5. Hybrid: scores only order (no weak-score reject, no depth/view bonus),
 *      Kuwaiti framing is no longer a reject, market clusters are filtered.
 *   6. Discovery: harvest guard, X list filter + 402 degradation, self_told,
 *      witness coercion.
 */

import { describe, expect, it, vi } from "vitest"
import {
  KHAT_CONSTITUTION_MARKER,
  KHAT_DOORS,
  KHAT_FIELDS,
  KHAT_SEGMENTS,
  khatConstitutionBlock,
  khatConstitutionPrompt,
} from "@/lib/khat-map/core/constitution"
import { judgePolicy, lexiconPolicyHits, normalizeSensitivityFlags } from "@/lib/khat-map/core/policy"
import { buildHybridTopicsPrompt } from "@/lib/ai/prompts/hybrid-topics"
import { buildOriginalThinkingPrompt } from "@/lib/ai/prompts/original-thinking"
import { buildBatchSystemPrompt, buildGuestAnchoredSystemPrompt } from "@/lib/khat-map/v2/prompts"
import { buildEditorialSystemPrompt, buildKnowledgeUniverseBlock } from "@/lib/khat-map/v2/prompts-editorial"
import { buildExplorationFrames } from "@/lib/khat-map/v2/exploration"
import {
  ALL_SUBCATEGORY_IDS,
  FORBIDDEN_TERRITORY_IDS,
  subcategoryLabel,
} from "@/lib/khat-map/v2/knowledge-universe"
import { applyEditorialFilters } from "@/lib/khat-map/v2/editorial-filter"
import { judgeHybridCandidate, type HybridCandidate } from "@/lib/hybrid-topics/reject"
import { clampTopicScores, khatTopicScore, rescoreHybridCandidate } from "@/lib/hybrid-topics/scoring"
import { eligibleMarketClusters } from "@/lib/hybrid-topics/inputs"
import { coerceCandidate } from "@/lib/hybrid-topics/generate"
import { judgeCandidate } from "@/lib/original-thinking/novelty"
import { verifyHarvest } from "@/lib/discovery-v2/harvest"
import { selectXCandidates, topicTerms } from "@/lib/discovery-v2/sources/x-lists"
import { verifyStoryClassification } from "@/lib/discovery-v2/story-classify"
import { scoreCandidate, storyScore } from "@/lib/discovery-v2/score"
import { coerceWitnessProfiles } from "@/lib/discovery-v2/witness"
import type { CandidateGenInput, RawCandidate } from "@/lib/khat-map/v2/types"
import type { StorySource } from "@/lib/discovery-v2/types"
import type { XListMember } from "@/lib/x/client"
import { KHAT_EDITORIAL_CONTROLS_DEFAULTS } from "@/types/khat-map"

vi.mock("@/lib/db", () => ({ db: null }))

function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const WORKED = {
  generated_at: "2026-09-28T00:00:00.000Z",
  strong_topic_domains: [],
  weak_topic_domains: [],
  top_episodes: [],
  weak_episodes: [],
  strong_episode_types: [],
  weak_episode_types: [],
  strong_guests: [],
  recommendations: [],
}

const TASTE = {
  user_id: "",
  preferred_domains: [],
  rejected_patterns: [],
  depth_score: 0.5,
  controversy_tolerance: 0.5,
  emotional_preference: 0.5,
  kuwait_relevance_weight: 0.5,
  total_decisions: 0,
  last_recomputed_at: null,
  created_at: "2026-09-28T00:00:00.000Z",
  updated_at: "2026-09-28T00:00:00.000Z",
}

function genInput(over: Partial<CandidateGenInput> = {}): CandidateGenInput {
  return {
    season_id: "s1",
    target_count: 8,
    season_target: 10,
    accepted_domain_counts: {} as CandidateGenInput["accepted_domain_counts"],
    accepted_titles: [],
    rejected_titles: [],
    rejected_reason_categories: [],
    taste_profile: TASTE,
    invasion_policy: "optional",
    editorial_controls: KHAT_EDITORIAL_CONTROLS_DEFAULTS,
    phase: "topics",
    extra_system_blocks: [],
    ...over,
  }
}

// ─── 1. The constitution as data ─────────────────────────────────────────────

describe("constitution data", () => {
  it("7 doors, 50+ fields with globally unique ids, two segments with concerns", () => {
    expect(KHAT_DOORS).toHaveLength(7)
    expect(KHAT_FIELDS.length).toBeGreaterThanOrEqual(50)
    expect(new Set(KHAT_FIELDS.map((f) => f.id)).size).toBe(KHAT_FIELDS.length)
    expect(KHAT_SEGMENTS.map((s) => s.id)).toEqual(["20_35", "35_60"])
    for (const s of KHAT_SEGMENTS) expect(s.concerns_ar.length).toBeGreaterThanOrEqual(5)
  })

  it("full carries every field; compact carries the rules but no field list", () => {
    const full = khatConstitutionBlock("full")
    const compact = khatConstitutionBlock("compact")
    for (const f of KHAT_FIELDS) expect(full).toContain(f.label_ar)
    for (const b of [full, compact]) {
      expect(b.startsWith(KHAT_CONSTITUTION_MARKER)).toBe(true)
      expect(b).toContain("نتجنب قطعياً: السياسة، الخلافات الدينية والمذهبية، الفضائح، التعدي على الخصوصية")
      expect(b).toContain("الشهرة ليست معياراً")
      expect(b).toContain("حلقة الغزو/الذاكرة الوطنية: اختيارية")
      expect(b).toContain("لا حصص ثابتة")
    }
    expect(compact).not.toContain("الكفالة والتبني")
    expect(compact.length).toBeLessThan(full.length / 2)
  })

  it("the season preamble makes invasion optional by default and drops the retired must-includes", () => {
    const p = khatConstitutionPrompt()
    expect(p).toContain("OPTIONAL")
    expect(p).not.toContain("mass-audience")
    expect(p).not.toContain("bold / controversial")
    expect(khatConstitutionPrompt("excluded")).toContain("EXCLUDED")
  })
})

// ─── 2. Guard: the constitution is the FIRST block of every generator ────────

describe("guard — the constitution opens every generator's system prompt", () => {
  const full = khatConstitutionBlock("full")

  it("hybrid topics", () => {
    const built = buildHybridTopicsPrompt({
      language: "ar",
      count: 6,
      allowKuwaitBias: false,
      originalTopics: [],
      marketClusters: [],
      workedReport: WORKED,
      tasteHints: [],
      excludedTitles: [],
      lenses: [],
      explorationFrames: buildExplorationFrames({ count: 6, rng: seededRng(1) }),
    })
    expect(built.system.startsWith(full)).toBe(true)
    expect(built.system).toContain("sensitivity_flags")
    expect(built.system).toContain("worth_telling")
  })

  it("original thinking", () => {
    const built = buildOriginalThinkingPrompt({
      language: "ar",
      count: 4,
      lenses: [],
      excludedTitles: [],
      allowKuwaitBias: false,
    })
    expect(built.system.startsWith(full)).toBe(true)
  })

  it("season wizard: batch, editorial and guest-anchored", () => {
    expect(buildBatchSystemPrompt(genInput()).startsWith(full)).toBe(true)
    expect(buildEditorialSystemPrompt(genInput()).startsWith(full)).toBe(true)
    const anchored = buildGuestAnchoredSystemPrompt({
      guest_profile: {
        full_name: "ضيف",
        display_name: null,
        inferred_bio: "",
        profession: null,
        gender: "male",
        country: "الكويت",
        city: null,
        expertise_domains: [],
        editorial_angle: "",
        confidence: 0.5,
      } as never,
      angle_count: 3,
      rejected_titles: [],
      taste_profile: TASTE,
      editorial_controls: KHAT_EDITORIAL_CONTROLS_DEFAULTS,
    })
    expect(anchored.startsWith(full)).toBe(true)
  })

  it("the editorial prompt no longer offers mass_audience or the retired must-include", () => {
    const sys = buildEditorialSystemPrompt(genInput())
    expect(sys).not.toContain('"mass_audience"')
    expect(sys).not.toContain("at least one bold, debatable episode")
    expect(sys).not.toContain("A safe batch is a failed batch")
  })
})

// ─── 3. Exploration frames ──────────────────────────────────────────────────

describe("exploration — policy + variety", () => {
  it("forbidden territories are NEVER sampled (200 seeds × 12 slots)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const f of buildExplorationFrames({ count: 12, rng: seededRng(seed) })) {
        expect(FORBIDDEN_TERRITORY_IDS.has(f.territory.id)).toBe(false)
      }
    }
  })

  it("…not even when every allowed territory is already used", () => {
    const used = new Set(ALL_SUBCATEGORY_IDS)
    for (let seed = 1; seed <= 30; seed++) {
      for (const f of buildExplorationFrames({ count: 10, usedTerritoryIds: used, rng: seededRng(seed) })) {
        expect(FORBIDDEN_TERRITORY_IDS.has(f.territory.id)).toBe(false)
      }
    }
  })

  it("the generation menu never offers a forbidden territory (sight: they exist in the universe)", () => {
    const menu = buildKnowledgeUniverseBlock()
    expect(FORBIDDEN_TERRITORY_IDS.size).toBeGreaterThanOrEqual(15)
    for (const id of FORBIDDEN_TERRITORY_IDS) {
      expect(ALL_SUBCATEGORY_IDS).toContain(id)
      expect(menu).not.toContain(` ${id} — `)
    }
    expect(menu).toContain(" survival_stories — ")
    expect(subcategoryLabel("religion_and_doubt")).toBe("الدين والشك") // stored rows still resolve
  })

  it("no field repeats in a batch; both segments appear; 7 slots touch all 7 doors", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const frames = buildExplorationFrames({ count: 7, rng: seededRng(seed) })
      expect(new Set(frames.map((f) => f.field.id)).size).toBe(7)
      expect(new Set(frames.map((f) => f.field.door)).size).toBe(7)
      expect(new Set(frames.map((f) => f.segment.id)).size).toBe(2)
      for (const f of frames) {
        const seg = KHAT_SEGMENTS.find((s) => s.id === f.segment.id)!
        expect(seg.concerns_ar).toContain(f.segment.concern_ar)
      }
    }
  })

  it("white-space themes obey the policy too (forbidden slug or policy text never sampled)", () => {
    const ws = [
      { slug: "kuwait-politics", label_ar: "السياسة الكويتية ومجلس الأمة", description_ar: null },
      { slug: "geopolitical_shifts", label_ar: "تحوّلات", description_ar: null },
      { slug: "sects", label_ar: "الخلافات المذهبية", description_ar: null },
      { slug: "pearl-diving", label_ar: "ذاكرة الغوص", description_ar: "بعيداً عن السياسة" },
    ]
    let pearl = 0
    for (let seed = 1; seed <= 200; seed++) {
      for (const f of buildExplorationFrames({ count: 8, whiteSpace: ws, rng: seededRng(seed) })) {
        expect(["kuwait-politics", "geopolitical_shifts", "sects"]).not.toContain(f.territory.id)
        if (f.territory.id === "pearl-diving") pearl++
      }
    }
    expect(pearl).toBeGreaterThan(0) // sight: allowed white space is still drawn
  })

  it("two slots already carry both segments", () => {
    const frames = buildExplorationFrames({ count: 2, rng: seededRng(9) })
    expect(new Set(frames.map((f) => f.segment.id)).size).toBe(2)
  })
})

// ─── 4. Policy (T5) ─────────────────────────────────────────────────────────

describe("policy lexicon + model flags", () => {
  it("catches politics, religious dispute and scandal", () => {
    expect(lexiconPolicyHits("الانتخابات البرلمانية ومستقبل المعارضة")).toContain("politics")
    expect(lexiconPolicyHits("قصتي مع العمل السياسي")).toContain("politics")
    expect(lexiconPolicyHits("الفتنة الطائفية بين الجيران")).toContain("religious_dispute")
    expect(lexiconPolicyHits("السنة والشيعة في بيت واحد")).toContain("religious_dispute")
    expect(lexiconPolicyHits("فضيحة مالية هزّت السوق")).toContain("scandal")
    expect(lexiconPolicyHits("The parliament election")).toContain("politics")
  })

  it("lets the constitution's own fields through (no false positives)", () => {
    for (const ok of [
      "الحروب واللجوء",
      "الأسر والمعتقلات",
      "الإيمان كتجربة شخصية",
      "الألم الحاد بعد الحادث",
      "رحلة إلى الطائف",
      "تركت الوظيفة الحكومية وبدأت مشروعي",
      "رمضان في الغربة",
      "نائب المدير الذي استقال",
      ...KHAT_FIELDS.map((f) => f.label_ar),
    ]) {
      expect(lexiconPolicyHits(ok)).toEqual([])
    }
  })

  // QA (noura, 2026-09-28) — table-driven, both directions.
  const MUST_PASS: string[] = [
    // «سياسة» in its everyday sense — the heart of العمل والمال
    "السياسة المالية للأسرة",
    "سياسة الادخار",
    "سياسات التسعير في مشروعي الصغير",
    "سياسة الشركة العائلية في توزيع الأرباح",
    // negated mentions
    "بعيداً عن السياسة",
    "تجربة إنسانية بعيداً عن السياسة، عن أب وابنه",
    "نتجنب الجدل الديني",
    "بلا تشهير ولا فضيحة، يروي تجربته",
    "لا علاقة لها بالانتخابات: قصة كفاح",
    // lesser false positives
    "الانتخاب الطبيعي",
    "برلمان الطلبة",
    "مذهبي في الحياة",
    "تسريبات المياه",
    "التشهير بي… وكيف تعافيت",
  ]
  const MUST_HIT: Array<[string, string]> = [
    ["السياسة الكويتية من الداخل", "politics"],
    ["العمل السياسي في شبابي", "politics"],
    ["الأحزاب في الوطن العربي", "politics"],
    ["الانتخابات البرلمانية القادمة", "politics"],
    ["مجلس الأمة والحكومة", "politics"],
    ["النواب والحكومة", "politics"],
    ["الإخوان المسلمين", "religious_dispute"],
    ["السلفية والصوفية", "religious_dispute"],
    ["البدعة في العبادات", "religious_dispute"],
    ["الخلافات المذهبية في الأسرة", "religious_dispute"],
    ["فضيحة مالية هزّت السوق", "scandal"],
    // a negation elsewhere does not launder the positive clause
    ["بعيداً عن الضجيج، الانتخابات البرلمانية من الداخل", "politics"],
  ]
  it.each(MUST_PASS)("passes: %s", (text) => {
    expect(lexiconPolicyHits(text)).toEqual([])
  })
  it.each(MUST_HIT)("hits: %s → %s", (text, cat) => {
    expect(lexiconPolicyHits(text)).toContain(cat)
  })

  it("model flags reject; unknown flags are ignored", () => {
    expect(normalizeSensitivityFlags(["Politics", "grief", "privacy_intrusion"])).toEqual([
      "politics",
      "privacy_intrusion",
    ])
    expect(judgePolicy("قصة إنسانية عن الأبوة", ["privacy_intrusion"]).ok).toBe(false)
    expect(judgePolicy("قصة إنسانية عن الأبوة", ["grief"]).ok).toBe(true)
  })

  it("the season editorial filter drops a policy hit before anything else", () => {
    const card = (title: string, flags: string[] = []) =>
      ({
        topic: { working_title: title, description: "", hook: "", topic_domain: "none", sensitivity_flags: flags },
        guest: null,
      }) as unknown as RawCandidate
    const r = applyEditorialFilters(
      [card("انتخابات مجلس الأمة من الداخل"), card("أب ربّى أبناءه وحده"), card("بيت العائلة", ["privacy_intrusion"])],
      KHAT_EDITORIAL_CONTROLS_DEFAULTS,
    )
    expect(r.kept.map((c) => c.topic.working_title)).toEqual(["أب ربّى أبناءه وحده"])
    expect(r.dropped.map((d) => d.reason)).toEqual(["policy_avoid", "policy_avoid"])
  })
})

// ─── 5. Hybrid ──────────────────────────────────────────────────────────────

const HOOK = "في الليلة التي أغلق فيها محلّه للمرة الأخيرة، جلس وحده يعدّ ما تبقّى"
const CONFLICT = "بين الخجل من الفشل أمام العائلة والرغبة في البدء من جديد قبل فوات العمر"

function hybrid(over: Partial<HybridCandidate> = {}): HybridCandidate {
  return {
    title: "الدكّان الذي أغلقه أبي",
    why_it_matters: "تجربة خسارة تجارية وبداية جديدة",
    why_now: "كثيرون يبدأون مشاريع صغيرة اليوم",
    emotional_hook: HOOK,
    conflict_angle: CONFLICT,
    market_inspiration: "none",
    original_lens: "none",
    suggested_episode_type: "personal_story",
    suggested_topic_domain: "money_career",
    estimated_strength_score: 0.1,
    ...over,
  }
}

const JUDGE = {
  excludedTitles: [],
  validLensKeys: new Set(["none"]),
  allowKuwaitBias: false,
  khatMapTitles: [],
  consumedOriginalTitles: [],
  validEpisodeTypes: new Set(["personal_story"]),
  validTopicDomains: new Set(["money_career"]),
}

describe("hybrid — policy, ordering, audience", () => {
  it("a low self-score no longer rejects (scores only ORDER)", () => {
    expect(judgeHybridCandidate(hybrid({ estimated_strength_score: 0.05 }), JUDGE).ok).toBe(true)
  })

  it("Kuwaiti framing is no longer a reject (the audience rule replaced the ban)", () => {
    const c = hybrid({ title: "الدكّان الكويتي الذي أغلقه أبي في الكويت" })
    expect(judgeHybridCandidate(c, JUDGE).reasons).not.toContain("kuwait_bias")
    expect(
      judgeCandidate(
        { title: c.title, lens: "none", philosophical_frame: "", conflict: CONFLICT, emotional_hook: HOOK },
        JUDGE,
      ).reasons,
    ).not.toContain("kuwait_bias")
  })

  it("the lexicon and the model flags each reject on their own", () => {
    expect(judgeHybridCandidate(hybrid({ title: "كواليس الانتخابات" }), JUDGE).reasons).toContain("policy_avoid")
    expect(judgeHybridCandidate(hybrid({ sensitivity_flags: ["scandal"] }), JUDGE).reasons).toContain(
      "policy_flagged",
    )
    expect(judgeHybridCandidate(hybrid(), JUDGE).ok).toBe(true)
  })

  it("coerceCandidate reads scores + flags; worth_telling leads the ordering", () => {
    const worth = coerceCandidate({
      title: "ت",
      scores: { worth_telling: 10, human_experience: 6, practical_value: 6, segment_fit: 6, library_value: 6, guest_findability: 6 },
      sensitivity_flags: ["politics", "noise"],
    })
    const novel = coerceCandidate({
      title: "ت",
      scores: { worth_telling: 4, human_experience: 6, practical_value: 6, segment_fit: 6, library_value: 6, guest_findability: 10 },
    })
    expect(worth.sensitivity_flags).toEqual(["politics"])
    expect(worth.estimated_strength_score).toBeGreaterThan(novel.estimated_strength_score)
    // A reply without scores falls back to the legacy 0..1 self-rating.
    expect(coerceCandidate({ title: "ت", estimated_strength_score: 0.42 }).estimated_strength_score).toBe(0.42)
    expect(clampTopicScores({})).toBeNull()
  })

  it("no depth (character-count) or view bonus: longer text scores the same", () => {
    const scores = clampTopicScores({ worth_telling: 7, human_experience: 7 })!
    const short = rescoreHybridCandidate(hybrid({ scores }), { batchLensCounts: new Map() })
    const long = rescoreHybridCandidate(
      hybrid({ scores, why_it_matters: "x".repeat(400), conflict_angle: "y".repeat(400) }),
      { batchLensCounts: new Map() },
    )
    expect(long).toBe(short)
    expect(short).toBeCloseTo(khatTopicScore(scores), 3)
  })

  it("market clusters: ar/en only, policy-clean, requested language first", () => {
    const c = (label: string, language: string, hooks: string[] = []) => ({
      label,
      language,
      signal_count: 1,
      dominant_emotions: [],
      median_view_signal: null,
      source_breakdown: {},
      narrative_hooks: hooks,
    })
    const pool = [
      c("الأبوة الجديدة", "ar"),
      c("فرنسي", "fr"),
      c("الانتخابات القادمة", "ar"),
      c("ok", "ar", ["فضيحة المشاهير"]),
      c("fatherhood", "en"),
    ]
    expect(eligibleMarketClusters(pool, "ar").map((x) => x.label)).toEqual(["الأبوة الجديدة"])
    expect(eligibleMarketClusters(pool, "en").map((x) => x.label)).toEqual(["fatherhood"])
    expect(eligibleMarketClusters([c("فرنسي", "fr")], "ar")).toEqual([])
  })

  it("the prompt caps market-sourced topics at ~15% and sends labels only", () => {
    const built = buildHybridTopicsPrompt({
      language: "ar",
      count: 10,
      allowKuwaitBias: false,
      originalTopics: [],
      marketClusters: [
        {
          label: "الأبوة الجديدة",
          language: "ar",
          signal_count: 99,
          dominant_emotions: ["fear"],
          median_view_signal: 123456,
          source_breakdown: {},
          narrative_hooks: ["عنوان فيروسي"],
        },
      ],
      workedReport: WORKED,
      tasteHints: [],
      excludedTitles: [],
      lenses: [],
    })
    expect(built.system).toContain("At most 1 topic(s)")
    expect(built.user).toContain("- الأبوة الجديدة (ar)")
    expect(built.user).not.toContain("123456")
    expect(built.user).not.toContain("عنوان فيروسي")
    expect(built.user).not.toContain("PERFORMANCE LEARNING")
  })
})

// ─── 6. Discovery ───────────────────────────────────────────────────────────

const Q = "أنا خالد سعد العنزي خسرت تجارتي كلها ثم بدأت من الصفر في سوق المباركية"
const SRC: StorySource = {
  kind: "web",
  title: "مقابلة الراي",
  url: "https://alrai.com/x",
  domain: "alrai.com",
  text: `في حديثه قال: ${Q} قبل عشر سنوات`,
  verified: true,
}

describe("D1 harvest guard (verifyHarvest)", () => {
  it("keeps a verbatim, named, live quote — and carries its sources", () => {
    const names = verifyHarvest({ people: [{ name: "خالد سعد العنزي", source: 1, quote: Q, story_claim: "خسر تجارته" }] }, [SRC])
    expect(names).toHaveLength(1)
    expect(names[0].origin).toBe("harvest_web")
    expect(names[0].public_account_ref).toBe(SRC.url)
    expect(names[0].harvest_sources).toEqual([SRC])
  })

  it("drops a paraphrase, a dead source, a one-word name, and a political quote", () => {
    const person = { name: "خالد سعد العنزي", source: 1, quote: Q }
    expect(verifyHarvest({ people: [{ ...person, quote: "خالد سعد العنزي فقد كل تجارته ثم نهض من جديد" }] }, [SRC])).toEqual([])
    expect(verifyHarvest({ people: [person] }, [{ ...SRC, verified: false }])).toEqual([])
    expect(verifyHarvest({ people: [{ ...person, name: "العنزي" }] }, [SRC])).toEqual([])
    const pol = "أنا خالد سعد العنزي خسرت الانتخابات البرلمانية ثم عدت إلى تجارتي"
    expect(verifyHarvest({ people: [{ ...person, quote: pol }] }, [{ ...SRC, text: pol }])).toEqual([])
  })
})

function member(over: Partial<XListMember & { via: string }> = {}): XListMember & { via: string } {
  return {
    id: "1",
    username: "u1",
    name: "فهد ناصر",
    description: "معلم كويتي، أكتب عن تربية الأبناء والمراهقة",
    verified: false,
    followers: 1000,
    following: 100,
    tweet_count: 10,
    created_at: null,
    location: "الكويت",
    listed_count: 20,
    via: "Education",
    ...over,
  }
}

describe("D5 X list harvest (selectXCandidates)", () => {
  const terms = topicTerms("تربية الأبناء في زمن الشاشات")
  const none = () => false

  it("keeps an on-topic Kuwaiti individual and ranks by list density, not followers", () => {
    const out = selectXCandidates(
      [
        member({ id: "a", name: "مشهور كبير", followers: 500_000, listed_count: 300 }),
        member({ id: "b", name: "معلم هادئ", followers: 800, listed_count: 40 }),
      ],
      terms,
      ["kuwait"],
      none,
    )
    expect(out.map((p) => p.name)).toEqual(["معلم هادئ", "مشهور كبير"])
    expect(out[0].origin).toBe("x_list")
    expect(out[0].public_account_ref).toBe("https://x.com/u1")
  })

  it("drops organisations, politicians, off-topic bios, non-Kuwaiti accounts and memory hits", () => {
    const drop = [
      member({ id: "o", name: "جريدة الأبناء", description: "جريدة كويتية عن تربية الأبناء" }),
      member({ id: "p", description: "عضو مجلس الأمة سابقاً، مهتم بتربية الأبناء" }),
      member({ id: "t", description: "مهندس كويتي مهتم بالسيارات والمحركات" }),
      member({ id: "k", location: "الرياض", description: "معلم، أكتب عن تربية الأبناء والمراهقة" }),
    ]
    expect(selectXCandidates(drop, terms, ["kuwait"], none)).toEqual([])
    expect(selectXCandidates([member()], terms, ["kuwait"], () => true)).toEqual([])
    expect(selectXCandidates([member()], terms, ["kuwait"], none)).toHaveLength(1) // sight
  })

  it("real family names that merely CONTAIN an org word survive (whole-word match)", () => {
    const names = ["أحمد القناعي", "محمد الجامع", "خالد المجلي", "سعد العلي", "فهد الشركاوي", "ناصر المركزي"]
    const out = selectXCandidates(
      names.map((name, i) => member({ id: `n${i}`, name })),
      terms,
      ["kuwait"],
      none,
      10,
    )
    expect(out.map((p) => p.name).sort()).toEqual([...names].sort())
    expect(selectXCandidates([member({ name: "مركز التربية" })], terms, ["kuwait"], none)).toEqual([])
    expect(
      selectXCandidates([member({ description: "الحساب الرسمي — نهتم بتربية الأبناء في الكويت" })], terms, ["kuwait"], none),
    ).toEqual([])
  })

  it("topicTerms strips the «و+ال» prefix but keeps a word that starts with و", () => {
    const t = topicTerms("الآباء والأبناء والوحدة")
    expect(t).toContain("ابناء")
    expect(t).toContain("وحده")
    expect(t).not.toContain("والابناء")
  })

  it("a 402 stops X for the rest of the run; the run goes on", async () => {
    vi.resetModules()
    vi.doMock("@/lib/x/client", () => ({
      isXConfigured: () => true,
      getListMembers: vi.fn(async () => ({ members: [], status: 402 })),
    }))
    const { harvestXListNames } = await import("@/lib/discovery-v2/sources/x-lists")
    const r = await harvestXListNames({ topic: "تربية", profiles: [], geography: ["kuwait"], exclude: none })
    expect(r).toMatchObject({ names: [], calls: 1, degraded: "402" })
    vi.doUnmock("@/lib/x/client")
    vi.resetModules()
  })
})

describe("D3 self_told", () => {
  const variants = ["خالد سعد العنزي"]
  const raw = (selfTold: boolean) => ({
    story_type: "first_hand",
    evidence: [{ source: 1, quote: Q }],
    topic_relevance: { value: "on_topic", source: 1, quote: Q },
    self_told: { value: selfTold, source: 1, quote: Q },
    same_person: true,
  })

  it("a verified self-told first-hand story scores fully; told-about-him counts like second hand", () => {
    // 2026-09-29: «told it himself» is proven by the PAGE (here his byline),
    // never by the model's say-so — see tests/discovery-v2/source-page.test.ts.
    const page = { title: "مقابلة الراي", author: "خالد سعد العنزي", text: SRC.text, via: "html" as const }
    const told = verifyStoryClassification(raw(true), [{ ...SRC, page }], variants, null)
    const claimed = verifyStoryClassification(raw(true), [SRC], variants, null)
    const about = verifyStoryClassification(raw(false), [SRC], variants, null)
    expect(told.assessment.self_told?.value).toBe(true)
    expect(claimed.assessment.self_told).toBeNull()
    expect(storyScore(told.assessment)).toBe(0.8)
    expect(storyScore(about.assessment)).toBe(0.5)
    const c = scoreCandidate({ name: "خالد سعد العنزي" }, { resolved: false }, {}, { topic: "الفشل التجاري" }, about)
    expect(c.flags).toContain("story_second_hand")
    expect(c.decision).toBe("needs_review")
  })

  it("self_told without a verbatim quote is not established", () => {
    const r = { ...raw(true), self_told: { value: true, source: 1, quote: "قال إنه روى القصة بنفسه في مقابلة" } }
    expect(verifyStoryClassification(r, [SRC], variants, null).assessment.self_told).toBeNull()
  })
})

describe("D2 witness profiles (coerce)", () => {
  it("keeps real profiles, caps at 6, drops junk", () => {
    const list = Array.from({ length: 8 }, (_, i) => ({
      profile: `رجل كويتي عاش تجربة رقم ${i}`,
      where_told: ["بودكاست", 3],
      search_terms: ["أ", "ب"],
    }))
    const out = coerceWitnessProfiles({ profiles: [{ profile: "قصير" }, null, ...list] })
    expect(out).toHaveLength(6)
    expect(out[0].where_told).toEqual(["بودكاست", "3"])
    expect(coerceWitnessProfiles(null)).toEqual([])
  })
})
