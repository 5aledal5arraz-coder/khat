import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { execFile, execFileSync } from "child_process"
import { promisify } from "util"
import fs from "fs/promises"
import os from "os"
import path from "path"
import {
  adaptiveThresholdDb,
  classifySilenceDuration,
  parseSilenceDetect,
  runSilenceDetect,
  detectBreaks,
  probePeakDb,
} from "@/lib/audio/silence"

const execFileAsync = promisify(execFile)

/** ffmpeg presence — the integration checks are skipped where it's absent. */
function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { timeout: 5_000, stdio: "ignore" })
    return true
  } catch {
    return false
  }
}
const FFMPEG = hasFfmpeg()

// ── Pure units (no ffmpeg) ──────────────────────────────────────────────────

describe("adaptiveThresholdDb", () => {
  it("is peak − 12 in the mid band", () => {
    expect(adaptiveThresholdDb(-28)).toBeCloseTo(-40, 6) // rashid's real-audio point
    expect(adaptiveThresholdDb(-24)).toBeCloseTo(-36, 6)
  })
  it("clamps to −30 for loud audio", () => {
    // -16 (the T3 fixture peak) → -28 raw → clamped to -30
    expect(adaptiveThresholdDb(-16)).toBe(-30)
    expect(adaptiveThresholdDb(0)).toBe(-30)
  })
  it("clamps to −50 for very quiet audio", () => {
    expect(adaptiveThresholdDb(-45)).toBe(-50)
    expect(adaptiveThresholdDb(-60)).toBe(-50)
  })
})

describe("classifySilenceDuration", () => {
  it("hides sub-2s gaps as pause", () => {
    expect(classifySilenceDuration(0.9)).toBe("pause")
    expect(classifySilenceDuration(1.99)).toBe("pause")
  })
  it("treats 2–20s as long_pause", () => {
    expect(classifySilenceDuration(2.0)).toBe("long_pause")
    expect(classifySilenceDuration(2.000125)).toBe("long_pause")
    expect(classifySilenceDuration(20)).toBe("long_pause")
  })
  it("surfaces >20s as break_candidate", () => {
    expect(classifySilenceDuration(20.001)).toBe("break_candidate")
    expect(classifySilenceDuration(180)).toBe("break_candidate")
  })
})

describe("parseSilenceDetect", () => {
  it("parses paired start/end + duration from ffmpeg stderr", () => {
    const stderr = [
      "[silencedetect @ 0x7f] silence_start: 200",
      "[silencedetect @ 0x7f] silence_end: 202.000125 | silence_duration: 2.000125",
      "[silencedetect @ 0x7f] silence_start: 400",
      "[silencedetect @ 0x7f] silence_end: 580.000125 | silence_duration: 180.000125",
    ].join("\n")
    const out = parseSilenceDetect(stderr)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ start: 200, end: 202.000125, durationSeconds: 2.000125 })
    expect(out[1].durationSeconds).toBeCloseTo(180.000125, 6)
  })
  it("drops a trailing silence_start with no matching end (EOF silence)", () => {
    const stderr = [
      "silence_start: 10",
      "silence_end: 12 | silence_duration: 2",
      "silence_start: 999", // never closed
    ].join("\n")
    const out = parseSilenceDetect(stderr)
    expect(out).toHaveLength(1)
    expect(out[0].start).toBe(10)
  })
  it("ignores a stray silence_end with no start", () => {
    expect(parseSilenceDetect("silence_end: 5 | silence_duration: 1")).toHaveLength(0)
  })
  it("falls back to end−start when duration is absent", () => {
    const out = parseSilenceDetect("silence_start: 3\nsilence_end: 8")
    expect(out[0].durationSeconds).toBeCloseTo(5, 6)
  })
})

// ── T3: ground-truth detection on a synthetic fixture (needs ffmpeg) ─────────

describe.skipIf(!FFMPEG)("T3 — silence ground truth on a synthetic fixture", () => {
  let dir: string
  let fixture: string

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "khat-silence-"))
    fixture = path.join(dir, "fixture.wav")
    // Speech = 300Hz sine at -16 dBFS (amp 0.1585); room floor = -52 dBFS
    // (amp 0.00251). Gaps: a 2s pause at [200,202] and a 3min break at
    // [400,580]. mono / 8kHz / 585s — the durations rashid designed.
    const expr =
      "aevalsrc=exprs='sin(2*PI*300*t)*if(between(t,200,202)+between(t,400,580),0.00251,0.1585)':s=8000:d=585:c=mono"
    await execFileAsync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", expr, "-c:a", "pcm_s16le", fixture],
      { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
    )
  }, 60_000)

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  it("probes the fixture peak at ≈ -16 dBFS", async () => {
    const peak = await probePeakDb(fixture)
    expect(peak).not.toBeNull()
    expect(peak!).toBeCloseTo(-16, 1)
  }, 60_000)

  it("finds both known gaps within ±0.25s at -40dB/d=0.8", async () => {
    const silences = await runSilenceDetect(fixture, {
      thresholdDb: -40,
      minSilenceSeconds: 0.8,
    })
    // Exactly the 2 designed gaps — no false positives on the constant tone.
    expect(silences).toHaveLength(2)

    const pause = silences[0]
    expect(pause.start).toBeCloseTo(200, 1)
    expect(pause.end).toBeCloseTo(202, 1)
    expect(Math.abs(pause.durationSeconds - 2.0)).toBeLessThanOrEqual(0.25)

    const brk = silences[1]
    expect(brk.start).toBeCloseTo(400, 1)
    expect(brk.end).toBeCloseTo(580, 1)
    expect(Math.abs(brk.durationSeconds - 180.0)).toBeLessThanOrEqual(0.25)
  }, 60_000)

  it("detectBreaks (adaptive threshold) classifies the 180s gap as a break, the 2s as long_pause", async () => {
    const res = await detectBreaks(fixture)
    // peak -16 → adaptive clamp → -30dB; floor -52 still detected, tone not.
    expect(res.thresholdDb).toBe(-30)
    expect(res.silences).toHaveLength(2)
    expect(res.silences.map((s) => s.kind)).toEqual(["long_pause", "break_candidate"])
    expect(res.breaks).toHaveLength(1)
    expect(res.breaks[0].start).toBeCloseTo(400, 1)
  }, 60_000)
})
