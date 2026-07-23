import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { execFile, execFileSync } from "child_process"
import { promisify } from "util"
import fs from "fs/promises"
import os from "os"
import path from "path"
import {
  buildTimedSegmentsFromWhisperChunks,
  buildTimedSegmentsFromVtt,
  mergeIntoWindows,
  renderWithIds,
  type WhisperChunk,
  type TimedSegment,
} from "@/lib/studio/segments"
import { splitIntoChunks, probeAudioDurationPrecise } from "@/lib/whisper"

const execFileAsync = promisify(execFile)

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { timeout: 5_000, stdio: "ignore" })
    execFileSync("ffprobe", ["-version"], { timeout: 5_000, stdio: "ignore" })
    return true
  } catch {
    return false
  }
}
const FFMPEG = hasFfmpeg()

// ── Offset algorithm — crafted inputs prove every self-check ─────────────────

describe("buildTimedSegmentsFromWhisperChunks — offset math", () => {
  it("applies cumulative offsets from REAL (non-nominal) durations", () => {
    // Deliberately un-round durations to prove the offset is the cumulative
    // sum of PROBED durations, not nominal i×10.
    const chunks: WhisperChunk[] = [
      { durationSeconds: 10.012, segments: [{ start: 0, end: 4, text: "a" }, { start: 4, end: 9.5, text: "b" }] },
      { durationSeconds: 9.988, segments: [{ start: 0.2, end: 5, text: "c" }, { start: 5, end: 9.8, text: "d" }] },
      { durationSeconds: 5.0, segments: [{ start: 0, end: 3, text: "e" }, { start: 3, end: 4.9, text: "f" }] },
    ]
    const full = 25.0 // 10.012 + 9.988 + 5.0
    const out = buildTimedSegmentsFromWhisperChunks(chunks, full)

    expect(out).toHaveLength(6)
    expect(out[0].start).toBe(0)
    // chunk-1 first segment: raw 0.2 + offset(10.012) — uses the real duration.
    expect(out[2].start).toBeCloseTo(10.212, 9)
    // chunk-2 first segment: raw 0 + offset(10.012 + 9.988 = 20.0).
    expect(out[4].start).toBeCloseTo(20.0, 9)
    expect(out[out.length - 1].end).toBeCloseTo(24.9, 9)
    expect(out.map((s) => s.chunk)).toEqual([0, 0, 1, 1, 2, 2])
  })

  it("SELF-CHECK #1: throws when durations don't reconstitute the file", () => {
    const chunks: WhisperChunk[] = [
      { durationSeconds: 10, segments: [{ start: 0, end: 5, text: "a" }] },
      { durationSeconds: 10, segments: [{ start: 0, end: 5, text: "b" }] },
    ]
    // Σ=20 but full=30 → drift 10 ≫ tolerance (0.2 + 0.05·2 = 0.3).
    expect(() => buildTimedSegmentsFromWhisperChunks(chunks, 30)).toThrow(/reconstitute/)
  })

  it("SELF-CHECK #2: CLAMPS a last segment ending slightly past the file (abrupt-end overshoot survives)", () => {
    // Raw recordings that stop mid-sentence make whisper's last segment end 1–5s
    // past the true duration. That benign end-of-audio overshoot must NOT throw the
    // whole map away — it is clamped down to the real duration. Start and end now
    // share ONE symmetric DECODE_OVERSHOOT_TOLERANCE (5.0s).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const chunks: WhisperChunk[] = [
      {
        durationSeconds: 100,
        segments: [
          { start: 0, end: 50, text: "real one" },
          { start: 98, end: 102, text: "real two" }, // ends 2s past full(100)
        ],
      },
    ]
    const out = buildTimedSegmentsFromWhisperChunks(chunks, 100)
    expect(out).toHaveLength(2) // survives — nothing dropped, nothing thrown
    expect(out[out.length - 1].end).toBe(100) // clamped down to the real duration
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("clamping last segment end"))
    warn.mockRestore()
  })

  it("SELF-CHECK #2: CLAMPS a 3–5s end overshoot (Wave-1.5 fix: was thrown at the old asymmetric 3.0s band)", () => {
    // REGRESSION LOCK (Wave-1 Fix D): a WAVE-1 change threw the whole map away when
    // the last segment ended >3.0s past the file, while the START side tolerated
    // 5.0s. That asymmetry nuked Khaled's real 86-min map on a benign 3–5s end
    // overshoot — exactly the failure the filtering redesign exists to prevent. The
    // two bands are now unified on 5.0s: a 4s overshoot CLAMPS, it does not throw.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const chunks: WhisperChunk[] = [
      {
        durationSeconds: 100,
        segments: [
          { start: 0, end: 50, text: "real one" },
          { start: 96, end: 104, text: "real two" }, // ends 4s past full(100): 3 < 4 ≤ 5
        ],
      },
    ]
    const out = buildTimedSegmentsFromWhisperChunks(chunks, 100)
    expect(out).toHaveLength(2) // survives — NOT thrown
    expect(out[out.length - 1].end).toBe(100) // clamped to the real duration
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("clamping last segment end"))
    warn.mockRestore()
  })

  it("SELF-CHECK #2: CLAMPS a last segment ending FAR past the file (hallucinated tail, no audio there)", () => {
    // The file physically has no content past its own end, so a last segment ending
    // past fullDuration is ALWAYS a whisper overshoot — CLAMPED down regardless of
    // magnitude, never thrown. A fixed "corruption" tolerance was tried and only
    // nuked valid maps on real episodes.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const chunks: WhisperChunk[] = [
      {
        durationSeconds: 100,
        segments: [
          { start: 0, end: 50, text: "real" },
          { start: 98, end: 132, text: "hallucinated tail" }, // ends 32s past the file
        ],
      },
    ]
    const out = buildTimedSegmentsFromWhisperChunks(chunks, 100)
    expect(out[out.length - 1].end).toBe(100) // clamped to fullDuration, map survives
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("clamping last segment end"))
    warn.mockRestore()
  })

  it("SELF-CHECK #3: throws on non-monotonic starts after offset", () => {
    const chunks: WhisperChunk[] = [
      { durationSeconds: 10, segments: [{ start: 5, end: 6, text: "x" }, { start: 2, end: 3, text: "y" }] },
    ]
    // Both raw starts in-bounds, but 2 < 5 → disorder after offset.
    expect(() => buildTimedSegmentsFromWhisperChunks(chunks, 10)).toThrow(/non-monotonic/)
  })

  it("SELF-CHECK #4: DROPS a trailing decode-drift phantom (start ~2s past chunk end), map survives", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const chunks: WhisperChunk[] = [
      {
        durationSeconds: 100,
        segments: [
          { start: 0, end: 50, text: "real one" },
          { start: 50, end: 99, text: "real two" },
          // 2s past the chunk end (≤ PHANTOM_START_DRIFT 5.0s) → benign phantom.
          { start: 102, end: 103, text: "whisper tail" },
        ],
      },
    ]
    const out = buildTimedSegmentsFromWhisperChunks(chunks, 100)
    expect(out.map((s) => s.text)).toEqual(["real one", "real two"]) // phantom dropped
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("past-audio phantom"))
    warn.mockRestore()
  })

  it("SELF-CHECK #4: DROPS a trailing segment FAR past the chunk (phantom, no audio behind it)", () => {
    // No upper bound on the drop: a start past the chunk's real audio is a phantom
    // however far past it lands (Khaled's real 86-min episode produced a legitimate
    // 6.0s phantom, beyond any fixed band we picked — throwing on it nuked a valid
    // map). DROP, never throw; offset integrity is enforced by #1 + #3.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const chunks: WhisperChunk[] = [
      {
        durationSeconds: 100,
        segments: [
          { start: 0, end: 50, text: "real" },
          { start: 130, end: 131, text: "way off" }, // 30s past — still just a phantom
        ],
      },
    ]
    const out = buildTimedSegmentsFromWhisperChunks(chunks, 100)
    expect(out.map((s) => s.text)).toEqual(["real"]) // phantom dropped, map survives
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("past-audio phantom"))
    warn.mockRestore()
  })

  it("SELF-CHECK #4: DROPS a NON-trailing phantom within phantom-drift (mid-chunk decode drift is legitimate)", () => {
    // FLIPPED (Wave-1 Fix C): Khaled's real 86-min episode PROVED whisper drifts a
    // segment's start up to ~4.4s past a chunk end MID-CHUNK, not only on the last
    // segment. Those are legitimate decode-drift phantoms with no audio behind them,
    // so the old unconditional throw here kept nuking a VALID map. A start within
    // PHANTOM_START_DRIFT (5.0s) is now DROPPED + warned regardless of position; the
    // adjacent chunk covers that boundary. (The FAR-past case below still throws.)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const chunks: WhisperChunk[] = [
      {
        durationSeconds: 100,
        segments: [
          { start: 0, end: 50, text: "real" },
          { start: 102, end: 103, text: "mid phantom" }, // 2s past, NOT the last segment
          { start: 60, end: 70, text: "after" },
        ],
      },
    ]
    const out = buildTimedSegmentsFromWhisperChunks(chunks, 100)
    expect(out.map((s) => s.text)).toEqual(["real", "after"]) // phantom dropped, map survives
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("past-audio phantom"))
    warn.mockRestore()
  })

  it("SELF-CHECK #4: DROPS a NON-trailing segment FAR past the chunk (mid-chunk phantom, any distance)", () => {
    // The mid-chunk counterpart: a mid-chunk start far past the chunk is still a
    // phantom (no audio behind it) — dropped, not thrown, regardless of distance.
    // There is no start-side overshoot that must throw: #1 (durations reconstitute)
    // and #3 (monotonic after offset) already catch a genuine offset fault.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const chunks: WhisperChunk[] = [
      {
        durationSeconds: 100,
        segments: [
          { start: 0, end: 50, text: "real" },
          { start: 130, end: 131, text: "way off mid" }, // 30s past, NOT last → phantom
          { start: 60, end: 70, text: "after" },
        ],
      },
    ]
    const out = buildTimedSegmentsFromWhisperChunks(chunks, 100)
    expect(out.map((s) => s.text)).toEqual(["real", "after"]) // phantom dropped, map survives
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("past-audio phantom"))
    warn.mockRestore()
  })

  it("SELF-CHECK #4: THROWS on a negative raw start (never a trailing artifact)", () => {
    const chunks: WhisperChunk[] = [
      { durationSeconds: 10, segments: [{ start: -1, end: 2, text: "bad" }] },
    ]
    expect(() => buildTimedSegmentsFromWhisperChunks(chunks, 10)).toThrow(/outside/)
  })

  it("SELF-CHECK #5: WARNS (does not throw) on an empty chunk among content", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const chunks: WhisperChunk[] = [
      { durationSeconds: 10, segments: [{ start: 0, end: 5, text: "a" }] },
      { durationSeconds: 10, segments: [] }, // legal silent chunk
    ]
    const out = buildTimedSegmentsFromWhisperChunks(chunks, 20)
    expect(out).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("zero"))
    warn.mockRestore()
  })

  it("throws on zero chunks and on all-empty chunks (no fabricated map)", () => {
    expect(() => buildTimedSegmentsFromWhisperChunks([], 10)).toThrow(/no chunks/)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(() =>
      buildTimedSegmentsFromWhisperChunks(
        [{ durationSeconds: 10, segments: [] }],
        10,
      ),
    ).toThrow(/no segments/)
    warn.mockRestore()
  })
})

