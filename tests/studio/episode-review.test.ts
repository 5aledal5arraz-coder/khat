/**
 * Studio Phase-2 EDIT REVIEW — pure algorithm tests (no paid AI, no real audio).
 *
 * Every transcript here is a hand-built TimedSegment array. The suite proves the
 * full verdict matrix AND the HONESTY PRINCIPLE: an ambiguous alignment must
 * yield `uncertain`, NEVER a false `applied`. It also proves that ASR variance
 * (hamza spelling, an added filler, Eastern-vs-Western digits) still aligns as
 * PRESENT, so normalization does its job and never invents a phantom cut.
 */

import { describe, it, expect } from "vitest"
import {
  reviewEpisodeEdits,
  alignmentTokens,
  type ReviewMapInput,
} from "@/lib/studio/episode-review"
import type { TimedSegment } from "@/lib/studio/segments"

const seg = (start: number, end: number, text: string): TimedSegment => ({
  start,
  end,
  text,
  chunk: 0,
})

// Distinct, tokenizable Arabic content used across cases.
const BEFORE = "المقدمة الأولى للحلقة كانت ممتعة"
const AFTER = "عدنا الآن لاستكمال النقاش المفيد"
const BREAK_A = "فاصل اعلاني ورعاية المنتج التجاري"
const BREAK_B = "استراحة قصيرة موسيقى خلفية هادئة"

// ── Tokenizer / normalization (REUSED tools compose correctly) ───────────────

describe("alignmentTokens — normalization reuse", () => {
  it("folds Eastern-Arabic + Persian digits to Western", () => {
    expect(alignmentTokens("عمري ٣٠ سنة")).toContain("30")
    expect(alignmentTokens("رقم ۲۵ هنا")).toContain("25")
  })

  it("folds hamza/alef + taa-marbuta so spelling variants match", () => {
    // أنا→انا, بدأت→بدات, سنة→سنه — the two spellings tokenize identically.
    expect(alignmentTokens("أنا بدأت سنة")).toEqual(alignmentTokens("انا بدات سنه"))
  })

  it("drops the conservative filler set + sub-2-char tokens", () => {
    const toks = alignmentTokens("اه يعني الاقتصاد يمكن ايه")
    expect(toks).toEqual(["الاقتصاد"])
  })
})

// ── The verdict matrix ───────────────────────────────────────────────────────

