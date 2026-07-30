/**
 * CMX3600 EDL formatter — the rules that make Resolve actually read the file.
 *
 * Every assertion here maps to a way this export fails SILENTLY in Resolve:
 * markers an hour off the timeline, blank labels, an unrecognised colour token,
 * or an injected line that Resolve parses as a real event. Silent is the whole
 * problem — nothing errors, the editor just cuts against wrong flags.
 *
 * Pure: no DB, no I/O.
 */

import { describe, expect, it } from "vitest"
import {
  EDL_FPS,
  EDL_TIMELINE_START_MS,
  RESOLVE_MARKER_COLORS,
  buildResolveMarkerEdl,
  framesToTimecode,
  msToEdlTimecode,
  msToFrames,
  resolveColorFor,
  sanitizeEdlField,
} from "@/lib/recording-v2/marker-export"
import { QUICK_MARKER_TYPES } from "@/lib/recording-v2/marker-types"

function marker(over: Partial<Parameters<typeof buildResolveMarkerEdl>[0]["markers"][number]> = {}) {
  return {
    camera_ms: 0,
    marker_type: "clip",
    index: 1,
    section_key: null,
    ...over,
  }
}

describe("frame + timecode conversion at 24fps non-drop", () => {
  it("shoots at 24fps", () => {
    expect(EDL_FPS).toBe(24)
  })

  it("converts ms to whole frames, rounding to nearest", () => {
    expect(msToFrames(0)).toBe(0)
    expect(msToFrames(1000)).toBe(24)
    expect(msToFrames(41)).toBe(1) // 41.67ms ≈ 1 frame
    expect(msToFrames(20)).toBe(0) // under half a frame
    expect(msToFrames(500)).toBe(12)
  })

  it("formats frames as HH:MM:SS:FF with the frame field below fps", () => {
    expect(framesToTimecode(0)).toBe("00:00:00:00")
    expect(framesToTimecode(23)).toBe("00:00:00:23")
    expect(framesToTimecode(24)).toBe("00:00:01:00")
    expect(framesToTimecode(24 * 60)).toBe("00:01:00:00")
    expect(framesToTimecode(24 * 3600)).toBe("01:00:00:00")
  })

  it("never emits a frame field of 24 or higher", () => {
    for (let f = 0; f < 24 * 90; f++) {
      const ff = Number(framesToTimecode(f).split(":")[3])
      expect(ff).toBeLessThan(EDL_FPS)
    }
  })

  it("wraps hours at 24 rather than inventing a day field", () => {
    expect(framesToTimecode(24 * 3600 * 24)).toBe("00:00:00:00")
  })
})

describe("the one-hour timeline offset", () => {
  it("is one hour", () => {
    expect(EDL_TIMELINE_START_MS).toBe(3_600_000)
  })

  it("shifts a zero offset to 01:00:00:00 — Resolve's default timeline start", () => {
    // Without this, a marker at 0 lands an hour BEFORE the timeline begins and
    // silently never appears.
    expect(msToEdlTimecode(0)).toBe("01:00:00:00")
  })

  it("shifts a real offset by exactly one hour", () => {
    expect(msToEdlTimecode(90_000)).toBe("01:01:30:00")
    expect(msToEdlTimecode(3_600_000)).toBe("02:00:00:00")
  })

  it("applies the offset in the built EDL, not just the helper", () => {
    const { edl } = buildResolveMarkerEdl({
      title: "t",
      markers: [marker({ camera_ms: 0 })],
    })
    expect(edl).toContain("01:00:00:00 01:00:00:01 01:00:00:00 01:00:00:01")
    expect(edl).not.toContain("00:00:00:00")
  })
})

