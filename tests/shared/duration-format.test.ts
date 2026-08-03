import { describe, it, expect } from "vitest"
import { formatDuration, episodeDurationLabel } from "@/lib/shared/formatters"

describe("formatDuration — one unit-bearing form", () => {
  it("uses س/د above the hour", () => {
    expect(formatDuration(135)).toBe("2 س 15 د")
    expect(formatDuration(86)).toBe("1 س 26 د")
  })
  it("drops a zero minute remainder", () => {
    expect(formatDuration(120)).toBe("2 س")
    expect(formatDuration(60)).toBe("1 س")
  })
  it("uses the Arabic plural below the hour", () => {
    expect(formatDuration(18)).toBe("18 دقيقة")
    expect(formatDuration(5)).toBe("5 دقائق")
    expect(formatDuration(2)).toBe("دقيقتين")
  })
  it("never returns a bare clock time", () => {
    for (const m of [1, 5, 59, 60, 61, 120, 135, 216]) {
      expect(formatDuration(m)).not.toMatch(/^\d+:\d\d$/)
    }
  })
  it("episodeDurationLabel omits missing/zero durations and otherwise matches", () => {
    expect(episodeDurationLabel(null)).toBeNull()
    expect(episodeDurationLabel(0)).toBeNull()
    expect(episodeDurationLabel(135)).toBe(formatDuration(135))
  })
})
