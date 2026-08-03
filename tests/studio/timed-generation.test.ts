/**
 * ص-٥ + ص-٦ — proven timings and the caption quality gate.
 *
 * The pure halves are asserted here (no paid AI, no I/O): id→seconds
 * resolution, the refusal paths, the VTT bridge, and the gate that
 * replaced the old "are the captions longer than ten characters?" test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import {
  buildWindowMap,
  resolveTimedChapters,
  resolveTimedClips,
  resolveTimedTimestamps,
  windowIdFor,
  assessWindowSpans,
  assessChapterCoverage,
} from "@/lib/ai/studio-timed"
import { timedSegmentsFromRaw } from "@/lib/studio/timed-transcript"
import {
  assessCaptionQuality,
  MIN_CAPTION_CHARS,
  MEASURED_CHARS_PER_MINUTE,
} from "@/lib/studio/caption-gate"
import { stripChunkScaffold } from "@/lib/studio/utils"
import type { TimedSegment } from "@/lib/studio/segments"

beforeEach(() => {
  vi.restoreAllMocks()
})

function windows(count: number, span = 20): TimedSegment[] {
  return Array.from({ length: count }, (_, i) => ({
    start: i * span,
    end: i * span + span,
    text: `نص النافذة رقم ${i + 1}`,
    chunk: 0,
  }))
}

describe("resolveTimedChapters", () => {
  const segMap = buildWindowMap(windows(100))

  it("takes the seconds from the window, not from the model", () => {
    const out = resolveTimedChapters(
      [
        { start_segment_id: "S001", title: "البداية" },
        { start_segment_id: "S031", title: "التحول" },
      ],
      segMap,
    )

    // S031 is the 31st window → (31-1) * 20s = 600s = 00:10:00
    expect(out).toEqual([
      { start_time: "00:00:00", title: "البداية" },
      { start_time: "00:10:00", title: "التحول" },
    ])
  })

  it("rejects an invented window id instead of shipping a plausible number", () => {
    expect(() =>
      resolveTimedChapters(
        [{ start_segment_id: "S999", title: "لا وجود لها" }],
        segMap,
      ),
    ).toThrow(/not a real window id/)
  })

  it("sorts by real time and anchors the first chapter at zero", () => {
    const out = resolveTimedChapters(
      [
        { start_segment_id: "S051", title: "متأخر" },
        { start_segment_id: "S011", title: "مبكر" },
      ],
      segMap,
    )

    expect(out.map((c) => c.title)).toEqual(["مبكر", "متأخر"])
    expect(out[0].start_time).toBe("00:00:00")
  })

  it("collapses two titles landing on one window", () => {
    const out = resolveTimedChapters(
      [
        { start_segment_id: "S001", title: "أ" },
        { start_segment_id: "S021", title: "ب" },
        { start_segment_id: "S021", title: "ج" },
      ],
      segMap,
    )
    expect(out).toHaveLength(2)
  })
})

describe("resolveTimedClips", () => {
  const segMap = buildWindowMap(windows(100))

  it("cannot produce an impossible clock value like 00:64:20", () => {
    // The old generator emitted exactly that — minutes above 59 — and
    // nothing rejected it. Window ids make it unrepresentable: S097 is
    // 96*20s = 1920s, which can only render as 00:32:00.
    const out = resolveTimedClips(
      [{ start_segment_id: "S097", end_segment_id: "S099", title: "مقطع" }],
      segMap,
    )

    expect(out[0].start_time).toBe("00:32:00")
    expect(out[0].end_time).toBe("00:33:00")
    for (const clip of out) {
      for (const stamp of [clip.start_time, clip.end_time]) {
        const [, m, s] = stamp.split(":").map(Number)
        expect(m).toBeLessThan(60)
        expect(s).toBeLessThan(60)
      }
    }
  })

  it("drops a reversed range rather than losing the batch", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const out = resolveTimedClips(
      [
        { start_segment_id: "S010", end_segment_id: "S002", title: "مقلوب" },
        { start_segment_id: "S020", end_segment_id: "S022", title: "سليم" },
      ],
      segMap,
    )
    expect(out).toHaveLength(1)
    expect(out[0].caption).toBe("سليم")
    expect(warn).toHaveBeenCalled()
  })

  it("throws when nothing resolved", () => {
    expect(() =>
      resolveTimedClips(
        [{ start_segment_id: "S010", end_segment_id: "S002", title: "مقلوب" }],
        buildWindowMap(windows(30)),
      ),
    ).toThrow(/no clips resolved/)
  })
})

/**
 * ص-٨ — the public episode index. Same contract as chapters, but this is
 * the one that renders on khatpodcast.com, and until now it was the only
 * timed output still being estimated from interpolated labels.
 */
