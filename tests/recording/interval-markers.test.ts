import { describe, expect, it } from "vitest"

import {
  INTERVAL_MARKERS,
  closerFor,
  isIntervalCloser,
  isIntervalOpener,
  openIntervals,
  QUICK_MARKER_META,
  QUICK_MARKER_TYPES,
} from "@/lib/recording-v2/marker-types"

/**
 * Interval markers — the ones with a start AND an end.
 *
 * Khalid, 2026-08-05: «بالدقيقه ٥ وضعت علامه خلل وفي الدقيقه ٦ انتهى الخلل شنو
 * اسوي؟ اضغط خلل مره ثانيه؟»
 *
 * Before this, pressing it again wrote a SECOND `tech_issue` a minute after the
 * first, and nothing downstream could tell the start from the end. The editor
 * received "a fault happened here, twice" instead of "a fault lasted a minute".
 *
 * `openIntervals` is the whole mechanism: the button reads it to decide whether
 * the next press opens or closes, and the UI reads it to show that something is
 * still running. If it is wrong the bar silently writes the wrong marker type —
 * no error, no crash, just a corrupted timeline discovered in post. Hence these.
 */

const m = (marker_type: string, net_recording_ms: number) => ({ marker_type, net_recording_ms })

describe("the pairing itself", () => {
  it("every opener names a closer, and every closer exists as a type", () => {
    for (const [opener, closer] of Object.entries(INTERVAL_MARKERS)) {
      expect(QUICK_MARKER_TYPES).toContain(opener)
      expect(QUICK_MARKER_TYPES).toContain(closer)
      expect(closerFor(opener)).toBe(closer)
    }
  })

  it("every marker type has metadata — including the new closers", () => {
    // A type without metadata renders `undefined` as its label and throws on
    // `.hint`. The two closers were added after the map, which is exactly when
    // that gets forgotten.
    for (const t of QUICK_MARKER_TYPES) {
      expect(QUICK_MARKER_META[t], `${t} has no metadata`).toBeTruthy()
      expect(QUICK_MARKER_META[t].label).toBeTruthy()
    }
  })

  it("an instant marker is neither an opener nor a closer", () => {
    for (const t of ["clip", "quote", "highlight", "cut", "chapter"]) {
      expect(isIntervalOpener(t), `${t} should be an instant`).toBe(false)
      expect(isIntervalCloser(t), `${t} should be an instant`).toBe(false)
      expect(closerFor(t)).toBeNull()
    }
  })

  it("break was ALREADY an interval — the model has to include it, not compete with it", () => {
    // break_start/break_end existed before this change. If the new mechanism
    // ignored them the bar would show a separate «نهاية استراحة» button again
    // and the two systems would both be half-right.
    expect(closerFor("break_start")).toBe("break_end")
  })
})

describe("openIntervals — what is still running", () => {
  it("an opener with no closer is open, and reports when it opened", () => {
    expect(openIntervals([m("tech_issue", 300_000)])).toEqual({ tech_issue: 300_000 })
  })

  it("Khalid's exact case: opened at 5:00, closed at 6:00 → nothing open", () => {
    const markers = [m("tech_issue", 300_000), m("tech_issue_end", 360_000)]
    expect(openIntervals(markers)).toEqual({})
  })

  it("closing one type leaves another type open", () => {
    const markers = [
      m("tech_issue", 60_000),
      m("break_start", 90_000),
      m("tech_issue_end", 120_000),
    ]
    expect(openIntervals(markers)).toEqual({ break_start: 90_000 })
  })

  it("reads in TIME order, not array order", () => {
    // Markers arrive over SSE and are not guaranteed sorted. Pairing on arrival
    // order would let a late-delivered opener re-open a closed interval.
    const markers = [m("tech_issue_end", 360_000), m("tech_issue", 300_000)]
    expect(openIntervals(markers)).toEqual({})
  })

  it("a second opener while one is open does NOT create a second interval", () => {
    // Nesting is unsupported on purpose: two overlapping faults are not
    // actionable in an edit, and a single press could not say which it closed.
    // The first opener's time is what survives — the fault started then.
    const markers = [m("tech_issue", 100_000), m("tech_issue", 150_000)]
    expect(openIntervals(markers)).toEqual({ tech_issue: 100_000 })
  })

  it("a closer with no opener is ignored rather than throwing", () => {
    // Possible after someone deletes the opening marker from the feed — which
    // both the director and the editor can now do.
    expect(() => openIntervals([m("tech_issue_end", 60_000)])).not.toThrow()
    expect(openIntervals([m("tech_issue_end", 60_000)])).toEqual({})
  })

  it("instants never appear as open", () => {
    expect(openIntervals([m("clip", 1000), m("quote", 2000)])).toEqual({})
  })

  it("is empty for an empty take", () => {
    expect(openIntervals([])).toEqual({})
  })
})