describe("colour mapping", () => {
  it("exposes exactly Resolve's 16 marker colours", () => {
    expect(RESOLVE_MARKER_COLORS).toHaveLength(16)
    expect(RESOLVE_MARKER_COLORS).toContain("Fuchsia")
    expect(RESOLVE_MARKER_COLORS).toContain("Cocoa")
  })

  it("maps every marker type in our taxonomy to a VALID Resolve colour", () => {
    // An unrecognised colour name is undocumented behaviour — possibly a silently
    // skipped event. So the mapping may only ever produce names from the list.
    for (const t of [...QUICK_MARKER_TYPES, "energy_change", "insight_used"]) {
      expect(RESOLVE_MARKER_COLORS).toContain(resolveColorFor(t))
    }
  })

  it("keeps the confirmed exact matches", () => {
    expect(resolveColorFor("clip")).toBe("Sky")
    expect(resolveColorFor("cut")).toBe("Rose")
    expect(resolveColorFor("tech_issue")).toBe("Red")
    expect(resolveColorFor("break_end")).toBe("Green")
  })

  it("gives unknown/legacy types a real-but-distinct colour, not an invented name", () => {
    expect(resolveColorFor("some_legacy_type")).toBe("Cream")
    expect(RESOLVE_MARKER_COLORS).toContain(resolveColorFor("some_legacy_type"))
  })

  it("distinguishes the three editing flags from each other", () => {
    const editing = ["cut", "retake", "tech_issue"].map(resolveColorFor)
    expect(new Set(editing).size).toBe(3)
  })

  it("writes the token concatenated with no separator", () => {
    const { edl } = buildResolveMarkerEdl({
      title: "t",
      markers: [marker({ marker_type: "quote" })],
    })
    expect(edl).toContain("|C:ResolveColorPurple")
    expect(edl).not.toContain("ResolveColor Purple")
  })
})

describe("sanitizeEdlField — EDL has no quoting, so it removes", () => {
  it("replaces newlines with a space instead of quoting them", () => {
    // A raw newline would terminate the comment line and let the remainder be
    // parsed as EDL. There is no escape syntax to fall back on.
    expect(sanitizeEdlField("first\nsecond")).toBe("first second")
    expect(sanitizeEdlField("a\r\n\r\nb")).toBe("a b")
  })

  it("kills an injected fake event line", () => {
    const attack = "harmless\n002  001      V     C        01:00:05:00 01:00:05:01 01:00:05:00 01:00:05:01"
    const out = sanitizeEdlField(attack, 200)
    expect(out).not.toContain("\n")
    expect(out.split("\n")).toHaveLength(1)
  })

  it("kills an injected EDL comment directive", () => {
    const out = sanitizeEdlField("note\n* FROM CLIP NAME: evil.mov", 200)
    expect(out).not.toContain("\n")
  })

  it("strips the pipe so a note cannot forge a token", () => {
    expect(sanitizeEdlField("evil |M:hijacked |D:999")).toBe("evil M:hijacked D:999")
    expect(sanitizeEdlField("evil |M:hijacked")).not.toContain("|")
  })

  it("defuses a field that would start a structural line", () => {
    // Leading `*` = comment directive; leading digits = an event number. The
    // property that matters is that the result no longer STARTS with either —
    // the content is kept, just pushed out of the structural position.
    for (const input of ["* COMMENT: x", "002 001 V C", "9 lives"]) {
      const out = sanitizeEdlField(input)
      expect(out.startsWith("*")).toBe(false)
      expect(/^\d/.test(out)).toBe(false)
      expect(out).toContain(input.replace(/^[*\s]+/, "").split(" ")[0])
    }
    expect(sanitizeEdlField("* COMMENT: x")).toBe("-* COMMENT: x")
  })

  it("drops non-ASCII, because Resolve drops it anyway — silently", () => {
    expect(sanitizeEdlField("لحظة قوية")).toBe("")
    expect(sanitizeEdlField("clip لحظة 7")).toBe("clip  7".replace(/\s+/g, " "))
  })

  it("collapses whitespace and truncates", () => {
    expect(sanitizeEdlField("a     b")).toBe("a b")
    expect(sanitizeEdlField("x".repeat(200), 10)).toHaveLength(10)
  })

  it("handles null/undefined without throwing", () => {
    expect(sanitizeEdlField(null)).toBe("")
    expect(sanitizeEdlField(undefined)).toBe("")
  })
})

