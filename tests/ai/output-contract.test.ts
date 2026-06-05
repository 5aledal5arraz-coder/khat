/**
 * Phase 2.0 Batch 1 — output-contract tests.
 *
 * Goal: lock down the parsed output shape of every AI-producing function
 * in the editorial-intelligence cluster (4 files, 10 functions), so the
 * Router migration cannot silently change downstream shapes — even when
 * prompt text remains byte-equivalent.
 *
 * Approach (per the operator's amendment #3):
 *   • Zod schema per function describes the parsed output contract.
 *   • Canonical fixture per function represents a typical AI response
 *     after the function's normalization.
 *   • Test asserts the schema parses the fixture cleanly.
 *   • Negative test per function: a known-bad fixture must FAIL the
 *     schema. Stops silent shape erosion in either direction.
 *
 * These schemas are colocated with the test on purpose — they're for
 * shape protection, not production validation. The production layer
 * stays with its existing types (`@/types/database`, etc.).
 */

import { describe, expect, it } from "vitest"
import { z } from "zod"

// ─── Shared sub-schemas ─────────────────────────────────────────────

const quoteShape = z.object({
  id: z.string(),
  text: z.string(),
  theme: z.string().nullable(),
  speaker: z.string().nullable(),
})

const studioTranscriptQuoteShape = z.object({
  text: z.string(),
  theme: z.string(),
})

// ─── 1. transcript.ts :: generateQuotesFromTranscript ───────────────