describe("reviewEpisodeEdits — note verdicts", () => {
  it("break fully removed → applied", () => {
    const raw = [seg(0, 5, BEFORE), seg(5, 15, BREAK_A), seg(15, 20, AFTER)]
    const map: ReviewMapInput = {
      episode_true_start: 0,
      breaks: [{ start_seconds: 5, end_seconds: 15 }],
    }
    const edited = [seg(0, 5, BEFORE), seg(5, 10, AFTER)] // break gone

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.notes).toHaveLength(1)
    expect(review.notes[0].type).toBe("break")
    expect(review.notes[0].status).toBe("applied")
    expect(review.notes[0].absent_fraction).toBeGreaterThanOrEqual(0.85)
    expect(review.summary.applied).toBe(1)
    expect(review.extra_cuts).toHaveLength(0) // the cut is explained by the note
  })

  it("fully-removed break with ~20% fuzzy leftover → applied (REGION_REMOVAL_TOLERANCE 0.20)", () => {
    // Finding #4: on a real pair a FULLY-removed break read `partial` at
    // absent=0.80 because a few short removed segments scored just above ABSENT.
    // Five equal 2s segments in the break: four absent + one that coincidentally
    // echoes retained speech (present) → absent_fraction = 0.80. At the calibrated
    // 0.20 tolerance (1 − 0.20 = 0.80) this reads `applied`; under the OLD 0.15
    // (1 − 0.15 = 0.85) the exact same input read `partial`.
    const BEFORE_R = "المقدمه الطبيعيه للتسجيل واضحه تماما"
    const AD1 = "اعلان اول دعايه تجاريه منفصله"
    const AD2 = "اعلان ثاني رعايه مختلفه تماما"
    const AD3 = "اعلان ثالث ترويج منتج جديد"
    const AD4 = "اعلان رابع خدمه غير متعلقه"
    const ECHO = "هذه العباره بقيت موجوده في التعديل"
    const raw = [
      seg(0, 5, BEFORE_R),
      seg(5, 7, AD1),
      seg(7, 9, AD2),
      seg(9, 11, AD3),
      seg(11, 13, AD4),
      seg(13, 15, ECHO),
    ]
    const map: ReviewMapInput = {
      episode_true_start: 0,
      breaks: [{ start_seconds: 5, end_seconds: 15 }],
    }
    const edited = [seg(0, 5, BEFORE_R), seg(5, 7, ECHO)] // whole break gone; echo survives

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.notes[0].status).toBe("applied")
    expect(review.notes[0].absent_fraction).toBeCloseTo(0.8, 5)
    expect(review.notes[0].present_fraction).toBeCloseTo(0.2, 5)
    expect(review.summary.applied).toBe(1)
  })

  it("break still present in edited → not_applied", () => {
    const raw = [seg(0, 5, BEFORE), seg(5, 15, BREAK_A), seg(15, 20, AFTER)]
    const map: ReviewMapInput = {
      episode_true_start: 0,
      breaks: [{ start_seconds: 5, end_seconds: 15 }],
    }
    const edited = [seg(0, 5, BEFORE), seg(5, 15, BREAK_A), seg(15, 20, AFTER)] // nothing cut

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.notes[0].status).toBe("not_applied")
    expect(review.notes[0].present_fraction).toBeGreaterThanOrEqual(0.85)
    expect(review.summary.not_applied).toBe(1)
  })

  it("break partially cut → partial", () => {
    const raw = [
      seg(0, 5, BEFORE),
      seg(5, 15, BREAK_A), // removed
      seg(15, 25, BREAK_B), // kept
      seg(25, 30, AFTER),
    ]
    const map: ReviewMapInput = {
      episode_true_start: 0,
      breaks: [{ start_seconds: 5, end_seconds: 25 }],
    }
    const edited = [seg(0, 5, BEFORE), seg(5, 15, BREAK_B), seg(15, 20, AFTER)]

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.notes[0].status).toBe("partial")
    expect(review.notes[0].absent_fraction).toBeCloseTo(0.5, 5)
    expect(review.notes[0].present_fraction).toBeCloseTo(0.5, 5)
    expect(review.summary.partial).toBe(1)
  })

  it("pre-roll removed → applied", () => {
    const PRE = "تجربة المايك واحد اثنان تشيك"
    const REAL1 = "أهلاً بكم في الحلقة الجديدة"
    const REAL2 = "نبدأ موضوعنا المهم اليوم مباشرة"
    const raw = [seg(0, 10, PRE), seg(10, 20, REAL1), seg(20, 30, REAL2)]
    const map: ReviewMapInput = { episode_true_start: 10, breaks: [] }
    const edited = [seg(0, 10, REAL1), seg(10, 20, REAL2)] // pre-roll gone

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.notes).toHaveLength(1)
    expect(review.notes[0].type).toBe("pre_roll")
    expect(review.notes[0].status).toBe("applied")
  })

  it("pre-roll NOT removed → not_applied", () => {
    const PRE = "تجربة المايك واحد اثنان تشيك"
    const REAL1 = "أهلاً بكم في الحلقة الجديدة"
    const REAL2 = "نبدأ موضوعنا المهم اليوم مباشرة"
    const raw = [seg(0, 10, PRE), seg(10, 20, REAL1), seg(20, 30, REAL2)]
    const map: ReviewMapInput = { episode_true_start: 10, breaks: [] }
    const edited = [seg(0, 10, PRE), seg(10, 20, REAL1), seg(20, 30, REAL2)]

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.notes[0].type).toBe("pre_roll")
    expect(review.notes[0].status).toBe("not_applied")
  })

  it("extra unmarked cut (filler he removed) → extra_cut, informational", () => {
    const OPEN = "الجملة الأولى الافتتاحية المهمة جدا"
    const FILLER = "اممم حشو كلام زائد بدون فائدة" // no note marks this
    const CLOSE = "الجملة الأخيرة الختامية الواضحة تماما"
    const raw = [seg(0, 10, OPEN), seg(10, 20, FILLER), seg(20, 30, CLOSE)]
    const map: ReviewMapInput = { episode_true_start: 0, breaks: [] }
    const edited = [seg(0, 10, OPEN), seg(10, 20, CLOSE)] // filler removed

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.notes).toHaveLength(0) // no Phase-1 notes at all
    expect(review.extra_cuts).toHaveLength(1)
    expect(review.extra_cuts[0].raw_range).toEqual({ start: 10, end: 20 })
    expect(review.summary.extra).toBe(1)
  })
})

// ── THE HONESTY PRINCIPLE (the most important test) ──────────────────────────

