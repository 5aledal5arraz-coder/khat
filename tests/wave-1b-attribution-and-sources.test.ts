/**
 * Wave 1b — three defects that all share one shape: a surface reading the
 * WRONG source and then reporting confidently about it.
 *
 *  1. `ai_runs` attribution. Every grounding/verification call in the prep_v2
 *     insights pass went to Gemini directly and opened its telemetry row with
 *     no `eir_id` / `subject_table` / `subject_id`. Measured on the local DB
 *     2026-07-31: 180 of 180 failed `research_retrieval` rows unattributed.
 *     The failure alert could say "grounding is failing" but never for WHICH
 *     episode — which is the only fact that makes it actionable.
 *
 *  2. Question source. `question_system` is the prep-V1 column and has had no
 *     writer since prep_v2 shipped — it is NULL on every row in the database.
 *     Both the cards generator and the cards panel read only that column, so
 *     a preparation holding 28 questions was declared to have none and its
 *     generate button was permanently disabled.
 *
 *  3. Guest derivation. The workspace derived the guest exclusively from
 *     `eir.guest_id`, whose only writer is a manual button, so the guest tab
 *     advertised discovery for a guest the preparation had already named.
 *
 * These are unit-level pins on the source-selection logic. Whether the
 * screens now READ correctly is Noura's and Sara's call, not this file's.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Item 1: attribution reaches recordAiRun ─────────────────────────────

const recordAiRunSpy = vi.fn(
  async (
    _meta: Record<string, unknown>,
    exec: () => Promise<unknown>,
    derive?: unknown,
  ) => {
    // `derive` is the real `recordAiRun`'s third argument. The spy has no use
    // for it but must still ACCEPT it, so the mock below can forward all three
    // and `mock.calls` records them. `void` marks it deliberately unused —
    // same idiom as the tail of `lib/khat-brain/episode-workspace.ts` — rather
    // than leaving an `_`-prefixed trailing parameter that lints as a warning.
    void derive
    return exec()
  },
)

const generateContent = vi.fn(async () => ({
  candidates: [
    {
      groundingMetadata: {
        groundingChunks: [{ web: { uri: "https://example.org/a", title: "Example" } }],
        groundingSupports: [
          { segment: { text: "supporting text" }, groundingChunkIndices: [0] },
        ],
        webSearchQueries: ["q"],
      },
      content: { parts: [{ text: '{"verdict":"supported"}' }] },
    },
  ],
  text: '{"verdict":"supported","supporting_source_indices":[0]}',
  usageMetadata: {},
}))

vi.mock("@/lib/ai-router/record-run", () => ({
  recordAiRun: (m: Record<string, unknown>, e: () => Promise<unknown>, d?: unknown) =>
    recordAiRunSpy(m, e, d),
}))
vi.mock("@/lib/ai/gemini", () => ({
  getGeminiClient: () => ({ models: { generateContent } }),
  isGeminiConfigured: () => true,
  GEMINI_RETRIEVAL_MODEL: "gemini-test-retrieval",
  GEMINI_REASONING_MODEL: "gemini-test-reasoning",
}))
vi.mock("@/lib/ai-router/gemini-usage", () => ({
  deriveGeminiTelemetry: () => ({ tokensIn: 1, tokensOut: 1, costUsd: null }),
}))

describe("ai_runs attribution on direct Gemini calls", () => {
  beforeEach(() => {
    recordAiRunSpy.mockClear()
    generateContent.mockClear()
  })

  it("stamps eir_id + subject on a grounded search when attribution is passed", async () => {
    const { geminiSearchWeb } = await import("@/lib/ai/preparation/research/gemini")

    await geminiSearchWeb("some claim", 6, {
      eirId: "eir-123",
      subjectTable: "episode_preparations",
      subjectId: "prep-456",
    })

    expect(recordAiRunSpy).toHaveBeenCalled()
    const meta = recordAiRunSpy.mock.calls[0][0]
    expect(meta.eirId).toBe("eir-123")
    expect(meta.subjectTable).toBe("episode_preparations")
    expect(meta.subjectId).toBe("prep-456")
  })

  it("stamps eir_id + subject on the JSON verifier call", async () => {
    const { geminiJson } = await import("@/lib/ai/preparation/research/gemini")

    await geminiJson<{ verdict: string }>(
      "sys",
      "user",
      "insight-verify",
      0.1,
      undefined,
      { eirId: null, subjectTable: "episode_preparations", subjectId: "prep-456" },
    )

    const meta = recordAiRunSpy.mock.calls[0][0]
    // eir_id is legitimately null for an unlinked preparation — but the
    // SUBJECT must always be there, or the row still names no record.
    expect(meta.eirId).toBeNull()
    expect(meta.subjectTable).toBe("episode_preparations")
    expect(meta.subjectId).toBe("prep-456")
  })

  it("attributes the RETRY attempts too, not just the first", async () => {
    // This is the case that actually happened: 180 rate-limited rows from a
    // far smaller number of claims, because a 429 is retriable and each
    // attempt opens its OWN ai_runs row. If only the first attempt carried
    // attribution, the bulk of the failure rows would still name no episode.
    generateContent.mockRejectedValueOnce(new Error("429 rate limit"))
    const { geminiSearchWeb } = await import("@/lib/ai/preparation/research/gemini")

    await geminiSearchWeb("claim", 6, {
      eirId: "eir-123",
      subjectTable: "episode_preparations",
      subjectId: "prep-456",
    })

    // One row for the 429'd attempt, one for the retry that succeeded.
    expect(recordAiRunSpy.mock.calls.length).toBeGreaterThan(1)
    for (const call of recordAiRunSpy.mock.calls) {
      expect(call[0].eirId).toBe("eir-123")
      expect(call[0].subjectId).toBe("prep-456")
    }
  })

  it("leaves the fields null when a caller has no record in scope", async () => {
    const { geminiSearchWeb } = await import("@/lib/ai/preparation/research/gemini")
    await geminiSearchWeb("claim", 6)
    const meta = recordAiRunSpy.mock.calls[0][0]
    expect(meta.eirId).toBeNull()
    expect(meta.subjectTable).toBeNull()
  })
})

// ── Item 2: question source ─────────────────────────────────────────────

describe("preparation question source", () => {
  it("sees prep_v2 questions when question_system is null (the real row)", async () => {
    const { hasCardQuestionSource, countPreparationQuestions } = await import(
      "@/lib/preparation/question-source"
    )
    // Shape of prep 2fdb6a84…: question_system NULL, 28 questions in prep_v2.
    const prep = {
      question_system: null,
      prep_v2: {
        question_bank: Array.from({ length: 28 }, (_, i) => ({ id: `q${i}` })),
      },
    } as never

    expect(hasCardQuestionSource(prep)).toBe(true)
    expect(countPreparationQuestions(prep)).toBe(28)
  })

  it("still sees a legacy question_system", async () => {
    const { hasCardQuestionSource, countPreparationQuestions } = await import(
      "@/lib/preparation/question-source"
    )
    const prep = {
      question_system: { sections: [{ questions: [{ id: "a" }, { id: "b" }] }] },
      prep_v2: null,
    } as never

    expect(hasCardQuestionSource(prep)).toBe(true)
    expect(countPreparationQuestions(prep)).toBe(2)
  })

  it("is false only when BOTH sources are genuinely empty", async () => {
    const { hasCardQuestionSource } = await import(
      "@/lib/preparation/question-source"
    )
    expect(hasCardQuestionSource({ question_system: null, prep_v2: null })).toBe(false)
    expect(
      hasCardQuestionSource({
        question_system: { sections: [] },
        prep_v2: { question_bank: [] },
      } as never),
    ).toBe(false)
  })
})
