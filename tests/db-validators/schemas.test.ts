/**
 * Phase 1.3 — Zod-schema unit tests.
 *
 * One positive + one negative per validated column. Snapshots NOT used —
 * we want literal pass/fail signals, not formatting diffs.
 */

import { describe, expect, it } from "vitest"
import {
  editorialIntentSchema,
  prepV2Schema,
  aiRunsInputSnapshotSchema,
  aiRunsOutputSnapshotSchema,
  hybridOutputTopicsSchema,
} from "@/lib/db/validators"

// ─── editorial_intent ────────────────────────────────────────────────

describe("editorialIntentSchema", () => {
  it("accepts a minimal valid object (all fields optional)", () => {
    expect(editorialIntentSchema.safeParse({}).success).toBe(true)
  })

  it("accepts the full canonical shape", () => {
    const r = editorialIntentSchema.safeParse({
      hook: "خطاف",
      why_matters: "...",
      why_now: "...",
      goal: "...",
      description: "...",
      main_axes: ["a", "b"],
      suggested_questions: ["q1"],
      production_notes: "n",
      source: "khat_map_candidate",
      source_id: "kmec-1",
    })
    expect(r.success).toBe(true)
  })

  it("allows forward-compat extra fields via .loose()", () => {
    const r = editorialIntentSchema.safeParse({
      hook: "ok",
      future_field_we_dont_know_about: { nested: true },
    })
    expect(r.success).toBe(true)
  })

  it("rejects an invalid source enum", () => {
    const r = editorialIntentSchema.safeParse({ source: "made_up_source" })
    expect(r.success).toBe(false)
  })

  it("rejects a non-object value", () => {
    expect(editorialIntentSchema.safeParse("string").success).toBe(false)
    expect(editorialIntentSchema.safeParse(123).success).toBe(false)
  })
})

// ─── prep_v2 ─────────────────────────────────────────────────────────

const goodPrepV2 = {
  thesis: "t",
  axes_of_tension: ["a1", "a2", "a3", "a4", "a5", "a6"],
  guest_extraction_strategy: "g",
  episode_sections: [
    { kind: "opening", intent: "i", target_emotion: "e", estimated_minutes: 5, transition_goal: "t" },
    { kind: "build_up", intent: "i", target_emotion: "e", estimated_minutes: 10, transition_goal: "t" },
    { kind: "conflict", intent: "i", target_emotion: "e", estimated_minutes: 12, transition_goal: "t" },
    { kind: "deep_dive", intent: "i", target_emotion: "e", estimated_minutes: 18, transition_goal: "t" },
    { kind: "emotional_peak", intent: "i", target_emotion: "e", estimated_minutes: 10, transition_goal: "t" },
    { kind: "resolution", intent: "i", target_emotion: "e", estimated_minutes: 10, transition_goal: "t" },
  ],
  question_bank: [
    {
      id: "q1",
      section: "opening",
      text: "...?",
      types: ["emotional"],
      priority: "must_ask",
      purpose: "p",
      follow_up_prompt: "fp",
      risk_level: "low",
    },
  ],
  host_guidance: {
    overall_tone: "t",
    do_list: ["d1", "d2", "d3"],
    dont_list: ["x1", "x2", "x3"],
    energy_curve: "c",
  },
  director_guidance: {
    shot_priorities: ["s1", "s2", "s3"],
    silence_moments: ["m1", "m2"],
    cut_warnings: [],
  },
  sensitive_zones: ["z1"],
  opening_options: [
    { approach: "a", text: "t" },
    { approach: "b", text: "t" },
  ],
  closing_options: [
    { approach: "a", text: "t" },
    { approach: "b", text: "t" },
  ],
  total_estimated_minutes: 65,
  generator_version: "v2.1",
  generated_at: "2026-05-22T00:00:00.000Z",
  ai_run_ids: {
    pass1_research: "id1",
    pass2_structure: "id2",
    pass3_questions: "id3",
    pass4_critique: "id4",
  },
}

