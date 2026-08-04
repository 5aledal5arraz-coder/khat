import { describe, expect, it } from "vitest"

import {
  GUESTS,
  findExisting,
  normalizeName,
  slugify,
} from "@/scripts/backfill-guests-from-youtube"

/**
 * Backfilling the guest each episode already names on YouTube.
 *
 * The failure this guards is duplication. The three guest rows that existed
 * before this backfill carry an honorific inside `name` («الملازم عبدالله
 * البطي»), while the descriptions introduce the same person without one. A
 * matcher that only compares whole strings creates a second عبدالله البطي and
 * splits his episodes across two guest pages.
 */

const EXISTING = [
  { id: "guest-nGqsJ324xhY", normalized_name: normalizeName("الدكتور الحارث المزيدي") },
  { id: "guest-0_mxyqK3sDk", normalized_name: normalizeName("الأستاذ علي دريساوي") },
  { id: "guest-8DRBW9BERJM", normalized_name: normalizeName("الملازم عبدالله البطي") },
]

describe("findExisting — an honorific must not create a second person", () => {
  it.each([
    ["عبدالله البطي", "guest-8DRBW9BERJM"],
    ["علي دريساوي", "guest-0_mxyqK3sDk"],
    ["الحارث المزيدي", "guest-nGqsJ324xhY"],
  ])("%s matches the stored row that carries a title", (name, id) => {
    expect(findExisting(name as string, EXISTING)).toBe(id)
  })

  it("matches in the other direction too — stored bare, looked up with a title", () => {
    const bare = [{ id: "g1", normalized_name: normalizeName("جاسم الزراعي") }]
    expect(findExisting("الأستاذ جاسم الزراعي", bare)).toBe("g1")
  })

  it("returns null for someone genuinely new", () => {
    expect(findExisting("حسام مطر", EXISTING)).toBeNull()
    expect(findExisting("فيصل المحيني", EXISTING)).toBeNull()
  })

  it("does not confuse two different people who share a first name", () => {
    const stored = [{ id: "g-alghadhouri", normalized_name: normalizeName("فيصل الغضوري") }]
    expect(findExisting("فيصل المحيني", stored)).toBeNull()
  })
})

/**
 * `normalizeName` exists to MIRROR the `normalized_name` column, which
 * Postgres generates with `[^a-z0-9؀-ۿ\s]+`. Matching compares
 * against that column, so the two must agree character for character — a
 * "better" normalizer here would silently stop matching rows.
 */
describe("normalizeName — mirrors the DB's generated column", () => {
  it("strips Arabic diacritics so a vowelled name still matches", () => {
    expect(normalizeName("جَاسِم الزِراعي")).toBe(normalizeName("جاسم الزراعي"))
  })

  it("collapses repeated whitespace and trims", () => {
    expect(normalizeName("  عبد   العزيز   الرومي ")).toBe("عبد العزيز الرومي")
  })

  it("strips Latin punctuation", () => {
    expect(normalizeName("O'Brien-Smith")).toBe("o brien smith")
  })

  it("KEEPS the Arabic comma, because the DB's range keeps it too", () => {
    // U+060C sits inside ؀-ۿ, so neither side removes it. Asserted
    // rather than fixed: divergence here would break matching, not improve it.
    expect(normalizeName("عبد العزيز، الرومي")).toBe("عبد العزيز، الرومي")
  })

  it("is idempotent — normalizing twice changes nothing", () => {
    for (const g of GUESTS) {
      expect(normalizeName(normalizeName(g.name))).toBe(normalizeName(g.name))
    }
  })
})

describe("slugify — Arabic slugs, per Khaled's call on URLs", () => {
  it("keeps the Arabic and joins on dashes", () => {
    expect(slugify("جاسم الزراعي")).toBe("جاسم-الزراعي")
    expect(slugify("عبد العزيز الرومي")).toBe("عبد-العزيز-الرومي")
  })

  it("produces no leading, trailing or doubled dashes", () => {
    for (const g of GUESTS) {
      const s = slugify(g.name)
      expect(s.startsWith("-")).toBe(false)
      expect(s.endsWith("-")).toBe(false)
      expect(s).not.toContain("--")
    }
  })

  it("gives every distinct guest a distinct slug", () => {
    const names = [...new Set(GUESTS.map((g) => g.name))]
    const slugs = names.map(slugify)
    expect(new Set(slugs).size).toBe(names.length)
  })
})

describe("the reviewed table itself", () => {
  it("covers every episode exactly once", () => {
    const ids = GUESTS.map((g) => g.episode)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("names فيصل المحيني for 016 — the subject نور الدين زنكي is not the guest", () => {
    const ep = GUESTS.find((g) => g.label === "016")
    expect(ep?.name).toBe("فيصل المحيني")
    expect(GUESTS.some((g) => g.name.includes("زنكي"))).toBe(false)
  })

  it("names the partner Khaled confirmed for 017, not both", () => {
    const ep = GUESTS.find((g) => g.label === "017")
    expect(ep?.name).toBe("فيصل الغضوري")
    expect(GUESTS.some((g) => g.name.includes("سعد السند"))).toBe(false)
  })

  it("carries باسم اللوغاني across the whole سالفة run and 014", () => {
    const his = GUESTS.filter((g) => g.name === "باسم اللوغاني").map((g) => g.label)
    expect(his).toEqual(["014", "سالفة 01", "سالفة 02", "سالفة 03", "سالفة 04", "سالفة 05"])
  })

  it("gives each clip the guest of the episode it was cut from", () => {
    const clips = GUESTS.filter((g) => g.label.startsWith("مقطع"))
    expect(clips).toHaveLength(4)
    for (const c of clips) {
      const parent = c.label.replace("مقطع ← ", "")
      expect(GUESTS.find((g) => g.label === parent)?.name).toBe(c.name)
    }
  })

  it("stores every Instagram handle as a bare handle, not a URL", () => {
    for (const g of GUESTS) {
      if (!g.ig) continue
      expect(g.ig).not.toContain("/")
      expect(g.ig).not.toContain("http")
    }
  })
})
