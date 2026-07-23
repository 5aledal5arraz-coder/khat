/**
 * Studio Wave 2, Stage 1 — episode-map generator (anti-fabrication core).
 *
 * These prove the STRUCTURAL guarantee: the model can only return ids + labels,
 * and code re-attaches the authoritative seconds. So we test:
 *   - T5: an unknown segment_id / gap_id, or a non-substring first_real_sentence,
 *     is REJECTED (never mapped to a plausible-wrong number).
 *   - id → seconds conversion + ffmpeg gap re-attachment.
 *   - platform_fit derived from opens_with by a fixed CODE rule.
 *
 * runAiTask + detectBreaks are mocked — NO paid AI, NO ffmpeg. The end-to-end
 * paid T1 (real audio, delete a 20s segment → later timestamps shift −20s) is
 * left for Noura's independent QA with a budget.
 */

import { describe, expect, it, vi, beforeEach } from "vitest"
import fs from "fs"
import path from "path"

// ── mock the two side-effecting dependencies of the generator ────────────────
const runAiTaskMock = vi.fn()
vi.mock("@/lib/ai-router", () => ({
  runAiTask: (args: unknown) => runAiTaskMock(args),
}))
const detectBreaksMock = vi.fn()
vi.mock("@/lib/audio/silence", () => ({
  detectBreaks: (p: string) => detectBreaksMock(p),
}))

import {
  resolveEpisodeMap,
  derivePlatformFit,
  generateEpisodeMap,
} from "@/lib/ai/episode-map"
import { mergeIntoWindows, type TimedSegment } from "@/lib/studio/segments"
import { filterDegenerateSegments } from "@/lib/studio/transcript-quality"
import type { EpisodeMapModelOutput } from "@/lib/ai/prompts/episode-map"

// ── helpers to build the authoritative maps resolveEpisodeMap consumes ───────

function windowId(i: number): string {
  return `S${String(i + 1).padStart(3, "0")}`
}

function buildSegMap(windows: TimedSegment[]) {
  const m = new Map<string, { segment: TimedSegment; index: number }>()
  windows.forEach((w, i) => m.set(windowId(i), { segment: w, index: i }))
  return m
}

function buildGapMap(
  gaps: Array<{ start: number; end: number; durationSeconds: number }>,
) {
  const m = new Map<string, { start: number; end: number; durationSeconds: number }>()
  gaps.forEach((g, i) => m.set(`GAP_${i + 1}`, g))
  return m
}

const PROV = { promptVersion: "episode-map-v1.0", aiRunId: "run-1", modelName: "gpt-5.6-luna" }

// Three windows; the real content begins at window S002 (start=300s).
const WINDOWS: TimedSegment[] = [
  { start: 0, end: 10, text: "تجربة مايك سوالف تجهيز", chunk: 0 },
  { start: 300, end: 310, text: "أنا خسرت كل شي وقتها بعدها قمت من جديد", chunk: 0 },
  { start: 600, end: 605, text: "ضيفنا اليوم خالد", chunk: 0 },
]
// One ffmpeg-detected break (numbers belong to ffmpeg).
const GAPS = [{ start: 10, end: 300, durationSeconds: 290 }]

function validModel(): EpisodeMapModelOutput {
  return {
    true_start_segment_id: "S002",
    first_real_sentence: "أنا خسرت كل شي وقتها",
    pre_roll_summary: "سوالف وتجهيز مايك قبل البداية",
    gaps: [{ gap_id: "GAP_1", label: "break", label_reason: "استراحة بين الأجزاء" }],
    hook_candidates: [
      { rank: 2, start_segment_id: "S003", end_segment_id: "S003", opens_with: "guest_name", why: "تعريف الضيف" },
      { rank: 1, start_segment_id: "S002", end_segment_id: "S002", opens_with: "stake", why: "مخاطرة صادمة" },
    ],
  }
}

// ═══ resolveEpisodeMap — happy path: id → seconds + gap re-attachment ═════════

