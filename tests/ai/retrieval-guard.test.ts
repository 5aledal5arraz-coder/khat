/**
 * The two retrieval guards.
 *
 * GUARD 1 — a structured-output directive inside a search-tool prompt
 * silently disables Google Search (measured 2026-07-26: 0 grounded chunks in
 * 4 of 4 cells, on both live models, with the model then answering from
 * memory). These tests are the WRITE-TIME layer: they scan the real
 * instruction constants both retrieval modules send, so "improving" a prompt
 * with a JSON shape fails `npm run test` instead of failing silently in
 * production.
 *
 * The second half of guard 1's suite matters as much as the first: the
 * scanner must NOT fire on a legitimate mention of the word. "JSON" is a
 * normal research topic, and a guard that blocked «ابحث عن تحليل JSON» would
 * cost us real searches. The split that makes both true is structural — the
 * scan runs on the instruction segment only, never on the query.
 *
 * GUARD 2 — grounding is non-deterministic (same question, same model: 15
 * chunks → 1 → 0). These tests pin the re-roll policy and the "did it even
 * search" derivation the /admin/ops alert reads.
 *
 * Pure: no network, no DB.
 */

import { describe, expect, it } from "vitest"
import {
  buildRetrievalPrompt,
  deriveRetrievalCounts,
  findStructuredOutputDirectives,
  RetrievalPromptContractError,
  RetrievalSearchNotRunError,
  type RetrievalOnlyConfig,
} from "@/lib/ai/retrieval-guard"
import {
  EMPTY_GROUNDING_RETRIES,
  RETRIEVAL_INSTRUCTIONS,
  shouldRerollEmptyGrounding,
} from "@/lib/ai/grounded-evidence"
import { PREPARATION_RETRIEVAL_INSTRUCTIONS } from "@/lib/ai/preparation/research/gemini"
import { geminiRetrievalDiagnostic } from "@/lib/ai/preparation/research/pipeline"

// ─── Guard 1: it catches a formatting directive ──────────────────────────

describe("findStructuredOutputDirectives — catches formatting directives", () => {
  const dirty: Array<[string, string]> = [
    ["Arabic: أعد + بصيغة", "أعد النتيجة بصيغة JSON فقط بدون أي شرح."],
    ["Arabic: المخرجات", "المخرجات المطلوبة: JSON يحتوي على قائمة المصادر."],
    ["Arabic: على شكل مصفوفة", "اكتب النتائج على شكل مصفوفة JSON."],
    ["English: valid JSON only", "Return valid JSON only, no prose."],
    ["English: respond in JSON format", "Respond in JSON format with a sources array."],
    ["English: YAML", "Output the answer as YAML."],
    ["mime type", "Set the response to application/json before answering."],
    ["SDK field", "استخدم responseMimeType حتى يكون الرد منظّماً."],
    ["schema field", "التزم بـ response_schema المرفق."],
    ["code fence", "أعد الناتج هكذا:\n```json\n{}\n```"],
    ["inline skeleton", 'اتبع هذا الشكل: {"sources": [], "summary": ""}'],
  ]

  for (const [name, text] of dirty) {
    it(`flags ${name}`, () => {
      expect(findStructuredOutputDirectives(text).length).toBeGreaterThan(0)
    })
  }

  it("names what it matched, so the error is actionable", () => {
    const hits = findStructuredOutputDirectives("أعد النتيجة بصيغة JSON.")
    expect(hits[0]).toContain("JSON")
  })
})

// ─── Guard 1: it does NOT catch a legitimate mention ─────────────────────