// ── VTT builder + T4 reverse control ─────────────────────────────────────────

describe("buildTimedSegmentsFromVtt", () => {
  it("de-duplicates rolling caption overlap, keeping real cue starts", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:02.000",
      "مرحبا",
      "",
      "00:00:02.000 --> 00:00:04.000",
      "مرحبا كيف",
      "",
      "00:00:04.000 --> 00:00:06.000",
      "كيف حالك",
      "",
    ].join("\n")
    const out = buildTimedSegmentsFromVtt(vtt)
    expect(out.map((s) => s.text)).toEqual(["مرحبا", "كيف", "حالك"])
    expect(out.map((s) => s.start)).toEqual([0, 2, 4])
    for (let i = 1; i < out.length; i++) {
      expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].start)
    }
  })

  it("collapses an exact duplicate cue", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:03.000",
      "نفس السطر",
      "",
      "00:00:03.000 --> 00:00:05.000",
      "نفس السطر",
      "",
    ].join("\n")
    const out = buildTimedSegmentsFromVtt(vtt)
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe("نفس السطر")
  })

  it("strips inline <timestamp>/<c> word-timing tags", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:10.000 --> 00:00:12.500",
      '<00:00:10.000><c> كلمة</c><00:00:11.000><c> ثانية</c>',
      "",
    ].join("\n")
    const out = buildTimedSegmentsFromVtt(vtt)
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe("كلمة ثانية")
    expect(out[0].start).toBeCloseTo(10, 6)
    expect(out[0].end).toBeCloseTo(12.5, 6)
  })

  it("parses MM:SS.mmm cues (no hours component)", () => {
    const vtt = "WEBVTT\n\n01:05.000 --> 01:07.000\nنص\n"
    const out = buildTimedSegmentsFromVtt(vtt)
    expect(out[0].start).toBeCloseTo(65, 6)
  })

  it("T4 REVERSE CONTROL: rejects plain text with no timing cues", () => {
    expect(() => buildTimedSegmentsFromVtt("مرحبا بالعالم\nكيف حالك اليوم")).toThrow(/fabricate/)
    expect(() => buildTimedSegmentsFromVtt("")).toThrow(/fabricate/)
    // An SRT stripped of its timing lines must also be refused.
    expect(() => buildTimedSegmentsFromVtt("1\nثانية\n\n2\nثالثة")).toThrow(/fabricate/)
  })

  it("T4 positive control: a VTT WITH timing is accepted", () => {
    expect(() =>
      buildTimedSegmentsFromVtt("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nموجود\n"),
    ).not.toThrow()
  })
})