describe("resolveEpisodeMap — id → real seconds", () => {
  const segMap = buildSegMap(WINDOWS)
  const gapMap = buildGapMap(GAPS)

  it("converts the true_start segment id to that window's real start", () => {
    const map = resolveEpisodeMap(validModel(), segMap, gapMap, PROV)
    expect(map.episode_true_start).toBe(300)
    expect(map.first_real_sentence).toBe("أنا خسرت كل شي وقتها")
    expect(map.pre_roll_summary).toContain("تجهيز")
  })

  it("re-attaches ffmpeg's numbers to each labelled gap by id", () => {
    const map = resolveEpisodeMap(validModel(), segMap, gapMap, PROV)
    expect(map.breaks).toEqual([
      {
        gap_id: "GAP_1",
        start_seconds: 10,
        end_seconds: 300,
        duration_seconds: 290,
        label: "break",
        label_reason: "استراحة بين الأجزاء",
      },
    ])
  })

  it("converts hook segment ids to seconds, sorts by rank, and stamps provenance", () => {
    const map = resolveEpisodeMap(validModel(), segMap, gapMap, PROV)
    expect(map.hook_candidates.map((h) => h.rank)).toEqual([1, 2])
    // rank 1 = the stake hook at window S002 (300–310s)
    expect(map.hook_candidates[0]).toMatchObject({
      rank: 1,
      start_seconds: 300,
      end_seconds: 310,
      opens_with: "stake",
    })
    // rank 2 = the guest_name hook at window S003 (600–605s)
    expect(map.hook_candidates[1]).toMatchObject({
      rank: 2,
      start_seconds: 600,
      end_seconds: 605,
      opens_with: "guest_name",
    })
    expect(map.ai_run_id).toBe("run-1")
    expect(map.model_name).toBe("gpt-5.6-luna")
    expect(map.prompt_version).toBe("episode-map-v1.0")
  })

  it("accepts a first_real_sentence that matches only after whitespace normalization", () => {
    const model = validModel()
    model.first_real_sentence = "  أنا   خسرت كل شي   وقتها  "
    const map = resolveEpisodeMap(model, segMap, gapMap, PROV)
    // Stored verbatim as the model sent it; the PROOF check is whitespace-lenient.
    expect(map.episode_true_start).toBe(300)
  })
})

// ═══ T5 — rejection paths (a wrong id is an error, not a wrong number) ════════

describe("resolveEpisodeMap — anti-fabrication rejections (T5)", () => {
  const segMap = buildSegMap(WINDOWS)
  const gapMap = buildGapMap(GAPS)

  it("rejects an unknown true_start segment id", () => {
    const model = validModel()
    model.true_start_segment_id = "S999"
    expect(() => resolveEpisodeMap(model, segMap, gapMap, PROV)).toThrow(/not a real window id/)
  })

  it("rejects a first_real_sentence that is not a verbatim substring", () => {
    const model = validModel()
    model.first_real_sentence = "جملة ما قالها الضيف أبداً"
    expect(() => resolveEpisodeMap(model, segMap, gapMap, PROV)).toThrow(/not a verbatim substring/)
  })

  it("rejects an empty first_real_sentence (proof missing)", () => {
    const model = validModel()
    model.first_real_sentence = "   "
    expect(() => resolveEpisodeMap(model, segMap, gapMap, PROV)).toThrow(/proof missing/)
  })

  it("rejects an unknown gap id", () => {
    const model = validModel()
    model.gaps = [{ gap_id: "GAP_9", label: "break", label_reason: "x" }]
    expect(() => resolveEpisodeMap(model, segMap, gapMap, PROV)).toThrow(/not among the detected gaps/)
  })

  it("rejects an unknown gap label", () => {
    const model = validModel()
    model.gaps = [{ gap_id: "GAP_1", label: "cut_this" as never, label_reason: "x" }]
    expect(() => resolveEpisodeMap(model, segMap, gapMap, PROV)).toThrow(/unknown label/)
  })

  it("rejects a duplicated gap id", () => {
    const model = validModel()
    model.gaps = [
      { gap_id: "GAP_1", label: "break", label_reason: "a" },
      { gap_id: "GAP_1", label: "dead_air", label_reason: "b" },
    ]
    expect(() => resolveEpisodeMap(model, segMap, gapMap, PROV)).toThrow(/more than once/)
  })

  it("rejects an unknown hook segment id", () => {
    const model = validModel()
    model.hook_candidates = [
      { rank: 1, start_segment_id: "S002", end_segment_id: "S404", opens_with: "stake", why: "x" },
    ]
    expect(() => resolveEpisodeMap(model, segMap, gapMap, PROV)).toThrow(/not a real window id/)
  })

  it("rejects a hook whose range ends before it starts", () => {
    const model = validModel()
    model.hook_candidates = [
      { rank: 1, start_segment_id: "S003", end_segment_id: "S002", opens_with: "stake", why: "x" },
    ]
    expect(() => resolveEpisodeMap(model, segMap, gapMap, PROV)).toThrow(/ends before it starts/)
  })

  it("rejects an unknown opens_with", () => {
    const model = validModel()
    model.hook_candidates = [
      { rank: 1, start_segment_id: "S002", end_segment_id: "S002", opens_with: "clickbait" as never, why: "x" },
    ]
    expect(() => resolveEpisodeMap(model, segMap, gapMap, PROV)).toThrow(/unknown opens_with/)
  })
})

