/**
 * Studio Wave 2 — the raw/edited audio-journey decision.
 *
 * The contract that guards Khaled's two journeys: ONLY the exact "raw" string
 * opens the time-map flow; everything else (absent field, "edited", a typo, a
 * non-string) resolves to the existing full pipeline. A wrong value must never
 * silently drop an edited upload into the raw flow, and a client that omits the
 * field must keep the pre-Wave-2 behaviour.
 */

import { describe, expect, it } from "vitest"
import { normalizeAudioStage } from "@/lib/validation/audio"

describe("normalizeAudioStage", () => {
  it("selects 'raw' only for the exact string \"raw\"", () => {
    expect(normalizeAudioStage("raw")).toBe("raw")
  })

  it("resolves 'edited' for the explicit edited value", () => {
    expect(normalizeAudioStage("edited")).toBe("edited")
  })

  it("defaults to 'edited' when the field is absent (null/undefined)", () => {
    expect(normalizeAudioStage(null)).toBe("edited")
    expect(normalizeAudioStage(undefined)).toBe("edited")
  })

  it("defaults to 'edited' for malformed or unexpected values", () => {
    expect(normalizeAudioStage("")).toBe("edited")
    expect(normalizeAudioStage("RAW")).toBe("edited") // case-sensitive on purpose
    expect(normalizeAudioStage(" raw ")).toBe("edited")
    expect(normalizeAudioStage("published")).toBe("edited")
    expect(normalizeAudioStage(42)).toBe("edited")
    expect(normalizeAudioStage({})).toBe("edited")
  })
})