// ── Window merge + id rendering ──────────────────────────────────────────────

describe("mergeIntoWindows", () => {
  it("merges adjacent segments up to the window, keeping first.start/last.end", () => {
    const segs: TimedSegment[] = [
      { start: 0, end: 5, text: "a", chunk: 0 },
      { start: 5, end: 10, text: "b", chunk: 0 },
      { start: 10, end: 25, text: "c", chunk: 0 },
      { start: 25, end: 30, text: "d", chunk: 0 },
    ]
    const out = mergeIntoWindows(segs, 20)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ start: 0, end: 10, text: "a b" })
    expect(out[1]).toMatchObject({ start: 10, end: 30, text: "c d" })
  })

  it("returns [] for empty input", () => {
    expect(mergeIntoWindows([], 20)).toEqual([])
  })
})

describe("renderWithIds", () => {
  it("emits stable [Sxxx] m:ss → m:ss | text lines", () => {
    const segs: TimedSegment[] = [
      { start: 0, end: 5, text: "أول", chunk: 0 },
      { start: 214, end: 223, text: "ثاني", chunk: 1 },
    ]
    const lines = renderWithIds(segs).split("\n")
    expect(lines[0]).toBe("[S001] 0:00 → 0:05 | أول")
    expect(lines[1]).toBe("[S002] 3:34 → 3:43 | ثاني")
  })

  it("zero-pads ids to three digits", () => {
    const segs: TimedSegment[] = Array.from({ length: 10 }, (_, i) => ({
      start: i, end: i + 1, text: `s${i}`, chunk: 0,
    }))
    const lines = renderWithIds(segs).split("\n")
    expect(lines[9].startsWith("[S010]")).toBe(true)
  })
})