// ═══ derivePlatformFit — fixed CODE rule (marzouq's finding) ══════════════════

describe("derivePlatformFit — code decides platform, not the model", () => {
  it("guest-name-led hooks die on TikTok, win on YouTube", () => {
    const fit = derivePlatformFit("guest_name")
    expect(fit.tiktok).toBe("weak")
    expect(fit.youtube).toBe("strong")
    expect(fit.recommended).toEqual(["youtube"])
  })

  it("stake-led hooks are strong on TikTok + Instagram", () => {
    const fit = derivePlatformFit("stake")
    expect(fit.tiktok).toBe("strong")
    expect(fit.recommended).toContain("tiktok")
    expect(fit.recommended).toContain("instagram")
  })

  it("direct-you (أنت command) hooks are strong short-form", () => {
    const fit = derivePlatformFit("direct_you")
    expect(fit.tiktok).toBe("strong")
    expect(fit.youtube).toBe("moderate")
  })
})

// ═══ generateEpisodeMap — full orchestration (mocked whisper + ffmpeg) ════════

describe("generateEpisodeMap — orchestration with mocked deps", () => {
  // Raw segments the generator merges into WINDOWS via mergeIntoWindows(_,20).
  const SEGMENTS: TimedSegment[] = [
    { start: 0, end: 5, text: "تجربة مايك", chunk: 0 },
    { start: 5, end: 10, text: "سوالف تجهيز", chunk: 0 },
    { start: 300, end: 305, text: "أنا خسرت كل شي وقتها", chunk: 0 },
    { start: 305, end: 310, text: "بعدها قمت من جديد", chunk: 0 },
    { start: 600, end: 605, text: "ضيفنا اليوم خالد", chunk: 0 },
  ]

  beforeEach(() => {
    runAiTaskMock.mockReset()
    detectBreaksMock.mockReset()
    detectBreaksMock.mockResolvedValue({
      peakDb: -16,
      thresholdDb: -28,
      silences: [],
      breaks: [{ start: 10, end: 300, durationSeconds: 290, kind: "break_candidate" }],
    })
  })

  function modelFor(): EpisodeMapModelOutput {
    // window[1] holds "أنا خسرت كل شي وقتها بعدها قمت من جديد" (merged 300–310)
    return {
      true_start_segment_id: windowId(1),
      first_real_sentence: "أنا خسرت كل شي وقتها",
      pre_roll_summary: "تجهيز",
      gaps: [{ gap_id: "GAP_1", label: "break", label_reason: "استراحة" }],
      hook_candidates: [
        { rank: 1, start_segment_id: windowId(1), end_segment_id: windowId(1), opens_with: "stake", why: "قوي" },
      ],
    }
  }

  it("produces a validated map with REAL numbers from ids", async () => {
    const windows = mergeIntoWindows(SEGMENTS, 20)
    runAiTaskMock.mockResolvedValue({
      status: "succeeded",
      parsed: modelFor(),
      runId: "run-xyz",
      modelName: "gpt-5.6-luna",
    })

    const map = await generateEpisodeMap({
      segments: SEGMENTS,
      audioFilePath: "/fake/audio.mp3",
      sessionId: "sess-1",
    })

    expect(map.episode_true_start).toBe(windows[1].start)
    expect(map.breaks[0]).toMatchObject({ gap_id: "GAP_1", start_seconds: 10, end_seconds: 300, duration_seconds: 290 })
    expect(map.hook_candidates[0].platform_fit.tiktok).toBe("strong")
    expect(map.ai_run_id).toBe("run-xyz")

    // routed through the analysis chokepoint, expecting JSON
    expect(detectBreaksMock).toHaveBeenCalledWith("/fake/audio.mp3")
    const callArg = runAiTaskMock.mock.calls[0][0] as { taskKind: string; expectJson: boolean }
    expect(callArg.taskKind).toBe("analysis")
    expect(callArg.expectJson).toBe(true)
  })

  it("throws when the model returns an unknown segment id (no map emitted)", async () => {
    const bad = modelFor()
    bad.true_start_segment_id = "S999"
    runAiTaskMock.mockResolvedValue({
      status: "succeeded",
      parsed: bad,
      runId: "run-bad",
      modelName: "gpt-5.6-luna",
    })

    await expect(
      generateEpisodeMap({ segments: SEGMENTS, audioFilePath: "/fake/audio.mp3" }),
    ).rejects.toThrow(/not a real window id/)
  })

  it("throws when the AI task itself fails", async () => {
    runAiTaskMock.mockResolvedValue({
      status: "failed",
      parsed: null,
      runId: "run-err",
      modelName: "gpt-5.6-luna",
      errorMessage: "provider down",
    })
    await expect(
      generateEpisodeMap({ segments: SEGMENTS, audioFilePath: "/fake/audio.mp3" }),
    ).rejects.toThrow(/provider down/)
  })

  it("throws on empty segments before any AI call", async () => {
    await expect(
      generateEpisodeMap({ segments: [], audioFilePath: "/fake/audio.mp3" }),
    ).rejects.toThrow(/no segments/)
    expect(runAiTaskMock).not.toHaveBeenCalled()
  })

  it("REJECTS a degenerate (looped) transcript with the Arabic operator message, before ffmpeg or AI", async () => {
    // A whisper decoding loop: many identical consecutive segments (Noura's case).
    const looped: TimedSegment[] = Array.from({ length: 15 }, (_, i) => ({
      start: 222 + i * 2,
      end: 224 + i * 2,
      text: "ثاني",
      chunk: 0,
    }))
    await expect(
      generateEpisodeMap({ segments: looped, audioFilePath: "/fake/audio.mp3" }),
    ).rejects.toThrow(/تعذّر إنتاج خريطة موثوقة/)
    // Fail-fast: the guard runs BEFORE any ffmpeg break detection or paid AI call.
    expect(detectBreaksMock).not.toHaveBeenCalled()
    expect(runAiTaskMock).not.toHaveBeenCalled()
  })

  it("HIGH#2: REJECTS a TIME-majority garbage transcript even though the COUNT is a minority", async () => {
    // 15 short clean segments (4s each = 60s real speech) + 14 long garbage segments
    // (30s each = 420s intra-loops). By COUNT: 14/29 = 48% dropped (under the 50%
    // gate → the old count gate would BUILD a whole-episode map on a 60s minority).
    // By TIME: 420/480 = 87.5% of the audio is garbage → the time gate REJECTS.
    const GARBAGE_WORDS = ["شغل", "بيت", "وقت", "كلام", "صوت", "باب", "درب", "حال", "يوم", "شهر", "ليل", "نهار", "برد", "حر"]
    let t = 0
    const clean: TimedSegment[] = Array.from({ length: 15 }, (_, i) => {
      const s: TimedSegment = { start: t, end: t + 4, text: `جملة حقيقية متنوعة رقم ${i} في الحلقة`, chunk: 0 }
      t += 4
      return s
    })
    const garbage: TimedSegment[] = GARBAGE_WORDS.map((w) => {
      const s: TimedSegment = { start: t, end: t + 30, text: Array.from({ length: 20 }, () => w).join(" "), chunk: 0 }
      t += 30
      return s
    })
    await expect(
      generateEpisodeMap({ segments: [...clean, ...garbage], audioFilePath: "/fake/audio.mp3" }),
    ).rejects.toThrow(/تعذّر إنتاج خريطة موثوقة/)
    // Rejected on TIME, before any ffmpeg/AI spend.
    expect(detectBreaksMock).not.toHaveBeenCalled()
    expect(runAiTaskMock).not.toHaveBeenCalled()
  })

  it("HIGH#3: REJECTS a diffusely-degenerate transcript the filter can't safely trim (verdict.degenerate, droppedCount===0)", async () => {
    // The ambiguous corroborated shape: 24 "نعم"/"لا" segments — a 6-run with globally
    // collapsed uniqueness. The overall verdict is `degenerate: true`, but the surgical
    // filter DROPS NOTHING (it never deletes possibly-real emphatic repetition). With
    // no clean-and-safe remainder to fall back to, the map builder must REFUSE rather
    // than silently build on a transcript the verdict itself calls degenerate.
    const texts = [
      ...Array.from({ length: 6 }, () => "نعم"),
      ...Array.from({ length: 18 }, (_, i) => (i % 2 === 0 ? "لا" : "نعم")),
    ]
    const segs: TimedSegment[] = texts.map((text, i) => ({
      start: i * 2,
      end: i * 2 + 1.8,
      text,
      chunk: 0,
    }))
    await expect(
      generateEpisodeMap({ segments: segs, audioFilePath: "/fake/audio.mp3" }),
    ).rejects.toThrow(/تعذّر إنتاج خريطة موثوقة/)
    expect(detectBreaksMock).not.toHaveBeenCalled()
    expect(runAiTaskMock).not.toHaveBeenCalled()
  })

  it("surfaces transcript_health (dropped seconds + hole intervals) on a map built over a filtered loop", async () => {
    // 12 clean + a 12-long "ثاني" HARD inter-loop + 12 clean → the loop is filtered,
    // the map builds on the clean remainder, and the map REPORTS the hole honestly.
    let t = 0
    const mk = (text: string, dur = 5): TimedSegment => {
      const s: TimedSegment = { start: t, end: t + dur, text, chunk: 0 }
      t += dur
      return s
    }
    const before = Array.from({ length: 12 }, (_, i) => mk(`مقدمة متنوعة رقم ${i} هنا الآن`))
    const loopStart = t
    const loop = Array.from({ length: 12 }, () => mk("ثاني"))
    const loopEnd = t
    const after = Array.from({ length: 12 }, (_, i) => mk(`خاتمة متنوعة رقم ${i} هنا الآن`))
    const segs = [...before, ...loop, ...after]

    const windows = mergeIntoWindows([...before, ...after], 20) // clean-only windows
    runAiTaskMock.mockResolvedValue({
      status: "succeeded",
      parsed: {
        true_start_segment_id: windowId(0),
        first_real_sentence: windows[0].text.split(" ").slice(0, 3).join(" "),
        pre_roll_summary: "",
        gaps: [],
        hook_candidates: [],
      } as EpisodeMapModelOutput,
      runId: "run-health",
      modelName: "gpt-5.6-luna",
    })
    detectBreaksMock.mockResolvedValue({ peakDb: -16, thresholdDb: -28, silences: [], breaks: [] })

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const map = await generateEpisodeMap({ segments: segs, audioFilePath: "/fake/audio.mp3" })
    warn.mockRestore()

    expect(map.transcript_health.dropped_segments).toBe(12)
    expect(map.transcript_health.dropped_seconds).toBeCloseTo(60, 5) // 12 × 5s
    expect(map.transcript_health.dropped_intervals).toEqual([
      { start: loopStart, end: loopEnd },
    ])
    expect(map.transcript_health.suspect_run).toBeNull()
  })

  it("Finding 1 (Wave-1.6): REJECTS a MERGED residual loop the filter splices into `clean` ([8×ثاني][10×اكس][8×ثاني])", async () => {
    // The filter drops the middle 10-run "اكس" (HARD) and splices the two 8-runs of
    // "ثاني" into 16 identical segments in `clean` — a loop the pre-filter verdict never
    // saw. It slips past BOTH existing gates: remainder-too-thin (clean=16 ≥ MIN, drop
    // fraction ~0.38 < 0.5) and diffuse (droppedCount=10 > 0). Only re-assessing the
    // CLEAN remainder rejects it. This is the HIGH the adversarial review found.
    const texts = [
      ...Array.from({ length: 8 }, () => "ثاني"),
      ...Array.from({ length: 10 }, () => "اكس"),
      ...Array.from({ length: 8 }, () => "ثاني"),
    ]
    const merged: TimedSegment[] = texts.map((text, i) => ({
      start: i * 2,
      end: i * 2 + 1.8,
      text,
      chunk: 0,
    }))
    await expect(
      generateEpisodeMap({ segments: merged, audioFilePath: "/fake/audio.mp3" }),
    ).rejects.toThrow(/تعذّر إنتاج خريطة موثوقة/)
    // Refused on the residual text-check, before any ffmpeg break detection or paid AI.
    expect(detectBreaksMock).not.toHaveBeenCalled()
    expect(runAiTaskMock).not.toHaveBeenCalled()
  })

  it("Finding 1 (Wave-1.6): REJECTS a corroborated-degenerate clean remainder after a HARD loop is dropped", async () => {
    // A HARD "اكس" loop (dropped ⇒ droppedCount>0, so the diffuse gate cannot fire),
    // followed by a corroborated-shape remainder: 21 "نعم"/"لا" segments (uniqueness
    // 2/21 ≈ 0.095 ≤ 0.3, a 6-run ≥ SUSPECT, ≥ 20 for the ratio). clean=21 ≥ MIN and the
    // drop-fraction is low, so ONLY re-assessing the remainder rejects it.
    const texts = [
      ...Array.from({ length: 12 }, () => "اكس"), // HARD → dropped
      ...Array.from({ length: 6 }, () => "نعم"), // 6-run survives in the remainder
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? "لا" : "نعم")),
    ]
    const segs: TimedSegment[] = texts.map((text, i) => ({
      start: i * 2,
      end: i * 2 + 1.8,
      text,
      chunk: 0,
    }))
    await expect(
      generateEpisodeMap({ segments: segs, audioFilePath: "/fake/audio.mp3" }),
    ).rejects.toThrow(/تعذّر إنتاج خريطة موثوقة/)
    expect(detectBreaksMock).not.toHaveBeenCalled()
    expect(runAiTaskMock).not.toHaveBeenCalled()
  })

  it("Finding 3 (Wave-1.6): surfaces a borderline 5–9 suspect_run from the CLEAN remainder even when a HARD loop is dropped", async () => {
    // A dropped HARD loop pushes the PRE-filter global maxConsecutiveRun ≥ HARD, which
    // would mask a real borderline run if suspect_run were read from the pre-filter
    // verdict. Reading it from the CLEAN remainder's own metrics surfaces the 5-run.
    let t = 0
    const mk = (text: string, dur = 5): TimedSegment => {
      const s: TimedSegment = { start: t, end: t + dur, text, chunk: 0 }
      t += dur
      return s
    }
    const before = Array.from({ length: 12 }, (_, i) => mk(`مقدمة متنوعة رقم ${i} هنا الآن`))
    const hardLoop = Array.from({ length: 12 }, () => mk("اكس")) // dropped by the filter
    const mid = Array.from({ length: 6 }, (_, i) => mk(`وسط متنوع رقم ${i} هنا الآن`))
    const suspectStart = t
    const suspect = Array.from({ length: 5 }, () => mk("أكيد")) // borderline, healthy uniqueness
    const suspectEnd = t
    const after = Array.from({ length: 6 }, (_, i) => mk(`خاتمة متنوعة رقم ${i} هنا الآن`))
    const segs = [...before, ...hardLoop, ...mid, ...suspect, ...after]

    // Windows built ONLY on what survives the filter (everything but the hard loop).
    const cleanSegs = [...before, ...mid, ...suspect, ...after]
    const windows = mergeIntoWindows(cleanSegs, 20)
    runAiTaskMock.mockResolvedValue({
      status: "succeeded",
      parsed: {
        true_start_segment_id: windowId(0),
        first_real_sentence: windows[0].text.split(" ").slice(0, 3).join(" "),
        pre_roll_summary: "",
        gaps: [],
        hook_candidates: [],
      } as EpisodeMapModelOutput,
      runId: "run-suspect",
      modelName: "gpt-5.6-luna",
    })
    detectBreaksMock.mockResolvedValue({ peakDb: -16, thresholdDb: -28, silences: [], breaks: [] })

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const map = await generateEpisodeMap({ segments: segs, audioFilePath: "/fake/audio.mp3" })
    warn.mockRestore()

    // The dropped HARD loop does NOT mask the borderline run — it is reported from the
    // clean remainder's own metrics, with the run's real absolute span.
    expect(map.transcript_health.suspect_run).toEqual({
      length: 5,
      start_seconds: suspectStart,
      end_seconds: suspectEnd,
    })
  })
})

