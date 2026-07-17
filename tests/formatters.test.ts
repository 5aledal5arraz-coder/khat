/**
 * Pure formatter helpers (lib/shared/formatters.ts).
 */
import { describe, it, expect } from "vitest"
import { guestInitials } from "@/lib/shared/formatters"

describe("guestInitials", () => {
  it("takes the first letter of up to two words for a normal name", () => {
    expect(guestInitials("حسام مطر")).toBe("حم")
    expect(guestInitials("Steven Novella")).toBe("SN")
  })

  it("uses only the first two words for longer names", () => {
    expect(guestInitials("عبد الله البطي")).toBe("عا")
  })

  it("single-word name yields a single initial", () => {
    expect(guestInitials("Ithra")).toBe("I")
    expect(guestInitials("خط")).toBe("خ")
  })

  it("skips leading numeric/placeholder tokens (regression: '0ب' bug)", () => {
    // Junk imported name '019 بودكاست خط' must NOT render as '0ب'.
    expect(guestInitials("019 بودكاست خط")).toBe("بخ")
    expect(guestInitials("2024 سالفة")).toBe("س")
  })

  it("falls back to raw first chars when there are no letter-initial words", () => {
    // All-numeric name: no letter words, so use the raw tokens rather than crash.
    expect(guestInitials("019")).toBe("0")
  })

  it("handles empty / whitespace / missing names cleanly", () => {
    expect(guestInitials("")).toBe("•")
    expect(guestInitials("   ")).toBe("•")
    expect(guestInitials(undefined as unknown as string)).toBe("•")
  })
})
