/**
 * Topic-engine defect #12 — the exploration frames (slot i: field × segment ×
 * territory × archetype) were prompt instructions only; nothing compared a
 * returned card with the slot it was assigned.
 *
 * Soft by design (Khaled is spend-sensitive and the card is already paid for):
 * a mismatch RE-RANKS the card lower and FLAGS it — it never rejects.
 * The prompt already lets the model swap a field for another of the SAME door,
 * so only a door change counts as a field mismatch.
 *
 * Review follow-up: an echo we cannot RESOLVE (unknown field, empty or
 * label-only segment, missing archetype) is "unverifiable" — recorded, never
 * penalised. Arabic is folded before matching (tashkeel, أإآ→ا, ة→ه, ى→ي,
 * parentheticals dropped), so spelling variants are not counted as drift.
 */
import { describe, it, expect } from "vitest"
import {
  frameFit,
  applyFramePenalty,
  FRAME_MISMATCH_PENALTY,
} from "@/lib/khat-map/v2/frame-fit"
import type { ExplorationFrame } from "@/lib/khat-map/v2/exploration"

const FRAMES: ExplorationFrame[] = [
  {
    territory: { id: "t1", label_ar: "x", hint_ar: "", category: "human_stories", kind: "universe" },
    archetype: "personal_story",
    field: { id: "divorce", label_ar: "الطلاق", door: "family", door_label_ar: "العلاقات والأسرة" },
    segment: { id: "35_60", label_ar: "٣٥–٦٠", concern_ar: "الطلاق" },
  },
  {
    territory: { id: "t2", label_ar: "y", hint_ar: "", category: "health", kind: "universe" },
    archetype: "hidden_world",
    field: { id: "addiction_recovery", label_ar: "الإدمان والتعافي", door: "health_mind", door_label_ar: "الصحة والنفس" },
    segment: { id: "20_35", label_ar: "٢٠–٣٥", concern_ar: "الغربة" },
  },
]

describe("frameFit — mismatches", () => {
  it("a card that honours its slot has no mismatch", () => {
    expect(
      frameFit({ slot: 1, archetype: "personal_story", segment: "٣٥–٦٠", field: "الطلاق" }, FRAMES, 0),
    ).toEqual({ mismatches: [], unverifiable: [] })
  })

  it("a same-door field swap is allowed (the prompt permits it)", () => {
    expect(
      frameFit({ slot: 1, archetype: "personal_story", segment: "35_60", field: "الزواج الثاني" }, FRAMES, 0).mismatches,
    ).toEqual([])
  })

  it("flags segment, door and archetype drift", () => {
    expect(
      frameFit({ slot: 1, archetype: "big_idea", segment: "٢٠–٣٥", field: "ريادة الأعمال" }, FRAMES, 0).mismatches,
    ).toEqual(["archetype", "segment", "field_door"])
  })

  it("matches by the echoed slot number, not the array position", () => {
    expect(
      frameFit({ slot: 2, archetype: "hidden_world", segment: "20-35", field: "الإدمان والتعافي" }, FRAMES, 0).mismatches,
    ).toEqual([])
  })

  it("no frames → nothing to check", () => {
    expect(frameFit({ archetype: "x" }, [], 0)).toEqual({ mismatches: [], unverifiable: [] })
  })
})

describe("frameFit — Arabic folding before matching", () => {
  it("spelling variants of the field still resolve (no false drift)", () => {
    const r = frameFit(
      // ادمان without hamza, ة/ه, tashkeel, and a parenthetical door note
      { slot: 2, archetype: "hidden_world", segment: "٢٠–٣٥", field: "«الادمانُ والتعافي» (الصحة والنفس)" },
      FRAMES,
      0,
    )
    expect(r).toEqual({ mismatches: [], unverifiable: [] })
  })

  it("ى/ي and ة/ه variants resolve", () => {
    const r = frameFit({ slot: 1, archetype: "personal_story", segment: "35-60", field: "الزواج الثانى" }, FRAMES, 0)
    expect(r.mismatches).toEqual([])
    expect(r.unverifiable).toEqual([])
  })
})

describe("frameFit — unverifiable is recorded, not penalised", () => {
  it("unknown field → unverifiable, not field_door", () => {
    const r = frameFit({ slot: 1, archetype: "personal_story", segment: "٣٥–٦٠", field: "حقل لا وجود له" }, FRAMES, 0)
    expect(r.mismatches).toEqual([])
    expect(r.unverifiable).toEqual(["field"])
  })

  it("empty or label-only segment → unverifiable", () => {
    expect(frameFit({ slot: 1, archetype: "personal_story", segment: "", field: "الطلاق" }, FRAMES, 0).unverifiable).toEqual(["segment"])
    expect(
      frameFit({ slot: 1, archetype: "personal_story", segment: "الشباب", field: "الطلاق" }, FRAMES, 0),
    ).toEqual({ mismatches: [], unverifiable: ["segment"] })
  })

  it("missing archetype → unverifiable", () => {
    expect(frameFit({ slot: 1, segment: "٣٥–٦٠", field: "الطلاق" }, FRAMES, 0).unverifiable).toEqual(["archetype"])
  })
})

describe("applyFramePenalty — re-rank, never reject", () => {
  it("lowers the score per mismatch but keeps it selectable", () => {
    expect(applyFramePenalty(7, ["segment"])).toBeCloseTo(7 - FRAME_MISMATCH_PENALTY)
    expect(applyFramePenalty(1, ["archetype", "segment", "field_door"])).toBeGreaterThan(0)
  })

  it("leaves a court-rejected 0 at 0 and a clean card untouched", () => {
    expect(applyFramePenalty(0, ["segment"])).toBe(0)
    expect(applyFramePenalty(6.4, [])).toBe(6.4)
  })
})
