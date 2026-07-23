/**
 * Studio 3-phase journey — Step 6: whisper transcript DEGENERACY guard.
 *
 * These are PURE tests (no paid AI, no I/O): segment arrays are constructed by
 * hand. They prove three things that matter together:
 *   1. a whisper loop (many identical consecutive segments) is REJECTED,
 *   2. a healthy conversation (high uniqueness) PASSES,
 *   3. legitimate repetition (a phrase repeated a few times / a recurring show
 *      tag) is NOT false-positived — the over-rejection that would break real
 *      episodes.
 */

import { describe, it, expect } from "vitest"
import {
  assessTranscriptDegeneracy,
  HARD_LOOP_RUN_LENGTH,
  SUSPECT_LOOP_RUN_LENGTH,
  MIN_SEGMENTS_FOR_RATIO,
  HARD_INTRA_CHAR_RUN_LENGTH,
  HARD_INTRA_TOKEN_RUN_LENGTH,
  DEGENERATE_TRANSCRIPT_MESSAGE,
} from "@/lib/studio/transcript-quality"
import type { TimedSegment } from "@/lib/studio/segments"

/** Build a segment stream from a list of texts, 2s apart, on the real timeline. */
function seg(texts: string[], startAt = 0): TimedSegment[] {
  return texts.map((text, i) => ({
    start: startAt + i * 2,
    end: startAt + i * 2 + 1.8,
    text,
    chunk: 0,
  }))
}

/**
 * N distinct, plausible conversational segments (high uniqueness). `offset` keeps
 * strings GLOBALLY unique across calls (the "رقم {offset+i}" suffix), so stitching
 * two healthy stretches together doesn't accidentally collapse uniqueness.
 */
function healthyConversation(n: number, offset = 0): string[] {
  const templates = [
    "أنا خسرت كل شي وقتها",
    "بعدها قمت من جديد",
    "الفكرة كانت صعبة في البداية",
    "بس تعلمت من التجربة",
    "الضيف حكى عن رحلته",
    "كيف بدأت المشروع",
    "وش كانت أكبر عقبة",
    "التمويل كان التحدي الأول",
    "بنينا الفريق خطوة بخطوة",
    "السوق تغير بسرعة",
    "قررنا نغير الاستراتيجية",
    "النتيجة كانت مفاجئة",
  ]
  return Array.from(
    { length: n },
    (_, i) => `${templates[i % templates.length]} رقم ${offset + i}`,
  )
}

describe("assessTranscriptDegeneracy — whisper loop rejection", () => {
  it("REJECTS Noura's case: 153 identical consecutive segments (222s→530s)", () => {
    // The exact shape Noura observed: a splice looped one word for ~5 minutes.
    const looped = seg(Array.from({ length: 153 }, () => "ثاني"), 222)
    const v = assessTranscriptDegeneracy(looped)
    expect(v.degenerate).toBe(true)
    expect(v.metrics.maxConsecutiveRun).toBe(153)
    expect(v.metrics.uniqueSegments).toBe(1)
    expect(v.metrics.loopText).toBe("ثاني")
    expect(v.metrics.loopStartSeconds).toBe(222)
    expect(v.reason).toMatch(/consecutive-identical run of 153/)
  })

  it("REJECTS on the HARD run threshold alone (exactly HARD_LOOP_RUN_LENGTH in a row)", () => {
    const looped = seg(Array.from({ length: HARD_LOOP_RUN_LENGTH }, () => "نفس الكلمة"))
    const v = assessTranscriptDegeneracy(looped)
    expect(v.degenerate).toBe(true)
    expect(v.metrics.maxConsecutiveRun).toBe(HARD_LOOP_RUN_LENGTH)
  })

  it("catches a LOCAL loop embedded in an otherwise-healthy transcript (global uniqueness stays HIGH)", () => {
    // 1000 unique + a 153 loop → global uniqueness ≈ 1000/1153 ≈ 0.87 (HIGH).
    // A uniqueness-only guard would MISS this; the consecutive-run signal catches it.
    const texts = [
      ...healthyConversation(1000),
      ...Array.from({ length: 153 }, () => "ثاني"),
    ]
    const v = assessTranscriptDegeneracy(seg(texts))
    expect(v.degenerate).toBe(true)
    expect(v.metrics.uniquenessRatio).toBeGreaterThan(0.8) // proves the loop was NOT global
    expect(v.metrics.maxConsecutiveRun).toBe(153)
  })

  it("normalizes Arabic before comparing (tashkeel/alef variants collapse into one loop)", () => {
    // "ثانِي" (with kasra) / "ثاني" / "ثانى" (alef maqsura) are ONE normalized form.
    const texts = Array.from({ length: 12 }, (_, i) =>
      i % 3 === 0 ? "ثانِي" : i % 3 === 1 ? "ثاني" : "ثانى",
    )
    const v = assessTranscriptDegeneracy(seg(texts))
    expect(v.degenerate).toBe(true)
    expect(v.metrics.maxConsecutiveRun).toBe(12)
    expect(v.metrics.uniqueSegments).toBe(1) // all fold to the same normalized string
  })

  it("REJECTS via the corroborated path: a shorter run WITH collapsed overall uniqueness", () => {
    // 24 segments, only "نعم"/"لا" → uniqueness 2/24 ≈ 0.083 (≤ 0.3), longest run ≥ 5.
    const texts = [
      ...Array.from({ length: SUSPECT_LOOP_RUN_LENGTH + 1 }, () => "نعم"),
      ...Array.from({ length: 24 - (SUSPECT_LOOP_RUN_LENGTH + 1) }, (_, i) =>
        i % 2 === 0 ? "لا" : "نعم",
      ),
    ]
    expect(texts.length).toBeGreaterThanOrEqual(MIN_SEGMENTS_FOR_RATIO)
    const v = assessTranscriptDegeneracy(seg(texts))
    expect(v.degenerate).toBe(true)
    expect(v.reason).toMatch(/collapsed uniqueness/)
  })
})

