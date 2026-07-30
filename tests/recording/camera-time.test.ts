/**
 * Camera-time derivation — the arithmetic that decides what an editor sees.
 *
 * The bug these tests lock down: the cockpit's `net_recording_ms` excludes
 * paused time, but the camera keeps rolling through a pause. Exporting net time
 * hands the editor timestamps that drift further behind the camera file after
 * every break. Camera time is derived from the marker's wall clock against the
 * take's write-once anchor, so pauses are irrelevant to it by construction —
 * and the tests below prove exactly that.
 *
 * Pure: no DB, no I/O, no fake timers.
 */

import { describe, expect, it } from "vitest"
import {
  buildTakeIndex,
  cameraMsForMarker,
  withCameraMs,
  type TakeAnchor,
} from "@/lib/recording-v2/camera-time"

const ANCHOR = new Date("2026-08-01T17:00:00.000Z")

function take(overrides: Partial<TakeAnchor> = {}): TakeAnchor {
  return {
    take_number: 1,
    anchor_at: ANCHOR,
    camera_offset_ms: 0,
    ...overrides,
  }
}

/** A marker flagged `ms` after the anchor on the wall clock. */
function markerAt(ms: number, take_number = 1) {
  return { take_number, wall_time: new Date(ANCHOR.getTime() + ms) }
}

describe("cameraMsForMarker", () => {
  it("measures elapsed wall time from the take anchor", () => {
    const idx = buildTakeIndex([take()])
    expect(cameraMsForMarker(markerAt(0), idx)).toBe(0)
    expect(cameraMsForMarker(markerAt(90_000), idx)).toBe(90_000)
  })

  it("ignores pauses entirely — the whole point of the second clock", () => {
    // Scenario: start, record 10 min, pause 5 min, record 10 more min, flag.
    // NET recording time at the flag is 20 min (pause excluded), but the camera
    // has been rolling for 25 min. The editor must be given 25.
    const idx = buildTakeIndex([take()])
    const netMs = 20 * 60_000
    const cameraMs = cameraMsForMarker(markerAt(25 * 60_000), idx)
    expect(cameraMs).toBe(25 * 60_000)
    expect(cameraMs).not.toBe(netMs)
    expect(cameraMs! - netMs).toBe(5 * 60_000) // exactly the paused duration
  })

  it("applies camera_offset_ms so a mis-anchored take can be corrected", () => {
    // The camera rolled 4.2s before anyone clicked "ابدأ التسجيل".
    const idx = buildTakeIndex([take({ camera_offset_ms: 4_200 })])
    expect(cameraMsForMarker(markerAt(60_000), idx)).toBe(64_200)
  })

  it("supports a negative offset (camera rolled after the click)", () => {
    const idx = buildTakeIndex([take({ camera_offset_ms: -1_500 })])
    expect(cameraMsForMarker(markerAt(60_000), idx)).toBe(58_500)
  })

  it("accepts ISO strings as well as Date objects", () => {
    const idx = buildTakeIndex([take({ anchor_at: ANCHOR.toISOString() })])
    const marker = {
      take_number: 1,
      wall_time: new Date(ANCHOR.getTime() + 30_000).toISOString(),
    }
    expect(cameraMsForMarker(marker, idx)).toBe(30_000)
  })

  it("resolves each marker against ITS OWN take anchor", () => {
    // Re-shoot an hour later. Take 2's markers must measure from take 2's
    // anchor — using take 1's would report them an hour into the timeline.
    const anchor2 = new Date(ANCHOR.getTime() + 3_600_000)
    const idx = buildTakeIndex([
      take({ take_number: 1 }),
      take({ take_number: 2, anchor_at: anchor2 }),
    ])
    expect(cameraMsForMarker(markerAt(5_000, 1), idx)).toBe(5_000)
    expect(
      cameraMsForMarker({ take_number: 2, wall_time: new Date(anchor2.getTime() + 5_000) }, idx),
    ).toBe(5_000)
  })

  it("returns null — never 0 — when the take has no anchor row", () => {
    // A silent 0 would plant a false marker at the head of the editor's
    // timeline. An unresolvable marker has to be reported as unresolvable.
    const idx = buildTakeIndex([take({ take_number: 1 })])
    expect(cameraMsForMarker(markerAt(5_000, 7), idx)).toBeNull()
  })

  it("returns null on an unparseable timestamp", () => {
    const idx = buildTakeIndex([take({ anchor_at: "not-a-date" })])
    expect(cameraMsForMarker(markerAt(5_000), idx)).toBeNull()
  })

  it("does not clamp a marker that predates its anchor", () => {
    // Clamping would hide a broken anchor behind plausible output. Export
    // formatters are responsible for refusing to emit negative timecode.
    const idx = buildTakeIndex([take()])
    expect(cameraMsForMarker(markerAt(-2_000), idx)).toBe(-2_000)
  })
})

describe("buildTakeIndex", () => {
  it("keys takes by take_number", () => {
    const idx = buildTakeIndex([take({ take_number: 3 }), take({ take_number: 1 })])
    expect([...idx.keys()].sort()).toEqual([1, 3])
  })

  it("is empty for no takes, so every lookup reports null", () => {
    const idx = buildTakeIndex([])
    expect(cameraMsForMarker(markerAt(1_000), idx)).toBeNull()
  })
})

describe("withCameraMs", () => {
  it("annotates markers without dropping their other fields", () => {
    const markers = [
      { ...markerAt(1_000), id: "a", net_recording_ms: 1_000 },
      { ...markerAt(2_000), id: "b", net_recording_ms: 2_000 },
    ]
    const out = withCameraMs(markers, [take()])
    expect(out.map((m) => [m.id, m.camera_ms])).toEqual([
      ["a", 1_000],
      ["b", 2_000],
    ])
    expect(out[0].net_recording_ms).toBe(1_000)
  })

  it("keeps net and camera time as independent values", () => {
    // Same marker, 3 minutes of accumulated pause: the two clocks disagree and
    // both must survive the annotation.
    const marker = { ...markerAt(600_000), net_recording_ms: 420_000 }
    const [out] = withCameraMs([marker], [take()])
    expect(out.net_recording_ms).toBe(420_000)
    expect(out.camera_ms).toBe(600_000)
  })

  it("marks unresolvable markers null while resolving the rest", () => {
    const out = withCameraMs([markerAt(1_000, 1), markerAt(1_000, 9)], [take()])
    expect(out.map((m) => m.camera_ms)).toEqual([1_000, null])
  })
})