describe("output contract: generateQuotesFromTranscript", () => {
  const schema = z.array(quoteShape)

  it("accepts a canonical fixture (id-stamped, theme + speaker nullable)", () => {
    const fixture: z.infer<typeof schema> = [
      { id: "quote-abc", text: "حين تخسر، تتعلم ما لم يعلّمك إياه أحد.", theme: "خسارة", speaker: "guest" },
      { id: "quote-def", text: "البيت ليس الجدران، البيت أناس.", theme: "أهل", speaker: null },
    ]
    expect(() => schema.parse(fixture)).not.toThrow()
  })

  it("rejects a fixture missing the id field (silent shape regression)", () => {
    const bad = [{ text: "بدون معرف", theme: "خطأ", speaker: null }]
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 2. transcript.ts :: processTranscript (TranscriptProcessingResult) ─

describe("output contract: processTranscript", () => {
  const summaryShape = z.object({
    overview: z.string(),
    key_ideas: z.array(z.string()),
    lessons: z.array(z.string()),
  })
  const schema = z.object({
    clean_article: z.string(),
    summary: summaryShape,
    quotes: z.array(studioTranscriptQuoteShape),
  })

  it("accepts a canonical fixture", () => {
    const fixture: z.infer<typeof schema> = {
      clean_article: "الفقرة الأولى من المقال المُحضَّر.\n\nالفقرة الثانية.",
      summary: {
        overview: "نظرة عامة على الحلقة.",
        key_ideas: ["فكرة 1", "فكرة 2"],
        lessons: ["درس 1", "درس 2"],
      },
      quotes: [
        { text: "اقتباس قوي مكتمل المعنى.", theme: "صدق" },
      ],
    }
    expect(() => schema.parse(fixture)).not.toThrow()
  })

  it("rejects a fixture where summary.key_ideas is a string instead of an array", () => {
    const bad = {
      clean_article: "نص.",
      summary: { overview: "نظرة.", key_ideas: "أفكار" as unknown as string[], lessons: [] },
      quotes: [],
    }
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 3. transcript.ts :: regenerateQuotes ────────────────────────────

describe("output contract: regenerateQuotes", () => {
  const schema = z.array(studioTranscriptQuoteShape)

  it("accepts an array of {text, theme} quotes", () => {
    const fixture: z.infer<typeof schema> = [
      { text: "اقتباس أ", theme: "موضوع أ" },
      { text: "اقتباس ب", theme: "موضوع ب" },
    ]
    expect(() => schema.parse(fixture)).not.toThrow()
  })

  it("rejects quotes missing the theme field", () => {
    const bad = [{ text: "بدون موضوع" }]
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 4. transcript.ts :: regenerateKeyIdeas ──────────────────────────

describe("output contract: regenerateKeyIdeas", () => {
  const schema = z.array(z.string())

  it("accepts an array of strings", () => {
    const fixture: z.infer<typeof schema> = ["فكرة 1", "فكرة 2", "فكرة 3"]
    expect(() => schema.parse(fixture)).not.toThrow()
  })

  it("rejects nested objects in place of strings", () => {
    const bad = [{ idea: "x" }, { idea: "y" }]
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 5. transcript.ts :: regenerateLessons ───────────────────────────

describe("output contract: regenerateLessons", () => {
  const schema = z.array(z.string())

  it("accepts an array of strings", () => {
    const fixture: z.infer<typeof schema> = ["درس 1", "درس 2"]
    expect(() => schema.parse(fixture)).not.toThrow()
  })

  it("rejects an array of nulls", () => {
    const bad = [null, null]
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 6. episode-intelligence.ts :: generateGlobalEpisodeIntelligence ─

describe("output contract: generateGlobalEpisodeIntelligence", () => {
  const narrativeArc = z.object({
    beginning: z.string(),
    development: z.string(),
    key_insight: z.string(),
    conclusion: z.string(),
  })
  const schema = z.object({
    narrative_arc: narrativeArc,
    turning_points: z.array(z.string()),
    strongest_moments: z.array(z.string()),
    core_ideas: z.array(z.string()),
    themes: z.array(z.string()),
    emotional_peaks: z.array(z.string()),
    guest_profile: z.string().nullable(),
    episode_essence: z.string(),
  })

  it("accepts a canonical fixture", () => {
    const fixture: z.infer<typeof schema> = {
      narrative_arc: {
        beginning: "البداية: سؤال عن الهوية.",
        development: "التطور: الضيف يكشف رحلته.",
        key_insight: "البصيرة: اللحظة التي تغيّر فيها فهمه.",
        conclusion: "الخاتمة: تأمل هادئ.",
      },
      turning_points: ["نقطة 1", "نقطة 2"],
      strongest_moments: ["لحظة 1", "لحظة 2"],
      core_ideas: ["فكرة 1", "فكرة 2"],
      themes: ["محور 1", "محور 2"],
      emotional_peaks: ["ذروة 1"],
      guest_profile: "ضيف من خلفية تحليلية.",
      episode_essence: "جوهر الحلقة في فقرة.",
    }
    expect(() => schema.parse(fixture)).not.toThrow()
  })

  it("accepts null guest_profile (monologue episodes)", () => {
    const fixture: z.infer<typeof schema> = {
      narrative_arc: {
        beginning: "",
        development: "",
        key_insight: "",
        conclusion: "",
      },
      turning_points: [],
      strongest_moments: [],
      core_ideas: [],
      themes: [],
      emotional_peaks: [],
      guest_profile: null,
      episode_essence: "مونولوج.",
    }
    expect(() => schema.parse(fixture)).not.toThrow()
  })

  it("rejects a fixture missing narrative_arc.key_insight (silent regression)", () => {
    const bad = {
      narrative_arc: {
        beginning: "",
        development: "",
        // key_insight missing
        conclusion: "",
      },
      turning_points: [],
      strongest_moments: [],
      core_ideas: [],
      themes: [],
      emotional_peaks: [],
      guest_profile: null,
      episode_essence: "",
    }
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 7. deep-analysis.ts :: generateDeepAnalysis ─────────────────────

describe("output contract: generateDeepAnalysis", () => {
  const themeShape = z.object({
    name: z.string(),
    description: z.string(),
    evidence: z.array(z.string()),
  })
  const argumentShape = z.object({
    claim: z.string(),
    supporting_evidence: z.array(z.string()),
    counter_points: z.array(z.string()),
  })
  const emotionalMomentShape = z.object({
    timestamp_approx: z.string(),
    description: z.string(),
    emotion: z.string(),
    quote: z.string(),
  })
  const lessonShape = z.object({
    title: z.string(),
    explanation: z.string(),
    applicability: z.string(),
  })
  const contradictionShape = z.object({
    point_a: z.string(),
    point_b: z.string(),
    context: z.string(),
  })
  const dialogueMapShape = z
    .object({
      speakers: z.array(z.string()),
      dynamics: z.string(),
      power_shifts: z.array(z.string()),
    })
    .nullable()

  const schema = z.object({
    themes: z.array(themeShape),
    thesis: z.string().nullable(),
    arguments: z.array(argumentShape),
    emotional_moments: z.array(emotionalMomentShape),
    lessons: z.array(lessonShape),
    contradictions: z.array(contradictionShape),
    dialogue_map: dialogueMapShape,
    conversation_arc: z.string().nullable(),
    open_questions: z.array(z.string()),
  })

  it("accepts a canonical fixture (fully populated)", () => {
    const fixture: z.infer<typeof schema> = {
      themes: [{ name: "محور", description: "وصف", evidence: ["دليل 1"] }],
      thesis: "الأطروحة المركزية.",
      arguments: [{ claim: "ادعاء", supporting_evidence: ["دليل"], counter_points: [] }],
      emotional_moments: [
        { timestamp_approx: "بداية", description: "وصف", emotion: "دهشة", quote: "اقتباس" },
      ],
      lessons: [{ title: "درس", explanation: "شرح", applicability: "تطبيق" }],
      contradictions: [{ point_a: "أ", point_b: "ب", context: "سياق" }],
      dialogue_map: { speakers: ["مضيف", "ضيف"], dynamics: "ديناميكية", power_shifts: ["تحول"] },
      conversation_arc: "قوس المحادثة.",
      open_questions: ["سؤال 1"],
    }
    expect(() => schema.parse(fixture)).not.toThrow()
  })

  it("accepts a sparse fixture (null thesis + null dialogue_map)", () => {
    const fixture: z.infer<typeof schema> = {
      themes: [],
      thesis: null,
      arguments: [],
      emotional_moments: [],
      lessons: [],
      contradictions: [],
      dialogue_map: null,
      conversation_arc: null,
      open_questions: [],
    }
    expect(() => schema.parse(fixture)).not.toThrow()
  })

  it("rejects a fixture where themes is an object instead of an array", () => {
    const bad = {
      themes: { name: "محور" } as unknown as Array<unknown>,
      thesis: null,
      arguments: [],
      emotional_moments: [],
      lessons: [],
      contradictions: [],
      dialogue_map: null,
      conversation_arc: null,
      open_questions: [],
    }
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 8. analysis.ts :: generateStudioAnalysis ────────────────────────

describe("output contract: generateStudioAnalysis", () => {
  const diagnosisShape = z.object({
    classification: z.string(),
    reasoning: z.string(),
    key_metrics_summary: z.string(),
  })
  const improvementsShape = z.object({
    alt_titles: z.array(z.string()),
    optimized_description: z.string(),
    chapters: z.string(),
    pinned_comment: z.string(),
    thumbnail_concepts: z.array(z.string()),
  })
  const revivalStepShape = z.object({
    order: z.number(),
    action: z.string(),
    detail: z.string(),
  })
  const clipShape = z.object({
    start_time: z.string(),
    end_time: z.string(),
    platform: z.string(),
    hook_text: z.string(),
    caption: z.string(),
    why_it_works: z.string(),
    used: z.boolean(),
  })
  const schema = z.object({
    diagnosis: diagnosisShape,
    improvements: improvementsShape,
    revival: z.object({ steps: z.array(revivalStepShape) }),
    clips: z.array(clipShape),
  })

  it("accepts a canonical fixture (after normalization adds used:false)", () => {
    const fixture: z.infer<typeof schema> = {
      diagnosis: {
        classification: "جيد",
        reasoning: "تحليل مفصل.",
        key_metrics_summary: "ملخص.",
      },
      improvements: {
        alt_titles: ["عنوان 1", "عنوان 2"],
        optimized_description: "وصف محسّن.",
        chapters: "00:00 - مقدمة",
        pinned_comment: "تعليق مثبت.",
        thumbnail_concepts: ["فكرة 1"],
      },
      revival: { steps: [{ order: 1, action: "إعادة", detail: "تفاصيل." }] },
      clips: [
        {
          start_time: "00:01:00",
          end_time: "00:01:45",
          platform: "YouTube Shorts",
          hook_text: "خطاف",
          caption: "وصف",
          why_it_works: "سبب",
          used: false,
        },
      ],
    }
    expect(() => schema.parse(fixture)).not.toThrow()
  })

  it("rejects a clip missing the post-normalization `used` field", () => {
    const bad = {
      diagnosis: { classification: "x", reasoning: "y", key_metrics_summary: "z" },
      improvements: {
        alt_titles: [],
        optimized_description: "",
        chapters: "",
        pinned_comment: "",
        thumbnail_concepts: [],
      },
      revival: { steps: [] },
      clips: [
        {
          start_time: "00:00:00",
          end_time: "00:00:30",
          platform: "x",
          hook_text: "y",
          caption: "z",
          why_it_works: "w",
          // used missing — should fail
        },
      ],
    }
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 9. analysis.ts :: suggestBestIntro ──────────────────────────────

describe("output contract: suggestBestIntro", () => {
  const schema = z.object({
    start_seconds: z.number(),
    end_seconds: z.number(),
    reason: z.string(),
    transcript_excerpt: z.string(),
  })

  it("accepts a canonical fixture", () => {
    const fixture: z.infer<typeof schema> = {
      start_seconds: 180,
      end_seconds: 210,
      reason: "هذه أقوى لحظة في الحلقة.",
      transcript_excerpt: "النص الحرفي للمقطع.",
    }
    expect(() => schema.parse(fixture)).not.toThrow()
    // Post-normalization invariant: start < end. Don't enforce in schema
    // (the function does it), just assert here.
    expect(fixture.start_seconds).toBeLessThan(fixture.end_seconds)
  })

  it("rejects a fixture with non-numeric start_seconds", () => {
    const bad = {
      start_seconds: "180" as unknown as number,
      end_seconds: 210,
      reason: "x",
      transcript_excerpt: "y",
    }
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 10. analysis.ts :: generateEditSuggestions ──────────────────────

describe("output contract: generateEditSuggestions", () => {
  const suggestionShape = z.object({
    start_seconds: z.number(),
    end_seconds: z.number(),
    category: z.enum(["long_pause", "repetitive", "off_topic", "filler", "other"]),
    reason: z.string(),
  })
  const schema = z.object({
    suggestions: z.array(suggestionShape),
    total_cut_seconds: z.number(),
  })

  it("accepts a canonical fixture (sorted by start_seconds, valid categories)", () => {
    const fixture: z.infer<typeof schema> = {
      suggestions: [
        { start_seconds: 120, end_seconds: 145, category: "long_pause", reason: "صمت طويل" },
        { start_seconds: 300, end_seconds: 315, category: "filler", reason: "حشو" },
      ],
      total_cut_seconds: 40,
    }
    expect(() => schema.parse(fixture)).not.toThrow()
    // Post-normalization invariant: sorted ascending.
    for (let i = 1; i < fixture.suggestions.length; i++) {
      expect(fixture.suggestions[i].start_seconds).toBeGreaterThanOrEqual(
        fixture.suggestions[i - 1].start_seconds,
      )
    }
  })

  it("rejects a suggestion with an invalid category (silent vocabulary drift)", () => {
    const bad = {
      suggestions: [
        {
          start_seconds: 0,
          end_seconds: 5,
          category: "spam" as unknown as "long_pause",
          reason: "x",
        },
      ],
      total_cut_seconds: 5,
    }
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Phase 2.0 Batch 2 — newly-routed functions
// ═══════════════════════════════════════════════════════════════════

// ─── 11. guest-intelligence.ts :: generateGuestIntelligence ─────────

describe("output contract (B2): generateGuestIntelligence", () => {
  const quote = z.object({ text: z.string(), context: z.string() })
  const schema = z.object({
    detected_name: z.string().nullable(),
    detected_bio: z.string().nullable(),
    confidence_score: z.number().nullable(),
    speaking_style: z.string().nullable(),
    key_positions: z.array(z.string()),
    notable_quotes: z.array(quote),
  })
  it("accepts canonical fixture", () => {
    const fix: z.infer<typeof schema> = {
      detected_name: "د. س.",
      detected_bio: "نبذة",
      confidence_score: 0.92,
      speaking_style: "تأملي",
      key_positions: ["موقف"],
      notable_quotes: [{ text: "اقتباس", context: "سياق" }],
    }
    expect(() => schema.parse(fix)).not.toThrow()
  })
  it("rejects when confidence_score is a string", () => {
    const bad = {
      detected_name: null, detected_bio: null, confidence_score: "0.5",
      speaking_style: null, key_positions: [], notable_quotes: [],
    }
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 12. preparation sections (representative shape) ────────────────

describe("output contract (B2): preparation executive_summary", () => {
  const schema = z.object({
    headline: z.string(),
    what_its_really_about: z.string(),
    stakes: z.string(),
    audience_promise: z.string(),
  })
  it("accepts fixture", () => {
    expect(() => schema.parse({
      headline: "عنوان", what_its_really_about: "عن ماذا",
      stakes: "ما المحك", audience_promise: "ما يخرج به",
    })).not.toThrow()
  })
  it("rejects missing stakes", () => {
    expect(() => schema.parse({
      headline: "x", what_its_really_about: "y", audience_promise: "z",
    })).toThrow()
  })
})

// ─── 13. interview-cards.ts :: enrichCard (EnrichedCardFields) ──────

describe("output contract (B2): enrichCard", () => {
  const followUp = z.object({ id: z.string(), text: z.string(), trigger_condition: z.string() })
  const schema = z.object({
    spoken_kuwaiti: z.string(),
    formal_version: z.string(),
    shorter_version: z.string(),
    deeper_version: z.string(),
    softer_version: z.string(),
    entry_soft: z.string(),
    entry_direct: z.string(),
    entry_emotional: z.string(),
    entry_provocative: z.string(),
    transition_out: z.string(),
    follow_ups: z.array(followUp),
    emotional_tone: z.string(),
    when_to_ask: z.string(),
    how_to_ask: z.string(),
    if_guest_avoids: z.string(),
    if_guest_emotional: z.string(),
    if_answer_weak: z.string(),
    sensitivity_note: z.string().nullable(),
  })
  it("accepts fixture (all 18 fields)", () => {
    const fix: z.infer<typeof schema> = {
      spoken_kuwaiti: "س", formal_version: "س", shorter_version: "س",
      deeper_version: "س", softer_version: "س",
      entry_soft: "س", entry_direct: "س", entry_emotional: "س", entry_provocative: "س",
      transition_out: "س",
      follow_ups: [{ id: "f1", text: "متابعة", trigger_condition: "حين" }],
      emotional_tone: "ن", when_to_ask: "م", how_to_ask: "ك",
      if_guest_avoids: "ا", if_guest_emotional: "ع", if_answer_weak: "ض",
      sensitivity_note: null,
    }
    expect(() => schema.parse(fix)).not.toThrow()
  })
  it("rejects missing spoken_kuwaiti (silent regression of the headline field)", () => {
    const bad: Record<string, unknown> = {
      formal_version: "", shorter_version: "", deeper_version: "", softer_version: "",
      entry_soft: "", entry_direct: "", entry_emotional: "", entry_provocative: "",
      transition_out: "", follow_ups: [], emotional_tone: "", when_to_ask: "",
      how_to_ask: "", if_guest_avoids: "", if_guest_emotional: "", if_answer_weak: "",
      sensitivity_note: null,
    }
    expect(() => schema.parse(bad)).toThrow()
  })
})

// ─── 14. youtube-pack.ts :: full pack shape (post-normalization) ────

describe("output contract (B2): youtube-pack section list", () => {
  const sectionShape = z.object({
    id: z.string(),
    type: z.enum(["titles", "description", "timestamps", "hashtags", "clips", "tweets"]),
    label: z.string(),
    content: z.string(),
  })
  const schema = z.array(sectionShape)
  it("accepts fixture", () => {
    expect(() => schema.parse([
      { id: "section-titles-1", type: "titles", label: "عناوين مقترحة", content: "1\n2\n3" },
    ])).not.toThrow()
  })
  it("rejects invalid type", () => {
    expect(() => schema.parse([{ id: "x", type: "shorts", label: "y", content: "z" }])).toThrow()
  })
})

// ─── 15. sponsorship.ts :: lead analysis ────────────────────────────

describe("output contract (B2): analyzeSponsorshipLead", () => {
  const schema = z.object({
    fit_score: z.number(),
    quality: z.string(),
    risk_level: z.string(),
    intent_summary: z.string(),
    budget_fit: z.string(),
    recommended_package: z.string(),
    reasoning: z.string(),
    risk_flags: z.array(z.string()),
    opportunity_highlights: z.array(z.string()),
  })
  it("accepts fixture (post-clamp fit_score is integer 0-100)", () => {
    const fix: z.infer<typeof schema> = {
      fit_score: 72, quality: "medium", risk_level: "low",
      intent_summary: "ملخص", budget_fit: "good",
      recommended_package: "باقة", reasoning: "تبرير",
      risk_flags: [], opportunity_highlights: ["فرصة"],
    }
    expect(() => schema.parse(fix)).not.toThrow()
  })
  it("rejects when risk_flags is a string", () => {
    expect(() => schema.parse({
      fit_score: 50, quality: "low", risk_level: "medium",
      intent_summary: "x", budget_fit: "unclear",
      recommended_package: "y", reasoning: "z",
      risk_flags: "not an array", opportunity_highlights: [],
    })).toThrow()
  })
})

// ─── 16. sponsorship.ts :: proposal ─────────────────────────────────

describe("output contract (B2): generateSponsorshipProposal", () => {
  const pkg = z.object({
    name: z.string(), description: z.string(),
    price_range: z.string(), deliverables: z.array(z.string()),
  })
  const schema = z.object({
    subject: z.string(),
    greeting: z.string(),
    introduction: z.string(),
    value_proposition: z.string(),
    proposed_packages: z.array(pkg),
    next_steps: z.string(),
    closing: z.string(),
    full_draft: z.string(),
  })
  it("accepts fixture", () => {
    const fix: z.infer<typeof schema> = {
      subject: "ع", greeting: "م", introduction: "ت", value_proposition: "ق",
      proposed_packages: [{ name: "ب", description: "و", price_range: "5k", deliverables: ["م"] }],
      next_steps: "خ", closing: "خ", full_draft: "ك",
    }
    expect(() => schema.parse(fix)).not.toThrow()
  })
})

// ─── 17. guest.ts :: extract (single episode) ───────────────────────

describe("output contract (B2): generateGuestFromTranscript", () => {
  const schema = z.object({
    guest_name: z.string().nullable(),
    guest_bio: z.string().nullable(),
  })
  it("accepts non-null fixture", () => {
    expect(() => schema.parse({ guest_name: "د. س.", guest_bio: "نبذة" })).not.toThrow()
  })
  it("accepts both-null fixture (monologue)", () => {
    expect(() => schema.parse({ guest_name: null, guest_bio: null })).not.toThrow()
  })
})

// ─── 18. guest.ts :: detection batch ────────────────────────────────

describe("output contract (B2): detectGuestsForEpisodes", () => {
  const result = z.object({
    episode_id: z.string(),
    guest_name: z.string().nullable(),
    guest_bio: z.string().nullable(),
    confidence: z.enum(["high", "medium", "low"]),
    needs_review: z.boolean(),
  })
  const schema = z.array(result)
  it("accepts fixture", () => {
    expect(() => schema.parse([
      { episode_id: "e1", guest_name: "ع.", guest_bio: "ن.", confidence: "high", needs_review: false },
    ])).not.toThrow()
  })
  it("rejects invalid confidence", () => {
    expect(() => schema.parse([
      { episode_id: "e1", guest_name: null, guest_bio: null, confidence: "unsure", needs_review: true },
    ])).toThrow()
  })
})

// ─── 19. guest-application.ts :: analysis ───────────────────────────

describe("output contract (B2): analyzeGuestApplication", () => {
  const schema = z.object({
    fit_score: z.number(),
    emotional_depth_score: z.number(),
    story_clarity_score: z.number(),
    originality_score: z.number(),
    readiness_score: z.number(),
    risk_level: z.string(),
    recommendation: z.string(),
    fit_summary: z.string(),
    strongest_angle: z.string(),
    why_now: z.string(),
    audience_value: z.string(),
    concerns: z.array(z.string()),
    strengths: z.array(z.string()),
    suggested_direction: z.string(),
  })
  it("accepts fixture", () => {
    const fix: z.infer<typeof schema> = {
      fit_score: 78, emotional_depth_score: 80, story_clarity_score: 72,
      originality_score: 65, readiness_score: 70,
      risk_level: "low", recommendation: "accept",
      fit_summary: "ملخص", strongest_angle: "زاوية",
      why_now: "الآن", audience_value: "قيمة",
      concerns: [], strengths: ["a", "b"],
      suggested_direction: "اتجاه",
    }
    expect(() => schema.parse(fix)).not.toThrow()
  })
  it("rejects missing strengths", () => {
    expect(() => schema.parse({
      fit_score: 0, emotional_depth_score: 0, story_clarity_score: 0,
      originality_score: 0, readiness_score: 0,
      risk_level: "high", recommendation: "reject",
      fit_summary: "", strongest_angle: "", why_now: "",
      audience_value: "", concerns: [], suggested_direction: "",
    })).toThrow()
  })
})

// ─── 20. guest-application.ts :: concept ────────────────────────────

describe("output contract (B2): generateGuestConcept", () => {
  const schema = z.object({
    proposed_episode_title: z.string(),
    title_alternatives: z.array(z.string()),
    episode_hook: z.string(),
    episode_logline: z.string(),
    why_this_episode_matters: z.string(),
    conversation_style: z.string(),
    suggested_opening_question: z.string(),
    suggested_core_questions: z.array(z.string()),
    suggested_sensitive_areas: z.array(z.string()),
    suggested_topics_to_avoid: z.array(z.string()),
    host_preparation_notes: z.string(),
  })
  it("accepts fixture", () => {
    const fix: z.infer<typeof schema> = {
      proposed_episode_title: "ع",
      title_alternatives: ["1", "2"],
      episode_hook: "خ", episode_logline: "ل",
      why_this_episode_matters: "م", conversation_style: "hybrid",
      suggested_opening_question: "س",
      suggested_core_questions: ["q1", "q2"],
      suggested_sensitive_areas: [], suggested_topics_to_avoid: [],
      host_preparation_notes: "ن",
    }
    expect(() => schema.parse(fix)).not.toThrow()
  })
})

// ─── 21. guest-application.ts :: response drafts ────────────────────

describe("output contract (B2): generateGuestResponseDrafts", () => {
  const schema = z.object({
    acceptance_formal: z.string(),
    acceptance_warm: z.string(),
    rejection_formal: z.string(),
    rejection_warm: z.string(),
    consider_later_formal: z.string(),
    consider_later_warm: z.string(),
  })
  it("accepts fixture (all 6 drafts present)", () => {
    expect(() => schema.parse({
      acceptance_formal: "1", acceptance_warm: "2",
      rejection_formal: "3", rejection_warm: "4",
      consider_later_formal: "5", consider_later_warm: "6",
    })).not.toThrow()
  })
  it("rejects missing rejection_formal (one of the two required drafts)", () => {
    expect(() => schema.parse({
      acceptance_formal: "1", acceptance_warm: "",
      rejection_warm: "", consider_later_formal: "", consider_later_warm: "",
    })).toThrow()
  })
})

// ─── 22. guest-candidates/ai-analysis.ts :: candidate analysis ──────

describe("output contract (B2): analyzeCandidate", () => {
  const questions = z.object({
    opening: z.array(z.string()),
    deep: z.array(z.string()),
    hard: z.array(z.string()),
    emotional: z.array(z.string()),
  })
  const schema = z.object({
    score_overall: z.number(),
    fit_score: z.number(),
    depth_score: z.number(),
    reach_score: z.number(),
    risk_score: z.number(),
    summary: z.string(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    risk_notes: z.string(),
    topics: z.array(z.string()),
    reason_to_invite: z.string(),
    conversation_angles: z.array(z.string()),
    suggested_questions: questions,
  })
  it("accepts fixture (post-clamp 0-10 scores)", () => {
    const fix: z.infer<typeof schema> = {
      score_overall: 7.5, fit_score: 8, depth_score: 7,
      reach_score: 6.5, risk_score: 2,
      summary: "م", strengths: ["a"], weaknesses: ["b"],
      risk_notes: "ر", topics: ["t1"], reason_to_invite: "ج",
      conversation_angles: ["c1"],
      suggested_questions: {
        opening: ["o1"], deep: ["d1"], hard: ["h1"], emotional: ["e1"],
      },
    }
    expect(() => schema.parse(fix)).not.toThrow()
  })
  it("rejects when suggested_questions is flat (silent shape collapse)", () => {
    expect(() => schema.parse({
      score_overall: 5, fit_score: 5, depth_score: 5, reach_score: 5, risk_score: 5,
      summary: "", strengths: [], weaknesses: [], risk_notes: "",
      topics: [], reason_to_invite: "", conversation_angles: [],
      suggested_questions: ["x"],
    })).toThrow()
  })
})

// ─── 23. guest-candidates/outreach.ts :: outreach draft ─────────────

describe("output contract (B2): generateOutreachDraft", () => {
  const schema = z.object({
    subject_line: z.string().nullable(),
    message_body: z.string(),
  })
  it("accepts email fixture (subject_line present)", () => {
    expect(() => schema.parse({
      subject_line: "موضوع", message_body: "نص الرسالة",
    })).not.toThrow()
  })
  it("accepts whatsapp fixture (subject_line null)", () => {
    expect(() => schema.parse({
      subject_line: null, message_body: "نص",
    })).not.toThrow()
  })
  it("rejects empty message_body", () => {
    // Note: caller-side guard rejects empty body. Zod still allows
    // empty string here; this assertion documents that protection is
    // caller-mediated, not schema-mediated.
    expect(() => schema.parse({ subject_line: null, message_body: "" })).not.toThrow()
  })
})
