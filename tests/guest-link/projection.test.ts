/**
 * «نسخة الضيف» — the allowlist projection is the security boundary (Yousef).
 *
 * (1) The exact key set of every object the guest receives is pinned.
 * (2) No forbidden field VALUE (canary) appears anywhere in the output.
 * (3) The test can SEE: planting a canary in an allowed field is detected —
 *     a grep that never fires is a guard that went blind.
 */

import { describe, expect, it } from "vitest"
import {
  GUEST_STORY_SECTION_LABEL,
  MAX_SAMPLES_PER_AXIS,
  MAX_SAMPLES_TOTAL,
  parseGuestPrepView,
  toGuestPrepView,
} from "@/lib/guest-link/view"
import { canaryPrep, CANARY, CANARY_VALUES, FORBIDDEN_KEYS } from "./fixtures"

const LOCATION = {
  location_label: "بيت بو فهد",
  address: "اليرموك، قطعة 1",
  map_url: "https://maps.app.goo.gl/abc",
  house_photo: "0123456789abcdef.jpg",
}

function project(prep = canaryPrep(), overrides = {}) {
  return toGuestPrepView({
    prep,
    overrides,
    schedule_at: new Date("2026-10-01T16:00:00Z"),
    show_schedule: true,
    location: LOCATION,
  })
}

function leaks(json: string): string[] {
  return CANARY_VALUES.filter((c) => json.includes(c))
}

function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out))
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.add(k)
      allKeys(x, out)
    }
  }
  return out
}

describe("toGuestPrepView — exact key set (canary)", () => {
  const { view } = project()

  it("top level", () => {
    expect(Object.keys(view).sort()).toEqual(["axes", "location", "schedule_at", "v"])
  })
  it("axis", () => {
    for (const a of view.axes) expect(Object.keys(a).sort()).toEqual(["label", "ref", "samples"])
  })
  it("sample", () => {
    for (const a of view.axes)
      for (const s of a.samples) expect(Object.keys(s).sort()).toEqual(["ref", "text"])
  })
  it("location", () => {
    expect(Object.keys(view.location!).sort()).toEqual(["address", "has_photo", "label", "map_url"])
  })
  it("no forbidden key anywhere in the tree", () => {
    const keys = allKeys(view)
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), k).toBe(false)
  })
  it("the house photo FILENAME never crosses — only a boolean", () => {
    expect(JSON.stringify(view)).not.toContain(LOCATION.house_photo)
    expect(view.location!.has_photo).toBe(true)
  })
})

describe("toGuestPrepView — no forbidden value leaks", () => {
  it("zero canaries in the serialized view", () => {
    expect(leaks(JSON.stringify(project().view))).toEqual([])
  })

  it("the grep can see: a canary planted in an ALLOWED field is caught", () => {
    const prep = canaryPrep()
    prep.question_bank[0] = { ...prep.question_bank[0], text: CANARY.thesis, priority: "must_ask" }
    expect(leaks(JSON.stringify(project(prep).view))).toContain(CANARY.thesis)
  })

  it("ids in the view are opaque refs, never question ids or section kinds", () => {
    const { view } = project()
    const json = JSON.stringify(view)
    expect(json).not.toContain(CANARY.questionId)
    for (const a of view.axes) {
      expect(a.ref).toMatch(/^a\d+$/)
      for (const s of a.samples) expect(s.ref).toMatch(/^s\d+$/)
    }
    for (const kind of ["opening", "build_up", "conflict", "deep_dive", "emotional_peak", "resolution"]) {
      expect(json).not.toContain(`"${kind}"`)
    }
  })
})

describe("sample selection", () => {
  it("only low-risk, non-confrontational, non-emotional questions", () => {
    const json = JSON.stringify(project().view)
    expect(json).not.toContain(CANARY.riskyQuestion)
    expect(json).not.toContain(CANARY.confrontational)
    expect(json).not.toContain(CANARY.emotional)
  })

  it("caps: ≤3 per axis, ≤12 total, must_ask first", () => {
    const { view } = project()
    const total = view.axes.reduce((n, a) => n + a.samples.length, 0)
    expect(total).toBeLessThanOrEqual(MAX_SAMPLES_TOTAL)
    for (const a of view.axes) expect(a.samples.length).toBeLessThanOrEqual(MAX_SAMPLES_PER_AXIS)
    expect(view.axes[0].samples[0].text).toBe("سؤال آمن opening رقم 3")
  })

  it("admin overrides: hide, pin, edit text", () => {
    const prep = canaryPrep()
    const id = (k: string, i: number) => `${CANARY.questionId}-${k}-${i}`
    const { view, refs } = project(prep, {
      [id("opening", 3)]: { hidden: true },
      [id("opening", 2)]: { pinned: true, text: "نص عدّله الفريق" },
    })
    const texts = view.axes[0].samples.map((s) => s.text)
    expect(texts[0]).toBe("نص عدّله الفريق")
    expect(texts).not.toContain("سؤال آمن opening رقم 3")
    // Server-only ref map resolves back to the real id.
    expect(refs.samples[view.axes[0].samples[0].ref].question_id).toBe(id("opening", 2))
  })

  it("story labels are guest-friendly — never the host's arc words", () => {
    const labels = project().view.axes.map((a) => a.label)
    expect(labels).toEqual(Object.values(GUEST_STORY_SECTION_LABEL))
    for (const l of labels) expect(l).not.toMatch(/مواجهة|المواجهة|ذروة|التوتر/)
  })

  it("course modules use their own title", () => {
    const prep = canaryPrep({ format: "course" })
    prep.episode_sections = prep.episode_sections.map((s, i) => ({ ...s, title: `المحور ${i + 1}` }))
    expect(project(prep).view.axes.map((a) => a.label)[2]).toBe("المحور 3")
  })

  it("no prep → no axes, never an error", () => {
    const { view } = toGuestPrepView({ prep: null, schedule_at: null, show_schedule: true, location: null })
    expect(view).toEqual({ v: 1, schedule_at: null, location: null, axes: [] })
  })

  it("show_schedule=false hides the time", () => {
    const { view } = toGuestPrepView({
      prep: canaryPrep(),
      schedule_at: new Date(),
      show_schedule: false,
      location: null,
    })
    expect(view.schedule_at).toBeNull()
  })
})

describe("parseGuestPrepView — stored snapshots are re-projected", () => {
  it("drops injected keys and non-https map links", () => {
    const { view } = project()
    const tampered = {
      ...view,
      thesis: CANARY.thesis,
      sensitive_zones: [CANARY.zone],
      location: { ...view.location, map_url: "javascript:alert(1)", secret: CANARY.strategy },
      axes: view.axes.map((a) => ({
        ...a,
        purpose: CANARY.purpose,
        samples: a.samples.map((s) => ({ ...s, follow_up_prompt: CANARY.followUp })),
      })),
    }
    const parsed = parseGuestPrepView(tampered)!
    expect(leaks(JSON.stringify(parsed))).toEqual([])
    expect(parsed.location!.map_url).toBeNull()
    expect(parsed.axes.length).toBe(view.axes.length)
  })

  it("rejects an unknown version", () => {
    expect(parseGuestPrepView({ v: 2, axes: [] })).toBeNull()
    expect(parseGuestPrepView(null)).toBeNull()
  })
})