describe("prepV2Schema", () => {
  it("accepts a complete valid payload", () => {
    const r = prepV2Schema.safeParse(goodPrepV2)
    expect(r.success).toBe(true)
  })

  it("rejects a payload missing the thesis", () => {
    const bad = { ...goodPrepV2, thesis: undefined }
    delete (bad as Record<string, unknown>).thesis
    expect(prepV2Schema.safeParse(bad).success).toBe(false)
  })

  it("rejects a payload with the wrong generator_version literal", () => {
    const bad = { ...goodPrepV2, generator_version: "v2.0" }
    expect(prepV2Schema.safeParse(bad).success).toBe(false)
  })

  it("rejects a question with an invalid section enum", () => {
    const bad = JSON.parse(JSON.stringify(goodPrepV2))
    bad.question_bank[0].section = "made_up_section"
    expect(prepV2Schema.safeParse(bad).success).toBe(false)
  })

  it("accepts a payload whose ai_run_ids carries pass5_insights", () => {
    const withPass5 = JSON.parse(JSON.stringify(goodPrepV2))
    withPass5.ai_run_ids.pass5_insights = ["run-a", "run-b"]
    expect(prepV2Schema.safeParse(withPass5).success).toBe(true)
  })

  it("accepts a question carrying verified + correction insights", () => {
    const withInsights = JSON.parse(JSON.stringify(goodPrepV2))
    withInsights.question_bank[0].insights = [
      {
        id: "ins-1",
        type: "stat",
        text: "أكثر من ٩٠٪ من بيانات التدريب بالإنجليزية.",
        timing: "during",
        sources: [
          {
            title: "Stanford HAI report",
            url: "https://hai.stanford.edu/x",
            publisher: "Stanford HAI",
            published_at: "2024-01-01",
          },
        ],
        confidence: "verified",
        generated_at: "2026-06-21T00:00:00.000Z",
      },
      {
        id: "ins-2",
        type: "correction",
        text: "تصحيح محتمل",
        timing: "during",
        sources: [{ title: "Nature", url: "https://nature.com/y" }],
        confidence: "partial",
        correction: { inaccuracy: "x", accurate: "y" },
        generated_at: "2026-06-21T00:00:00.000Z",
      },
    ]
    expect(prepV2Schema.safeParse(withInsights).success).toBe(true)
  })

  it("rejects an insight with an invalid type enum", () => {
    const bad = JSON.parse(JSON.stringify(goodPrepV2))
    bad.question_bank[0].insights = [
      {
        id: "ins-x",
        type: "made_up_type",
        text: "t",
        timing: "during",
        sources: [],
        confidence: "verified",
        generated_at: "2026-06-21T00:00:00.000Z",
      },
    ]
    expect(prepV2Schema.safeParse(bad).success).toBe(false)
  })

  it("accepts an insight carrying review-gate fields (approved + manual)", () => {
    const reviewed = JSON.parse(JSON.stringify(goodPrepV2))
    reviewed.question_bank[0].insights = [
      {
        id: "ins-r",
        type: "fact",
        text: "human fact",
        timing: "before",
        sources: [],
        confidence: "verified",
        generated_at: "2026-06-23T00:00:00.000Z",
        live_status: "approved",
        reviewed_by: "editor@khat",
        reviewed_at: "2026-06-23T00:00:00.000Z",
        review_note: "checked",
        manual: true,
      },
    ]
    expect(prepV2Schema.safeParse(reviewed).success).toBe(true)
  })

  it("rejects an invalid live_status on an insight", () => {
    const bad = JSON.parse(JSON.stringify(goodPrepV2))
    bad.question_bank[0].insights = [
      {
        id: "ins-r",
        type: "fact",
        text: "t",
        timing: "during",
        sources: [],
        confidence: "verified",
        generated_at: "2026-06-23T00:00:00.000Z",
        live_status: "live_now",
      },
    ]
    expect(prepV2Schema.safeParse(bad).success).toBe(false)
  })
})

// ─── ai_runs.input_snapshot / output_snapshot ────────────────────────

describe("aiRunsInputSnapshotSchema (lenient)", () => {
  it("accepts any plain object", () => {
    expect(
      aiRunsInputSnapshotSchema.safeParse({ anything: "goes", n: 7, arr: [1, 2] })
        .success,
    ).toBe(true)
  })

  it("accepts an empty object", () => {
    expect(aiRunsInputSnapshotSchema.safeParse({}).success).toBe(true)
  })

  it("rejects a plain string", () => {
    expect(aiRunsInputSnapshotSchema.safeParse("not an object").success).toBe(false)
  })

  it("rejects an array (top level)", () => {
    expect(aiRunsInputSnapshotSchema.safeParse([1, 2, 3]).success).toBe(false)
  })
})

describe("aiRunsOutputSnapshotSchema (lenient)", () => {
  it("accepts the typical { text, parsed } shape", () => {
    expect(
      aiRunsOutputSnapshotSchema.safeParse({
        text: "...",
        parsed: { topics: [] },
      }).success,
    ).toBe(true)
  })

  it("rejects null (the router writes either object or null; null is handled outside the schema)", () => {
    // null at this layer is incorrect — the wrapper skips validation when
    // outputSnapshotValue === null. Asserting the schema's stance:
    expect(aiRunsOutputSnapshotSchema.safeParse(null).success).toBe(false)
  })
})

// ─── hybrid_topic_generations.output_topics ──────────────────────────

const goodTopic = {
  title: "T",
  why_it_matters: "...",
  why_now: "...",
  emotional_hook: "...",
  conflict_angle: "...",
  market_inspiration: "...",
  original_lens: "betrayal_of_self",
  suggested_episode_type: "personal_story",
  suggested_topic_domain: "philosophy",
  estimated_strength_score: 0.7,
  rejected: false,
}

describe("hybridOutputTopicsSchema", () => {
  it("accepts an empty array", () => {
    expect(hybridOutputTopicsSchema.safeParse([]).success).toBe(true)
  })

  it("accepts an array of valid topics", () => {
    expect(hybridOutputTopicsSchema.safeParse([goodTopic, goodTopic]).success).toBe(
      true,
    )
  })

  it("accepts a topic with optional rejection_reasons + consumed_original_topic_id", () => {
    const rejected = {
      ...goodTopic,
      rejected: true,
      rejection_reasons: ["generic_title"],
      consumed_original_topic_id: null,
    }
    expect(hybridOutputTopicsSchema.safeParse([rejected]).success).toBe(true)
  })

  it("accepts forward-compat extras on a topic via .loose()", () => {
    const withExtra = { ...goodTopic, future_metric: { something: 1 } }
    expect(hybridOutputTopicsSchema.safeParse([withExtra]).success).toBe(true)
  })

  it("rejects a topic missing estimated_strength_score", () => {
    const bad: Record<string, unknown> = { ...goodTopic }
    delete bad.estimated_strength_score
    expect(hybridOutputTopicsSchema.safeParse([bad]).success).toBe(false)
  })

  it("rejects a non-array value", () => {
    expect(hybridOutputTopicsSchema.safeParse(goodTopic).success).toBe(false)
  })
})