describe("findStructuredOutputDirectives — leaves legitimate text alone", () => {
  const clean: Array<[string, string]> = [
    // The exact false positive the guard must never produce: a research
    // question about a technical topic that happens to be a data format.
    ["topical JSON", "ابحث عن مقالات ومكتبات تحليل JSON في JavaScript وكيف تطورت."],
    ["topical XML", "ما تاريخ معيار XML ومن طوّره ومتى انتشر؟"],
    ["topical CSV", "كيف يتعامل الصحفيون مع ملفات CSV في التحقيقات الاستقصائية؟"],
    ["output verb, no format noun", "أنتج ملخصاً بحثياً موجزاً مدعوماً بالمصادر."],
    ["format word, no format noun", "التزم بصيغة عربية واضحة."],
  ]

  for (const [name, text] of clean) {
    it(`ignores ${name}`, () => {
      expect(findStructuredOutputDirectives(text)).toEqual([])
    })
  }

  it("passes the REAL shared-service instructions", () => {
    expect(findStructuredOutputDirectives(RETRIEVAL_INSTRUCTIONS)).toEqual([])
  })

  it("passes the REAL preparation-research instructions", () => {
    expect(findStructuredOutputDirectives(PREPARATION_RETRIEVAL_INSTRUCTIONS)).toEqual(
      [],
    )
  })
})

// ─── Guard 1: the instruction/query split ────────────────────────────────

