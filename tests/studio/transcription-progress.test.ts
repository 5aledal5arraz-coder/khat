/**
 * Pure derivation tests for the Studio transcription progress indicator.
 * No DB, no whisper, no wall clock — every branch is a pure function.
 */

import { describe, it, expect } from "vitest"
import {
  estimateChunkCount,
  computeProgressFraction,
  computeEtaSeconds,
  buildTranscriptionProgress,
  TRANSCRIBE_WEIGHT,
  TRANSCRIBE_CHUNK_SECONDS,
} from "@/lib/studio/transcription-progress"

describe("estimateChunkCount — chunks from stored duration", () => {
  it("is ceil(duration / 10min), min 1", () => {
    expect(estimateChunkCount(600)).toBe(1) // exactly one chunk
    expect(estimateChunkCount(601)).toBe(2) // one second over → two
    expect(estimateChunkCount(2.5 * 3600)).toBe(15) // a 2.5h episode → 15 chunks
    expect(estimateChunkCount(TRANSCRIBE_CHUNK_SECONDS * 12)).toBe(12)
    expect(estimateChunkCount(1)).toBe(1) // tiny but non-zero → at least one
  })

  it("returns 0 (unknown) for a missing / non-positive / non-finite duration", () => {
    expect(estimateChunkCount(null)).toBe(0)
    expect(estimateChunkCount(undefined)).toBe(0)
    expect(estimateChunkCount(0)).toBe(0)
    expect(estimateChunkCount(-5)).toBe(0)
    expect(estimateChunkCount(NaN)).toBe(0)
    expect(estimateChunkCount(Infinity)).toBe(0)
  })
})

describe("computeProgressFraction — transcription is ~90% of the bar", () => {
  it("scales transcribing linearly to TRANSCRIBE_WEIGHT across the chunks", () => {
    expect(computeProgressFraction("transcribing", 0, 12)).toBe(0)
    expect(computeProgressFraction("transcribing", 6, 12)).toBeCloseTo(0.45, 5)
    expect(computeProgressFraction("transcribing", 12, 12)).toBeCloseTo(TRANSCRIBE_WEIGHT, 5)
  })

  it("weights the fast tail into the remaining ~10% (never equal to transcription)", () => {
    // detecting_breaks / comparing begin exactly where transcription ended (0.9),
    // analyzing sits above it, done is complete.
    expect(computeProgressFraction("detecting_breaks", 12, 12)).toBe(0.9)
    expect(computeProgressFraction("comparing", 12, 12)).toBe(0.9)
    expect(computeProgressFraction("analyzing", 12, 12)).toBe(0.96)
    expect(computeProgressFraction("done", 12, 12)).toBe(1)
    // The tail stages together own only ~10% — analyzing < done, both > transcription end.
    expect(computeProgressFraction("analyzing", 12, 12)).toBeLessThan(1)
    expect(computeProgressFraction("analyzing", 12, 12)).toBeGreaterThan(TRANSCRIBE_WEIGHT)
  })

  it("is 0 while transcribing with an unknown total (indeterminate)", () => {
    expect(computeProgressFraction("transcribing", 0, 0)).toBe(0)
    expect(computeProgressFraction("transcribing", 3, 0)).toBe(0)
  })

  it("clamps a currentChunk that overshoots the total", () => {
    expect(computeProgressFraction("transcribing", 20, 12)).toBeCloseTo(TRANSCRIBE_WEIGHT, 5)
  })
})

describe("computeEtaSeconds — «يُحسب…» until the first chunk, then per-chunk × remaining", () => {
  it("returns null before the first chunk completes (shows «يُحسب…»)", () => {
    expect(computeEtaSeconds(0, 0, 12)).toBeNull() // t=0, nothing done
    expect(computeEtaSeconds(120_000, 0, 12)).toBeNull() // 2 min elapsed, still 0 chunks
  })

  it("estimates remaining transcription from the measured per-chunk rate", () => {
    // 1 chunk in 4 min → ~4 min/chunk × 11 remaining = 2640s.
    expect(computeEtaSeconds(4 * 60_000, 1, 12)).toBe(2640)
    // 6 of 12 in 24 min → 4 min/chunk × 6 remaining = 1440s.
    expect(computeEtaSeconds(24 * 60_000, 6, 12)).toBe(1440)
  })

  it("refines (shrinks) as more chunks land at a steady rate", () => {
    const early = computeEtaSeconds(4 * 60_000, 1, 12)!
    const later = computeEtaSeconds(28 * 60_000, 7, 12)!
    expect(later).toBeLessThan(early)
  })

  it("is 0 on the last chunk (no transcription left)", () => {
    expect(computeEtaSeconds(48 * 60_000, 12, 12)).toBe(0)
  })

  it("returns null for a degenerate (zero/negative) elapsed or unknown total", () => {
    expect(computeEtaSeconds(0, 3, 12)).toBeNull()
    expect(computeEtaSeconds(-1, 3, 12)).toBeNull()
    expect(computeEtaSeconds(60_000, 3, 0)).toBeNull()
  })
})

describe("buildTranscriptionProgress — the stored record", () => {
  it("carries stage/chunks/fraction and an ETA only while transcribing", () => {
    const p = buildTranscriptionProgress({
      stage: "transcribing",
      currentChunk: 3,
      totalChunks: 12,
      elapsedMs: 12 * 60_000, // 3 chunks in 12 min → 4 min/chunk
    })
    expect(p.stage).toBe("transcribing")
    expect(p.currentChunk).toBe(3)
    expect(p.totalChunks).toBe(12)
    expect(p.fraction).toBeCloseTo(0.225, 5) // 0.9 * 3/12
    expect(p.etaSeconds).toBe(2160) // 4 min/chunk × 9 remaining = 2160s
  })

  it("emits «يُحسب…» (null ETA) for the initial 0-chunk transcribing tick", () => {
    const p = buildTranscriptionProgress({
      stage: "transcribing",
      currentChunk: 0,
      totalChunks: 12,
    })
    expect(p.fraction).toBe(0)
    expect(p.etaSeconds).toBeNull()
  })

  it("never attaches an ETA to a post-transcription stage (label carries it)", () => {
    for (const stage of ["detecting_breaks", "analyzing", "comparing", "done"] as const) {
      const p = buildTranscriptionProgress({ stage, currentChunk: 12, totalChunks: 12, elapsedMs: 999_999 })
      expect(p.etaSeconds).toBeNull()
    }
  })
})