// ── T2: offset integrity on a REAL split file (needs ffmpeg) ─────────────────

describe.skipIf(!FFMPEG)("T2 — offset integrity on a real split file", () => {
  let dir: string
  let input: string

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "khat-t2-"))
    input = path.join(dir, "input.wav")
    // 90s tone, mono/16kHz. 90 is an exact multiple of the 10s test segment,
    // so ffmpeg emits a padding-only trailing chunk — exactly the case
    // production must survive.
    await execFileAsync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=90:sample_rate=16000",
        "-c:a", "pcm_s16le", input],
      { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
    )
  }, 60_000)

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  it("real ffprobe'd chunk durations feed offsets that pass all 5 self-checks", async () => {
    const chunksDir = path.join(dir, "chunks")
    const chunkPaths = await splitIntoChunks(input, chunksDir, ".wav", 10)
    expect(chunkPaths.length).toBeGreaterThanOrEqual(9)

    // Probe each chunk with the PRECISE (float) helper and apply production's
    // trailing-tail rule: a null / near-zero duration is only ever the LAST
    // chunk (the muxer's padding tail).
    const kept: number[] = []
    let dropped = 0
    for (let i = 0; i < chunkPaths.length; i++) {
      const d = await probeAudioDurationPrecise(chunkPaths[i])
      const isLast = i === chunkPaths.length - 1
      if (d == null || d < 0.25) {
        expect(isLast).toBe(true) // spurious tail is never mid-stream
        dropped++
        continue
      }
      kept.push(d)
    }
    expect(dropped).toBeLessThanOrEqual(1)
    expect(kept.length).toBeGreaterThanOrEqual(2)

    // Real MP3-frame-aligned cuts drift off the nominal 10.0s — the very
    // reason nominal i×10 offsets can't be used.
    expect(kept.some((d) => Math.abs(d - 10) > 0.001)).toBe(true)

    const full = await probeAudioDurationPrecise(input)
    expect(full).not.toBeNull()

    // Mock two in-bounds segments per kept chunk (no paid whisper needed —
    // T2 tests the offset math + self-checks, not transcription quality).
    const chunks: WhisperChunk[] = kept.map((dur) => ({
      durationSeconds: dur,
      segments: [
        { start: 0, end: dur * 0.4, text: "x" },
        { start: dur * 0.4, end: dur - 0.05, text: "y" },
      ],
    }))

    // Independently compute expected offsets from the real durations.
    const offsets: number[] = [0]
    for (let i = 1; i < kept.length; i++) offsets[i] = offsets[i - 1] + kept[i - 1]

    const out = buildTimedSegmentsFromWhisperChunks(chunks, full!)
    expect(out).toHaveLength(kept.length * 2)
    expect(out[0].start).toBe(0)
    // First segment of chunk 1 == cumulative real duration of chunk 0.
    expect(out[2].start).toBeCloseTo(offsets[1], 9)
    // Monotonic + within the file (self-checks #2/#3 already ran inside build).
    for (let i = 1; i < out.length; i++) {
      expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].start)
    }
    expect(out[out.length - 1].end).toBeLessThanOrEqual(full! + 1.0)
  }, 60_000)
})