describe("assessTranscriptDegeneracy — healthy transcript PASSES", () => {
  it("passes a long, varied conversation (high uniqueness, no runs)", () => {
    const v = assessTranscriptDegeneracy(seg(healthyConversation(400)))
    expect(v.degenerate).toBe(false)
    expect(v.metrics.uniquenessRatio).toBe(1)
    expect(v.metrics.maxConsecutiveRun).toBe(1)
    expect(v.reason).toBe("")
  })

  it("passes empty input (nothing to judge — the map builder rejects that separately)", () => {
    const v = assessTranscriptDegeneracy([])
    expect(v.degenerate).toBe(false)
    expect(v.metrics.totalSegments).toBe(0)
  })

  it("ignores segments that normalize to empty (punctuation/whitespace-only)", () => {
    const v = assessTranscriptDegeneracy(seg(["كلام حقيقي", "   ", "", "كلام ثاني مختلف"]))
    expect(v.degenerate).toBe(false)
    expect(v.metrics.totalSegments).toBe(2) // the two blanks dropped
  })
})

describe("assessTranscriptDegeneracy — FALSE-POSITIVE guard (legitimate repetition)", () => {
  it("does NOT reject a phrase repeated a FEW times for emphasis", () => {
    // A speaker genuinely repeating a word 4× — below HARD, no uniqueness collapse.
    const texts = [
      ...healthyConversation(30, 0),
      "خلاص خلاص",
      "خلاص خلاص",
      "خلاص خلاص",
      "خلاص خلاص",
      ...healthyConversation(30, 30),
    ]
    const v = assessTranscriptDegeneracy(seg(texts))
    expect(v.degenerate).toBe(false)
    expect(v.metrics.maxConsecutiveRun).toBe(4) // < HARD_LOOP_RUN_LENGTH
  })

  it("does NOT reject a recurring show tag scattered across the episode", () => {
    // "بودكاست خط" appears 8× but NEVER consecutively — high uniqueness, run = 1.
    const base = healthyConversation(200)
    const withTag: string[] = []
    base.forEach((t, i) => {
      withTag.push(t)
      if (i % 25 === 0) withTag.push("بودكاست خط") // sprinkled, non-consecutive
    })
    const v = assessTranscriptDegeneracy(seg(withTag))
    expect(v.degenerate).toBe(false)
    expect(v.metrics.maxConsecutiveRun).toBe(1)
    expect(v.metrics.uniquenessRatio).toBeGreaterThan(0.8)
  })

  it("does NOT reject a SHORT clip with low uniqueness (below the ratio floor)", () => {
    // 6 segments, only 2 distinct → low uniqueness, but too few to judge on ratio,
    // and no run reaches HARD_LOOP_RUN_LENGTH. A teaser must not be nuked.
    const texts = ["نعم", "لا", "نعم", "لا", "نعم", "لا"]
    expect(texts.length).toBeLessThan(MIN_SEGMENTS_FOR_RATIO)
    const v = assessTranscriptDegeneracy(seg(texts))
    expect(v.degenerate).toBe(false)
  })

  it("does NOT reject a 5-in-a-row repeat inside a HEALTHY (high-uniqueness) transcript", () => {
    // Run = 5 ≥ SUSPECT, but uniqueness is high → corroborated path must NOT fire.
    const texts = [
      ...healthyConversation(60, 0),
      "أكيد",
      "أكيد",
      "أكيد",
      "أكيد",
      "أكيد",
      ...healthyConversation(60, 60),
    ]
    const v = assessTranscriptDegeneracy(seg(texts))
    expect(v.degenerate).toBe(false)
    expect(v.metrics.maxConsecutiveRun).toBe(5)
    expect(v.metrics.uniquenessRatio).toBeGreaterThan(0.9) // far above MIN_UNIQUENESS_RATIO
  })
})