describe("resolveTimedTimestamps", () => {
  const segMap = buildWindowMap(windows(100))

  it("takes time_seconds from the window, never from the model", () => {
    const out = resolveTimedTimestamps(
      [
        { start_segment_id: "S001", title: "كيف بدأ كل شيء", description: "وصف" },
        { start_segment_id: "S040", title: "نقطة التحول", description: null },
      ],
      segMap,
    )
    expect(out).toEqual([
      { time_seconds: 0, title: "كيف بدأ كل شيء", description: "وصف" },
      { time_seconds: 780, title: "نقطة التحول", description: null },
    ])
  })

  it("throws on an unknown id rather than shipping a plausible number", () => {
    expect(() =>
      resolveTimedTimestamps(
        [{ start_segment_id: "S999", title: "مخترع" }],
        segMap,
      ),
    ).toThrow(/not a real window id/)
  })

  it("throws when nothing resolved at all", () => {
    expect(() => resolveTimedTimestamps([], segMap)).toThrow(/no timestamps resolved/)
  })

  it("sorts by time and drops two titles landing on one window", () => {
    const out = resolveTimedTimestamps(
      [
        { start_segment_id: "S010", title: "متأخر" },
        { start_segment_id: "S002", title: "مبكر" },
        { start_segment_id: "S002", title: "مكرر" },
      ],
      segMap,
    )
    expect(out.map((t) => t.time_seconds)).toEqual([20, 180])
    expect(out[0].title).toBe("مبكر")
  })

  it("skips rows with no title, and blanks a whitespace-only description", () => {
    const out = resolveTimedTimestamps(
      [
        { start_segment_id: "S003", title: "  " },
        { start_segment_id: "S004", title: "عنوان", description: "   " },
      ],
      segMap,
    )
    expect(out).toEqual([{ time_seconds: 60, title: "عنوان", description: null }])
  })

  it("does NOT force the first row to zero — that is a YouTube rule, not a page rule", () => {
    const out = resolveTimedTimestamps(
      [{ start_segment_id: "S005", title: "يبدأ متأخراً" }],
      segMap,
    )
    expect(out[0].time_seconds).toBe(80)
  })
})

describe("windowIdFor", () => {
  it("matches renderWithIds' scheme", () => {
    expect(windowIdFor(0)).toBe("S001")
    expect(windowIdFor(46)).toBe("S047")
  })
})

describe("timedSegmentsFromRaw", () => {
  const VTT = `WEBVTT
Kind: captions
Language: ar

00:00:01.000 --> 00:00:04.000
مرحباً بكم في بودكاست خط

00:00:04.000 --> 00:00:08.000
اليوم نتكلم عن نور الدين زنكي
`

  it("reads real cue timings out of stored VTT", () => {
    const segs = timedSegmentsFromRaw(VTT)
    expect(segs).not.toBeNull()
    expect(segs![0].start).toBe(1)
    expect(segs![1].start).toBe(4)
  })

  it("returns null — never fabricated anchors — for plain text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(timedSegmentsFromRaw("مرحبا بالعالم كيف حالك اليوم")).toBeNull()
    // No cue arrows at all: rejected before the builder is even called,
    // so nothing is logged as a failure.
    expect(warn).not.toHaveBeenCalled()
  })

  it("returns null for empty input", () => {
    expect(timedSegmentsFromRaw("")).toBeNull()
  })
})

describe("assessCaptionQuality", () => {
  const realistic = (minutes: number) =>
    "ك".repeat(Math.round(minutes * MEASURED_CHARS_PER_MINUTE))

  it("accepts a full-length track", () => {
    const v = assessCaptionQuality(realistic(216), 216 * 60)
    expect(v.usable).toBe(true)
    expect(v.reason).toBe("ok")
  })

  it("rejects the file the old 10-character test would have accepted", () => {
    // "أهلاً وسهلاً بكم" is >10 chars, so the old gate passed it and it
    // beat a full transcription.
    const v = assessCaptionQuality("أهلاً وسهلاً بكم جميعاً", 216 * 60)
    expect(v.usable).toBe(false)
    expect(v.reason).toBe("too_short")
  })

  it("rejects a track far too sparse for the episode length", () => {
    // Passes the length floor, but covers a fraction of a 216-min episode.
    const v = assessCaptionQuality(realistic(20), 216 * 60)
    expect(v.usable).toBe(false)
    expect(v.reason).toBe("too_sparse_for_duration")
  })

  it("falls back to length alone when duration is unknown", () => {
    expect(assessCaptionQuality(realistic(20), null).usable).toBe(true)
    expect(assessCaptionQuality("قصير", null).usable).toBe(false)
  })

  it("rejects empty input", () => {
    expect(assessCaptionQuality("", 600).reason).toBe("empty")
    expect(assessCaptionQuality(null, 600).reason).toBe("empty")
  })

  it("uses a floor low enough not to reject real tracks", () => {
    // A genuinely complete track at half the measured density still passes.
    const v = assessCaptionQuality(realistic(108), 216 * 60)
    expect(v.usable).toBe(true)
    expect(MIN_CAPTION_CHARS).toBeLessThan(realistic(108).length)
  })
})