describe("buildResolveMarkerEdl — file shape", () => {
  it("emits the header Resolve expects", () => {
    const { edl } = buildResolveMarkerEdl({ title: "Room 42", markers: [marker()] })
    const lines = edl.split("\r\n")
    expect(lines[0]).toBe("TITLE: Room 42")
    expect(lines[1]).toBe("FCM: NON-DROP FRAME")
    expect(lines[2]).toBe("")
  })

  it("emits four timecodes with out = in + 1 frame", () => {
    const { edl } = buildResolveMarkerEdl({
      title: "t",
      markers: [marker({ camera_ms: 90_000 })],
    })
    const event = edl.split("\r\n").find((l) => l.startsWith("001"))!
    const tcs = event.match(/\d\d:\d\d:\d\d:\d\d/g)!
    expect(tcs).toHaveLength(4)
    expect(tcs[0]).toBe("01:01:30:00")
    expect(tcs[1]).toBe("01:01:30:01")
    expect(tcs[0]).toBe(tcs[2]) // src-in === rec-in
    expect(tcs[1]).toBe(tcs[3]) // src-out === rec-out
  })

  it("numbers events 3-digit zero-padded and sequentially", () => {
    const { edl } = buildResolveMarkerEdl({
      title: "t",
      markers: [marker({ index: 1 }), marker({ index: 2 }), marker({ index: 3 })],
    })
    expect(edl).toContain("001  001      V     C")
    expect(edl).toContain("002  001      V     C")
    expect(edl).toContain("003  001      V     C")
  })

  it("puts the three tokens in the order |C: |M: |D: after the note", () => {
    const { edl } = buildResolveMarkerEdl({
      title: "t",
      markers: [marker({ marker_type: "quote", index: 7, section_key: "deep_dive" })],
    })
    const comment = edl.split("\r\n").find((l) => l.includes("|C:"))!
    expect(comment).toBe(" deep_dive - see CSV 7 |C:ResolveColorPurple |M:quote 7 |D:1")
    expect(comment.indexOf("|C:")).toBeLessThan(comment.indexOf("|M:"))
    expect(comment.indexOf("|M:")).toBeLessThan(comment.indexOf("|D:"))
  })

  it("labels markers with the English type + the CSV index, and no `#`", () => {
    // `#` is unverified in Resolve's |M: field, and an unsupported character
    // there fails silently — so the link to the CSV is a bare number.
    const { edl } = buildResolveMarkerEdl({
      title: "t",
      markers: [marker({ marker_type: "highlight", index: 12 })],
    })
    expect(edl).toContain("|M:highlight 12")
    expect(edl).not.toContain("#")
  })

  it("emits |D:1 for point markers", () => {
    const { edl } = buildResolveMarkerEdl({ title: "t", markers: [marker()] })
    expect(edl).toContain("|D:1")
  })

  it("produces a pure-ASCII file even when inputs are Arabic", () => {
    const { edl } = buildResolveMarkerEdl({
      title: "غرفة التسجيل",
      markers: [marker({ section_key: "القسم" })],
    })
    expect(/[^\x00-\x7F]/.test(edl)).toBe(false)
    expect(edl).toContain("TITLE: KHAT markers") // Arabic title fell back
  })
})

describe("buildResolveMarkerEdl — markers it refuses to place", () => {
  it("skips markers with no camera time instead of writing 00:00", () => {
    const { edl, written, skipped } = buildResolveMarkerEdl({
      title: "t",
      markers: [marker({ index: 1, camera_ms: null }), marker({ index: 2, camera_ms: 5_000 })],
    })
    expect(written).toBe(1)
    expect(skipped).toEqual([{ index: 1, reason: "no_camera_time" }])
    expect(edl).toContain("|M:clip 2")
    expect(edl).not.toContain("|M:clip 1")
  })

  it("skips negative camera time — it would land before the timeline and vanish", () => {
    const { written, skipped } = buildResolveMarkerEdl({
      title: "t",
      markers: [marker({ index: 1, camera_ms: -2_000 })],
    })
    expect(written).toBe(0)
    expect(skipped).toEqual([{ index: 1, reason: "before_timeline_start" }])
  })

  it("renumbers events over skipped markers so numbering stays contiguous", () => {
    const { edl } = buildResolveMarkerEdl({
      title: "t",
      markers: [
        marker({ index: 1, camera_ms: null }),
        marker({ index: 2, camera_ms: 1_000 }),
        marker({ index: 3, camera_ms: 2_000 }),
      ],
    })
    expect(edl).toContain("001  001")
    expect(edl).toContain("002  001")
    expect(edl).not.toContain("003  001")
  })

  it("still yields a valid empty EDL when nothing can be placed", () => {
    const { edl, written } = buildResolveMarkerEdl({
      title: "t",
      markers: [marker({ camera_ms: null })],
    })
    expect(written).toBe(0)
    expect(edl.split("\r\n")[0]).toBe("TITLE: t")
    expect(edl).toContain("FCM: NON-DROP FRAME")
  })
})

describe("the two formats split the job", () => {
  it("EDL carries the English type; the Arabic note never reaches it", () => {
    // This is the contract: Resolve would drop the Arabic silently, so the EDL
    // deliberately carries only what survives, and the CSV carries the rest.
    const { edl } = buildResolveMarkerEdl({
      title: "t",
      markers: [marker({ marker_type: "quote", index: 3 })],
    })
    expect(edl).toContain("quote")
    expect(edl).toContain("see CSV 3")
    expect(/[^\x00-\x7F]/.test(edl)).toBe(false)
  })
})