// ═══ HIGH#1 — filtered-hole rejection on REAL whisper-1 output ════════════════
// Loads the ACTUAL whisper-1 verbose_json for chunk3 of Khaled's real 86-min
// upload (the "no cross-chunk prompt" A/B arm), which still contains an
// intra-segment اشتغلنا loop (36×, compression_ratio 17.68) at 306–366s. This is
// the honest, no-mock proof that the filter drops the real garbage AND that the
// resolver refuses to send the editor across the resulting hole.
describe("HIGH#1 — dropped-hole rejection on the REAL chunk3 اشتغلنا loop", () => {
  const FIXTURE = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests", "fixtures", "whisper", "chunk3.FIXA-no-prompt.verbose.json"),
      "utf8",
    ),
  ) as {
    text: string
    segments: Array<{ start: number; end: number; text: string; compression_ratio: number }>
  }

  function timed(): TimedSegment[] {
    return FIXTURE.segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
      chunk: 0,
      compressionRatio: s.compression_ratio,
    }))
  }

  it("(a,b,c) drops the two 30s loop segments, keeps the real speech, reports the [306,366] hole", () => {
    const segs = timed()
    const { clean, droppedCount, droppedSeconds, droppedIntervals } = filterDegenerateSegments(segs)
    // (a) exactly the two 30s garbage segments (306–336, 336–366, cr 17.68) are dropped
    expect(droppedCount).toBe(2)
    expect(clean.some((s) => s.start === 306)).toBe(false)
    expect(clean.some((s) => s.start === 336)).toBe(false)
    expect(clean.some((s) => (s.text.split("اشتغلنا").length - 1) >= 20)).toBe(false)
    // (b) the real speech survives — 261 segments in, only the 2 garbage out
    expect(clean).toHaveLength(segs.length - 2)
    expect(clean).toHaveLength(259)
    expect(clean[0].text).toContain("سخيفة") // the real opener is kept
    // (c) the hole is reported and covers the whole loop region
    expect(droppedSeconds).toBeCloseTo(60, 5)
    expect(droppedIntervals).toEqual([{ start: 306, end: 366 }])
  })

  it("(d) a hook that SPANS the real hole is DROPPED; a hook clear of it survives", () => {
    const { droppedIntervals } = filterDegenerateSegments(timed())
    // Windows on either side of the REAL hole (306–366): before [300,305], after [400,410].
    const before: TimedSegment = { start: 300, end: 305, text: "كلام حقيقي واضح قبل الفجوة", chunk: 0 }
    const after: TimedSegment = { start: 400, end: 410, text: "كلام حقيقي واضح بعد الفجوة", chunk: 0 }
    const segMap = new Map<string, { segment: TimedSegment; index: number }>([
      ["S001", { segment: before, index: 0 }],
      ["S002", { segment: after, index: 1 }],
    ])
    const model: EpisodeMapModelOutput = {
      true_start_segment_id: "S001",
      first_real_sentence: "كلام حقيقي واضح قبل الفجوة",
      pre_roll_summary: "",
      gaps: [],
      hook_candidates: [
        { rank: 1, start_segment_id: "S001", end_segment_id: "S002", opens_with: "stake", why: "يعبر الفجوة" },
        { rank: 2, start_segment_id: "S002", end_segment_id: "S002", opens_with: "context", why: "بعد الفجوة" },
      ],
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const map = resolveEpisodeMap(model, segMap, buildGapMap([]), PROV, droppedIntervals)
    // The spanning hook (300→410 crosses 306–366) is dropped; only the clear one remains.
    expect(map.hook_candidates).toHaveLength(1)
    expect(map.hook_candidates[0]).toMatchObject({ start_seconds: 400, end_seconds: 410 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("spans a filtered-out"))
    warn.mockRestore()
  })

  it("(d) a true_start that lands INSIDE the real hole THROWS (reselect, never anchor on garbage)", () => {
    const { droppedIntervals } = filterDegenerateSegments(timed())
    const inHole: TimedSegment = { start: 320, end: 325, text: "اشتغلنا اشتغلنا", chunk: 0 }
    const segMap = new Map<string, { segment: TimedSegment; index: number }>([
      ["S001", { segment: inHole, index: 0 }],
    ])
    const model: EpisodeMapModelOutput = {
      true_start_segment_id: "S001",
      first_real_sentence: "اشتغلنا اشتغلنا",
      pre_roll_summary: "",
      gaps: [],
      hook_candidates: [],
    }
    expect(() =>
      resolveEpisodeMap(model, segMap, buildGapMap([]), PROV, droppedIntervals),
    ).toThrow(/falls inside a filtered-out/)
  })
})
