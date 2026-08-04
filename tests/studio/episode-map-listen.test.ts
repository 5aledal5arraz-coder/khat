import { describe, expect, it } from "vitest"

import {
  SEEK_PLAY_SECONDS,
  SEEK_PRE_ROLL_SECONDS,
  resolvePlayback,
} from "@/app/admin/studio/components/stage-episode-map"

/**
 * The "اسمع" button on the raw-recording time map.
 *
 * The button answers ONE question — does this land where it says? — and the
 * opening seconds answer it. Khaled's call (2026-08-04): five seconds, no more.
 *
 * Two things had to be got right, and each was got wrong once:
 *   1. A hook clip must start on its OWN in-point. The original 3-second
 *      run-up spent the sample on audio outside the clip.
 *   2. Five seconds means five seconds. Playing a clip end to end (a first
 *      attempt) turns checking four clips into ten minutes of listening.
 */
describe("resolvePlayback — five seconds from where the card says", () => {
  describe("range (a hook clip: it has an out-point)", () => {
    // Hook #2 of episode 018 — 40:37 → 43:17.
    const start = 40 * 60 + 37
    const end = 43 * 60 + 17

    it("starts exactly on the in-point, with no run-up", () => {
      expect(resolvePlayback(start, end).startAt).toBe(start)
    })

    it("plays five seconds, not the whole clip", () => {
      const { playSeconds } = resolvePlayback(start, end)
      expect(playSeconds).toBe(SEEK_PLAY_SECONDS)
      expect(playSeconds).toBeLessThan(end - start)
    })

    it("stops five seconds in, not at the clip's out-point", () => {
      expect(resolvePlayback(start, end).stopAt).toBe(start + SEEK_PLAY_SECONDS)
    })

    it("never plays past a clip shorter than the sample", () => {
      const { stopAt, playSeconds } = resolvePlayback(100, 103)
      expect(stopAt).toBe(103)
      expect(playSeconds).toBe(3)
    })
  })

  describe("point anchor (no out-point)", () => {
    // «بداية الحلقة الفعلية» — 2:32, verified against the YouTube captions.
    const at = 2 * 60 + 32

    it("keeps the run-up — a boundary claim needs the moment before it", () => {
      expect(resolvePlayback(at).startAt).toBe(at - SEEK_PRE_ROLL_SECONDS)
    })

    it("plays the same five seconds", () => {
      expect(resolvePlayback(at).playSeconds).toBe(SEEK_PLAY_SECONDS)
    })

    it("has no out-point, so nothing stops it by position", () => {
      expect(resolvePlayback(at).stopAt).toBeNull()
    })

    it("never seeks before zero near the start of the file", () => {
      expect(resolvePlayback(1).startAt).toBe(0)
      expect(resolvePlayback(0).startAt).toBe(0)
    })
  })

  describe("degenerate ranges fall back to the anchor behaviour", () => {
    it.each([
      ["end equal to start", 100, 100],
      ["end before start", 100, 90],
    ])("%s", (_label, start, end) => {
      const r = resolvePlayback(start, end)
      expect(r.stopAt).toBeNull()
      expect(r.playSeconds).toBe(SEEK_PLAY_SECONDS)
      expect(r.startAt).toBe(start - SEEK_PRE_ROLL_SECONDS)
    })
  })

  /**
   * Two-direction check. The assertions above must FAIL against BOTH wrong
   * behaviours this went through, or they prove nothing.
   */
  describe("catches both regressions", () => {
    const start = 40 * 60 + 37
    const end = 43 * 60 + 17

    it("rejects the run-up being applied to a clip", () => {
      const withRunUp = { startAt: start - SEEK_PRE_ROLL_SECONDS, stopAt: null, playSeconds: SEEK_PLAY_SECONDS }
      expect(withRunUp).not.toEqual(resolvePlayback(start, end))
    })

    it("rejects playing the clip end to end", () => {
      const wholeClip = { startAt: start, stopAt: end, playSeconds: end - start }
      expect(wholeClip).not.toEqual(resolvePlayback(start, end))
    })

    it("leaves the point anchor exactly as it always was", () => {
      expect(resolvePlayback(152)).toEqual({
        startAt: 152 - SEEK_PRE_ROLL_SECONDS,
        stopAt: null,
        playSeconds: SEEK_PLAY_SECONDS,
      })
    })
  })
})