describe("buildRetrievalPrompt", () => {
  it("throws before the paid call when the instructions carry a directive", () => {
    expect(() =>
      buildRetrievalPrompt("test-site", "أعد الإجابة بصيغة JSON.", "من هو فلان؟"),
    ).toThrow(RetrievalPromptContractError)
  })

  it("names the call site in the error", () => {
    try {
      buildRetrievalPrompt("lib/x.ts", "Return JSON only.", "q")
      throw new Error("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(RetrievalPromptContractError)
      expect((err as RetrievalPromptContractError).site).toBe("lib/x.ts")
    }
  })

  it("NEVER scans the query — a question about JSON is a valid question", () => {
    // If this ever throws, the guard has started blocking real research.
    const prompt = buildRetrievalPrompt(
      "test-site",
      RETRIEVAL_INSTRUCTIONS,
      "أعد لي بصيغة JSON: ما أبرز المكتبات؟", // directive-shaped, but it's the QUERY
    )
    expect(prompt).toContain("أعد لي بصيغة JSON")
  })

  it("keeps the instructions and the query in one prompt", () => {
    const prompt = buildRetrievalPrompt("test-site", RETRIEVAL_INSTRUCTIONS, "من هو س؟")
    expect(prompt).toContain(RETRIEVAL_INSTRUCTIONS)
    expect(prompt).toContain("من هو س؟")
  })
})

// ─── Guard 1: the compile-time layer ─────────────────────────────────────

describe("RetrievalOnlyConfig", () => {
  it("makes a JSON mime type / schema / systemInstruction a TYPE error", () => {
    // These `@ts-expect-error`s are the assertion: `npx tsc --noEmit` fails
    // if any of them stops being an error — i.e. if the compile-time guard is
    // ever weakened back to a plain GenerateContentConfig.
    const withMime: RetrievalOnlyConfig = {
      tools: [{ googleSearch: {} }],
      // @ts-expect-error — responseMimeType disables Google Search
      responseMimeType: "application/json",
    }
    const withSchema: RetrievalOnlyConfig = {
      tools: [{ googleSearch: {} }],
      // @ts-expect-error — a response schema disables Google Search
      responseSchema: { type: "object" },
    }
    const withSystem: RetrievalOnlyConfig = {
      tools: [{ googleSearch: {} }],
      // @ts-expect-error — model-facing text that bypasses the prompt scan
      systemInstruction: "Return JSON",
    }
    // Runtime side is irrelevant; the type-check above is the test.
    expect([withMime, withSchema, withSystem]).toHaveLength(3)
  })
})

// ─── Guard 2: did the search actually run? ───────────────────────────────

describe("deriveRetrievalCounts", () => {
  it("counts the queries the model listed", () => {
    const c = deriveRetrievalCounts({
      webSearchQueries: ["a", "b"],
      groundingChunks: [{}, {}, {}],
    })
    expect(c).toEqual({ queryCount: 2, sourcesFound: 3, searchRan: true })
  })

  it("bills at least one query when chunks came back without a query list", () => {
    const c = deriveRetrievalCounts({ groundingChunks: [{}] })
    expect(c.queryCount).toBe(1)
    expect(c.searchRan).toBe(true)
  })

  it("searched-but-empty is still a search (not a malfunction)", () => {
    const c = deriveRetrievalCounts({ webSearchQueries: ["a"], groundingChunks: [] })
    expect(c.sourcesFound).toBe(0)
    expect(c.searchRan).toBe(true)
  })

  it("no queries AND no chunks = the tool never fired", () => {
    expect(deriveRetrievalCounts({}).searchRan).toBe(false)
    expect(deriveRetrievalCounts(undefined).searchRan).toBe(false)
  })
})

// ─── Guard 2: the re-roll policy ─────────────────────────────────────────

describe("shouldRerollEmptyGrounding", () => {
  const counts = (sourcesFound: number, queryCount = 1) => ({
    queryCount,
    sourcesFound,
    searchRan: queryCount > 0,
  })

  it("re-rolls zero sources — nothing to grade, nothing to cite", () => {
    expect(shouldRerollEmptyGrounding(counts(0), 1, 1, 3)).toBe(true)
  })

  it("re-rolls a response that never searched", () => {
    expect(shouldRerollEmptyGrounding(counts(0, 0), 1, 1, 3)).toBe(true)
  })

  it("does NOT re-roll thin evidence — one source is a normal outcome", () => {
    // The tempting threshold ("fewer than N sources") would re-roll a large
    // share of healthy calls, because the measured spread on identical inputs
    // is 1→15. Thinness is graded downstream, not re-bought here.
    expect(shouldRerollEmptyGrounding(counts(1), 1, 1, 3)).toBe(false)
    expect(shouldRerollEmptyGrounding(counts(2), 1, 1, 3)).toBe(false)
  })

  it("spends its budget once", () => {
    expect(shouldRerollEmptyGrounding(counts(0), 0, 2, 3)).toBe(false)
    expect(EMPTY_GROUNDING_RETRIES).toBe(1)
  })

  it("never re-rolls on the last attempt — its result is the answer", () => {
    expect(shouldRerollEmptyGrounding(counts(0), 1, 3, 3)).toBe(false)
  })
})

describe("RetrievalSearchNotRunError", () => {
  it("says the search never happened, not that nothing was found", () => {
    const err = new RetrievalSearchNotRunError("gemini-3.6-flash", 2)
    expect(err.name).toBe("RetrievalSearchNotRunError")
    expect(err.attempts).toBe(2)
    expect(err.message).toContain("gemini-3.6-flash")
  })
})

// ─── Guard 2: the preparation pipeline's diagnostic ──────────────────────

describe("geminiRetrievalDiagnostic", () => {
  it("reports ok, message-free, when every query searched", () => {
    const d = geminiRetrievalDiagnostic(12, 0, 4)
    expect(d.status).toBe("ok")
    expect(d.message).toBeUndefined()
  })

  it("reports ok WITH a note when part of the plan never searched", () => {
    const d = geminiRetrievalDiagnostic(5, 2, 4)
    expect(d.status).toBe("ok")
    expect(d.message).toContain("2/4")
  })

  it("reports FAILED when no query ever searched — not an empty 'ok'", () => {
    const d = geminiRetrievalDiagnostic(0, 4, 4)
    expect(d.status).toBe("failed")
    expect(d.message).toContain("ما صار بحث فعلي")
  })

  it("a real, searched, empty web is still ok — that is a finding", () => {
    const d = geminiRetrievalDiagnostic(0, 0, 4)
    expect(d.status).toBe("ok")
    expect(d.count).toBe(0)
  })
})