describe("stripChunkScaffold", () => {
  it("removes the summarizer scaffold that reached a published package", () => {
    const out = stripChunkScaffold(
      "في هذه الحلقة [الجزء 3/6 — تقريباً من الدقيقة 22 إلى الدقيقة 33] نتناول سقوط الرها.",
    )
    expect(out).not.toContain("الجزء")
    expect(out).toContain("سقوط الرها")
  })

  it("handles the bare (unbracketed) form the model also emitted", () => {
    expect(stripChunkScaffold("الجزء 6/6 — من الدقيقة 180 إلى 216 غير متاح")).not.toContain("6/6")
  })

  it("leaves ordinary prose alone", () => {
    const prose = "تكلم عن الجزء الأول من حياته بصدق."
    expect(stripChunkScaffold(prose)).toBe(prose)
  })

  it("passes null through", () => {
    expect(stripChunkScaffold(null)).toBeNull()
  })
})

describe("assessWindowSpans", () => {
  it("confirms the ≤30s accuracy claim when windows are tight", () => {
    const r = assessWindowSpans(windows(50, 20))
    expect(r.withinClaim).toBe(true)
    expect(r.overLimit).toBe(0)
    expect(r.maxSpanSeconds).toBe(20)
  })

  it("flags the case the claim was silently assuming away", () => {
    // mergeIntoWindows grows a window until the NEXT segment would exceed
    // the target, so one long caption cue can push a window past 30s. The
    // reference episode never did — every other episode was unverified.
    const wide = [
      { start: 0, end: 20, text: "أ", chunk: 0 },
      { start: 20, end: 65, text: "ب", chunk: 0 },
    ]
    const r = assessWindowSpans(wide)
    expect(r.withinClaim).toBe(false)
    expect(r.overLimit).toBe(1)
    expect(r.maxSpanSeconds).toBe(45)
  })
})

describe("assessChapterCoverage", () => {
  const EPISODE = 12954 // the reference episode, 215.9 min

  it("warns on the real gap the reference run left behind", () => {
    // Last chapter at 02:47:11 = 77.4% → 48.7 minutes with no chapter.
    const r = assessChapterCoverage(
      [
        { start_time: "00:00:00", title: "أ" },
        { start_time: "02:47:11", title: "ب" },
      ],
      EPISODE,
    )
    expect(r.warning).toContain("77%")
    expect(Math.round(r.tailGapSeconds / 60)).toBe(49)
  })

  it("warns on a large gap between two chapters", () => {
    const r = assessChapterCoverage(
      [
        { start_time: "00:00:00", title: "أ" },
        { start_time: "00:27:00", title: "ب" },
        { start_time: "03:35:00", title: "ج" },
      ],
      EPISODE,
    )
    expect(r.warning).toContain("فجوة")
  })

  it("stays silent when coverage is healthy", () => {
    const chapters = Array.from({ length: 20 }, (_, i) => ({
      start_time: new Date(i * 640 * 1000).toISOString().slice(11, 19),
      title: `فصل ${i}`,
    }))
    const r = assessChapterCoverage(chapters, EPISODE)
    expect(r.warning).toBeNull()
  })

  it("never invents a timestamp — it only reports", () => {
    const input = [{ start_time: "00:00:00", title: "أ" }]
    const r = assessChapterCoverage(input, EPISODE)
    // The old path would have relocated the last chapter to 95%.
    expect(r.lastChapterSeconds).toBe(0)
    expect(r.warning).not.toBeNull()
  })
})

describe("chapter prompt — per-part floor", () => {
  /** Mirrors the derivation in generateStudioChapters. */
  const floorFor = (chars: number, targetMax: number) => {
    const parts = Math.max(1, Math.ceil(Math.min(chars, 400_000) / 20_000))
    const floor = parts <= targetMax ? Math.floor(targetMax / parts) : null
    return { parts, floor }
  }

  it("never demands more chapters than the target allows", () => {
    for (const chars of [40_000, 120_130, 200_000, 400_000]) {
      const { parts, floor } = floorFor(chars, 16)
      // Either the floor fits inside the target, or no numeric floor is
      // stated at all — never an instruction the model cannot satisfy.
      if (floor !== null) expect(parts * floor).toBeLessThanOrEqual(16)
    }
  })

  it("the old fixed floor of 2 becomes impossible past 8 parts", () => {
    // 9 parts × 2 = 18 chapters against a 12-16 target. Unreachable while
    // the 100k cap held the split at 5; reachable now that B′ lifted it.
    const { parts, floor } = floorFor(180_000, 16)
    expect(parts).toBeGreaterThan(8)
    expect(parts * 2).toBeGreaterThan(16)
    expect(parts * floor!).toBeLessThanOrEqual(16)
  })

  it("drops the numeric floor entirely when parts exceed the target", () => {
    // 400k chars → 20 parts against a 16 target: even one per part is too
    // many, so there is no honest number to state.
    expect(floorFor(400_000, 16).floor).toBeNull()
  })

  it("keeps a real floor at ordinary episode lengths", () => {
    expect(floorFor(120_130, 16).floor).toBeGreaterThanOrEqual(1)
  })
})
