/**
 * Phase 2.5 (P2.5.b) — ops dashboard formatter unit tests.
 *
 * Pure tests. No DB. No React. Locks down the 4 display helpers used
 * across `app/admin/ops/_components/*`.
 */

import { describe, expect, it } from "vitest"
import {
  formatUtc,
  humanizeAge,
  severityClass,
  truncate,
} from "@/lib/ops/format"

// ─── formatUtc ───────────────────────────────────────────────────────

describe("formatUtc", () => {
  it("renders a Date as 'YYYY-MM-DD HH:MM:SSZ'", () => {
    expect(formatUtc(new Date("2026-05-26T14:23:45Z"))).toBe(
      "2026-05-26 14:23:45Z",
    )
  })

  it("strips milliseconds and timezone", () => {
    expect(formatUtc(new Date("2026-01-02T03:04:05.789Z"))).toBe(
      "2026-01-02 03:04:05Z",
    )
  })

  it("returns em-dash for invalid Date", () => {
    expect(formatUtc(new Date("not-a-date"))).toBe("—")
  })

  it("returns em-dash for non-Date input (defensive)", () => {
    // @ts-expect-error testing defensive guard
    expect(formatUtc("2026-05-26")).toBe("—")
  })
})

// ─── humanizeAge ─────────────────────────────────────────────────────

describe("humanizeAge", () => {
  it("returns 'أقل من ثانية' for sub-second durations", () => {
    expect(humanizeAge(0)).toBe("أقل من ثانية")
    expect(humanizeAge(500)).toBe("أقل من ثانية")
    expect(humanizeAge(999)).toBe("أقل من ثانية")
  })

  it("singular second", () => {
    expect(humanizeAge(1000)).toBe("منذ ثانية واحدة")
  })

  it("dual seconds", () => {
    expect(humanizeAge(2_000)).toBe("منذ ثانيتين")
  })

  it("3–10 seconds uses plural form", () => {
    expect(humanizeAge(5_000)).toBe("منذ 5 ثوانٍ")
  })

  it("11+ seconds uses fewSingular form", () => {
    expect(humanizeAge(12_000)).toBe("منذ 12 ثانية")
  })

  it("minutes — singular / dual / plural / fewSingular", () => {
    expect(humanizeAge(60_000)).toBe("منذ دقيقة واحدة")
    expect(humanizeAge(2 * 60_000)).toBe("منذ دقيقتين")
    expect(humanizeAge(5 * 60_000)).toBe("منذ 5 دقائق")
    expect(humanizeAge(12 * 60_000)).toBe("منذ 12 دقيقة")
  })

  it("hours — singular / dual / plural", () => {
    expect(humanizeAge(60 * 60_000)).toBe("منذ ساعة واحدة")
    expect(humanizeAge(2 * 60 * 60_000)).toBe("منذ ساعتين")
    expect(humanizeAge(5 * 60 * 60_000)).toBe("منذ 5 ساعات")
  })

  it("days — singular / dual / plural", () => {
    expect(humanizeAge(24 * 60 * 60_000)).toBe("منذ يوم واحد")
    expect(humanizeAge(2 * 24 * 60 * 60_000)).toBe("منذ يومين")
    expect(humanizeAge(5 * 24 * 60 * 60_000)).toBe("منذ 5 أيام")
    expect(humanizeAge(30 * 24 * 60 * 60_000)).toBe("منذ 30 يوم")
  })

  it("negative input → 'في المستقبل'", () => {
    expect(humanizeAge(-1000)).toBe("في المستقبل")
  })

  it("non-finite input → em-dash", () => {
    expect(humanizeAge(NaN)).toBe("—")
    expect(humanizeAge(Infinity)).toBe("—")
  })
})

// ─── severityClass ───────────────────────────────────────────────────

describe("severityClass", () => {
  it("info → muted (neutral) classes", () => {
    expect(severityClass("info")).toContain("muted")
  })

  it("warn → amber classes", () => {
    expect(severityClass("warn")).toContain("amber")
  })

  it("error → red classes", () => {
    expect(severityClass("error")).toContain("red")
  })

  it("unknown severity falls back to info (muted/neutral)", () => {
    expect(severityClass("nonsense")).toContain("muted")
  })

  it("each variant includes 'border' class", () => {
    expect(severityClass("info")).toContain("border")
    expect(severityClass("warn")).toContain("border")
    expect(severityClass("error")).toContain("border")
  })
})

// ─── truncate ────────────────────────────────────────────────────────

describe("truncate", () => {
  it("returns string verbatim when under max", () => {
    expect(truncate("hi", 60)).toBe("hi")
  })

  it("truncates with ellipsis when over max", () => {
    const long = "x".repeat(100)
    const out = truncate(long, 10)
    expect(out).toBe("xxxxxxxxxx…")
    expect(out.length).toBe(11)
  })

  it("returns em-dash for null", () => {
    expect(truncate(null, 60)).toBe("—")
  })

  it("returns em-dash for undefined", () => {
    expect(truncate(undefined, 60)).toBe("—")
  })

  it("returns empty string verbatim (not em-dash)", () => {
    expect(truncate("", 60)).toBe("")
  })
})