describe("assessTranscriptDegeneracy — INTRA-segment hallucination (Finding #1)", () => {
  /** One long segment, absolute [start,end] on the timeline, optional compression. */
  function oneLong(text: string, start: number, end: number, cr?: number): TimedSegment[] {
    return [
      { start: 0, end: start, text: "اهلا وسهلا فيكم في حلقه جديده", chunk: 0 },
      { start, end, text, chunk: 0, ...(cr != null ? { compressionRatio: cr } : {}) },
      { start: end, end: end + 4, text: "نبدا موضوعنا المهم اليوم مباشره", chunk: 0 },
    ]
  }

  it("REJECTS Noura's proven case: a 209-identical-character run inside ONE unique segment", () => {
    // The exact false-✅ path: ~26s of quiet mic-check replaced by "ووو…". The
    // segment is UNIQUE, so every INTER-segment signal PASSES it — proving the
    // intra check is what catches it.
    const garbled = "و".repeat(209)
    const v = assessTranscriptDegeneracy(oneLong(garbled, 3, 29))
    expect(v.degenerate).toBe(true)
    expect(v.metrics.maxConsecutiveRun).toBe(1) // inter-segment: NOT a loop
    expect(v.metrics.uniquenessRatio).toBe(1) // inter-segment: all unique
    expect(v.metrics.maxIntraCharRun).toBe(209)
    expect(v.reason).toMatch(/intra-segment hallucination/)
    expect(v.reason).toMatch(/single-character run of 209/)
  })

  it("REJECTS on the HARD intra char-run threshold alone (exactly the floor)", () => {
    const run = "ه".repeat(HARD_INTRA_CHAR_RUN_LENGTH)
    const v = assessTranscriptDegeneracy(oneLong(run, 3, 29))
    expect(v.degenerate).toBe(true)
    expect(v.metrics.maxIntraCharRun).toBe(HARD_INTRA_CHAR_RUN_LENGTH)
  })

  it("REJECTS a ~20s garbled LOW-VOCABULARY segment (a short phrase looped, no char/token run)", () => {
    // "طيب يعني ماشي" ×10 = 30 tokens, only 3 distinct → diversity 0.1. No single
    // character or token repeats back-to-back, so ONLY the collapsed-vocabulary
    // rule can catch it. Segment spans 20s (5s→25s).
    const looped = Array.from({ length: 10 }, () => "طيب يعني ماشي").join(" ")
    const v = assessTranscriptDegeneracy(oneLong(looped, 5, 25))
    expect(v.degenerate).toBe(true)
    expect(v.metrics.maxIntraCharRun).toBeLessThan(HARD_INTRA_CHAR_RUN_LENGTH)
    expect(v.metrics.maxIntraTokenRun).toBeLessThan(HARD_INTRA_TOKEN_RUN_LENGTH)
    expect(v.metrics.minLongSegmentDiversity).toBeLessThanOrEqual(0.2)
    expect(v.reason).toMatch(/collapsed vocabulary/)
  })

  it("REJECTS a word looped INSIDE one segment (identical-token run)", () => {
    // Whisper packed the loop into ONE segment: "ثاني ثاني ثاني…" ×12 → tokenRun 12.
    const looped = Array.from({ length: 12 }, () => "ثاني").join(" ")
    const v = assessTranscriptDegeneracy(oneLong(looped, 3, 15))
    expect(v.degenerate).toBe(true)
    expect(v.metrics.maxIntraTokenRun).toBe(12)
    expect(v.reason).toMatch(/identical-token run of 12/)
  })

  it("REJECTS via the OPTIONAL compression_ratio signal even when the text looks clean", () => {
    // Text is varied (all text signals pass), but whisper flagged it with a high
    // compression_ratio → the corroborating metadata signal alone catches it. Proves
    // the plumbing works AND that it is genuinely independent of the text checks.
    const clean = "هذا كلام طبيعي ومتنوع تماما بدون اي تكرار واضح في الجمله"
    const v = assessTranscriptDegeneracy(oneLong(clean, 3, 20, 3.1))
    expect(v.degenerate).toBe(true)
    expect(v.metrics.maxSegmentCompressionRatio).toBeCloseTo(3.1, 5)
    expect(v.metrics.maxIntraCharRun).toBeLessThan(HARD_INTRA_CHAR_RUN_LENGTH)
    expect(v.reason).toMatch(/compression_ratio/)
  })

  it("FALSE-POSITIVE guard: a legitimately ELONGATED word passes", () => {
    // "ماشاااء الله" and a normal emphatic elongation must NOT be rejected — the
    // char run there is ~3, far below the floor.
    const texts = [
      ...healthyConversation(20, 0),
      "ماشاااء الله عليك",
      "والله شي حلو صراحه",
      "صحيييح كلامك مضبوط",
      ...healthyConversation(20, 20),
    ]
    const v = assessTranscriptDegeneracy(seg(texts))
    expect(v.degenerate).toBe(false)
    expect(v.metrics.maxIntraCharRun).toBeLessThan(HARD_INTRA_CHAR_RUN_LENGTH)
  })

  it("FALSE-POSITIVE guard: a normal LONG, vocabulary-rich segment passes", () => {
    // A real 22s segment with rich, varied vocabulary — high diversity → not a loop.
    const rich =
      "تكلمنا في هذي الحلقه عن رحله الضيف الطويله من البدايه الصعبه " +
      "مرورا بالتحديات الماليه وبناء الفريق وتغير السوق والقرارات المصيريه " +
      "وصولا للنتيجه المفاجئه التي غيرت مسار المشروع بالكامل"
    const v = assessTranscriptDegeneracy(oneLong(rich, 4, 26))
    expect(v.degenerate).toBe(false)
    expect(v.metrics.minLongSegmentDiversity).toBeGreaterThan(0.2)
  })

  it("FALSE-POSITIVE guard: whisper compression_ratio in the NORMAL range passes", () => {
    const clean = "هذا كلام طبيعي جدا ومتنوع في مفرداته بدون اي تكرار"
    const v = assessTranscriptDegeneracy(oneLong(clean, 3, 20, 1.8))
    expect(v.degenerate).toBe(false)
    expect(v.metrics.maxSegmentCompressionRatio).toBeCloseTo(1.8, 5)
  })

  it("the INTER-segment loop from Step 6 is STILL rejected (no regression)", () => {
    const looped = seg(Array.from({ length: 153 }, () => "ثاني"), 222)
    const v = assessTranscriptDegeneracy(looped)
    expect(v.degenerate).toBe(true)
    expect(v.metrics.maxConsecutiveRun).toBe(153)
    expect(v.reason).toMatch(/consecutive-identical run of 153/)
  })
})

describe("DEGENERATE_TRANSCRIPT_MESSAGE", () => {
  it("is the Arabic operator message the map job surfaces on failure", () => {
    expect(DEGENERATE_TRANSCRIPT_MESSAGE).toContain("تعذّر إنتاج خريطة موثوقة")
    expect(DEGENERATE_TRANSCRIPT_MESSAGE).toContain("حاول مرة أخرى")
  })
})