describe("reviewEpisodeEdits — honesty principle", () => {
  it("ambiguous/low-similarity alignment → uncertain, NEVER a false applied", () => {
    // The break said "النقاش تناول الاقتصاد والسياسة والتعليم"; retained speech
    // elsewhere partially echoes it ("النقاش تناول موضوع...") so ~2 of 5 tokens
    // match → Jaccard lands in the ambiguous band. We CANNOT prove the cut, so
    // the verdict must be `uncertain`, not a confident ✅.
    const BEFORE_N = "بداية عادية للتسجيل الصوتي هنا"
    const BREAK_N = "النقاش تناول الاقتصاد والسياسة والتعليم"
    const raw = [seg(0, 5, BEFORE_N), seg(5, 15, BREAK_N)]
    const map: ReviewMapInput = {
      episode_true_start: 0,
      breaks: [{ start_seconds: 5, end_seconds: 15 }],
    }
    const edited = [seg(0, 5, BEFORE_N), seg(5, 10, "النقاش تناول موضوع موضوع موضوع")]

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.notes[0].status).toBe("uncertain")
    // The load-bearing assertion: it must NOT be a false ✅.
    expect(review.notes[0].status).not.toBe("applied")
    expect(review.notes[0].uncertain_fraction).toBeGreaterThan(0)
    expect(review.overall_confidence).toBeLessThan(1)
  })

  it("a break with no transcribable content (silence/filler) → uncertain, not applied", () => {
    const raw = [seg(0, 5, "بداية عادية للتسجيل الصوتي هنا"), seg(5, 10, "اه يعني اه")]
    const map: ReviewMapInput = {
      episode_true_start: 0,
      breaks: [{ start_seconds: 5, end_seconds: 10 }],
    }
    const edited = [seg(0, 5, "بداية عادية للتسجيل الصوتي هنا")]

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.notes[0].status).toBe("uncertain")
    expect(review.notes[0].content_seconds).toBe(0)
  })
})

// ── ASR variance must NOT read as a phantom cut ──────────────────────────────

describe("reviewEpisodeEdits — ASR variance robustness", () => {
  it("same content, different hamza/filler/digits still aligns as PRESENT", () => {
    // If normalization failed, the re-transcribed break would look absent and
    // be falsely reported `applied`. Proving `not_applied` proves the content
    // was recognized as still present despite the ASR differences.
    const BEFORE_V = "الجملة الافتتاحية الطبيعية تماما هنا"
    const rawBreak = "أنا بدأت مشروعي وعمري ٢٥ سنة تقريبا"
    const editedBreak = "انا بدات مشروعي يعني وعمري 25 سنه تقريبا" // hamza + filler + digits differ
    const raw = [seg(0, 5, BEFORE_V), seg(5, 15, rawBreak)]
    const map: ReviewMapInput = {
      episode_true_start: 0,
      breaks: [{ start_seconds: 5, end_seconds: 15 }],
    }
    const edited = [seg(0, 5, BEFORE_V), seg(5, 15, editedBreak)]

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.notes[0].status).toBe("not_applied") // present, NOT a false cut
    expect(review.notes[0].status).not.toBe("applied")
    expect(review.extra_cuts).toHaveLength(0)
  })
})

// ── Duration / summary / confidence bookkeeping ──────────────────────────────

describe("reviewEpisodeEdits — bookkeeping", () => {
  it("reports raw/edited durations and a clean summary", () => {
    const raw = [seg(0, 5, BEFORE), seg(5, 15, BREAK_A), seg(15, 20, AFTER)]
    const map: ReviewMapInput = {
      episode_true_start: 0,
      breaks: [{ start_seconds: 5, end_seconds: 15 }],
    }
    const edited = [seg(0, 5, BEFORE), seg(5, 10, AFTER)]

    const review = reviewEpisodeEdits(raw, map, edited)
    expect(review.raw_duration).toBe(20)
    expect(review.edited_duration).toBe(10)
    expect(review.overall_confidence).toBeGreaterThan(0)
    expect(review.overall_confidence).toBeLessThanOrEqual(1)
  })
})

// ── Malformed input MUST throw (never review what it can't stand behind) ──────

describe("reviewEpisodeEdits — malformed input throws", () => {
  const okMap: ReviewMapInput = { episode_true_start: 0, breaks: [] }
  const okSegs = [seg(0, 5, BEFORE)]

  it("throws on empty rawSegments", () => {
    expect(() => reviewEpisodeEdits([], okMap, okSegs)).toThrow(/non-empty/)
  })

  it("throws on empty editedSegments", () => {
    expect(() => reviewEpisodeEdits(okSegs, okMap, [])).toThrow(/non-empty/)
  })

  it("throws when a segment ends before it starts", () => {
    expect(() =>
      reviewEpisodeEdits([seg(10, 5, BEFORE)], okMap, okSegs),
    ).toThrow(/before it starts/)
  })

  it("throws on non-monotonic segments", () => {
    const outOfOrder = [seg(10, 15, BEFORE), seg(0, 5, AFTER)]
    expect(() => reviewEpisodeEdits(outOfOrder, okMap, okSegs)).toThrow(/monotonic/)
  })

  it("throws on negative episode_true_start", () => {
    expect(() =>
      reviewEpisodeEdits(okSegs, { episode_true_start: -1, breaks: [] }, okSegs),
    ).toThrow(/episode_true_start/)
  })

  it("throws on a break whose end precedes its start", () => {
    expect(() =>
      reviewEpisodeEdits(
        okSegs,
        { episode_true_start: 0, breaks: [{ start_seconds: 15, end_seconds: 5 }] },
        okSegs,
      ),
    ).toThrow(/invalid/)
  })
})
