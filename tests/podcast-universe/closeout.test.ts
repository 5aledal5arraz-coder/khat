/**
 * M1 closeout (addendum 2026-10-03): Kuwait Context is derived and never sets
 * nationality; the «مراجعة الجنسية» buttons are audited; «غير متأكد» changes
 * nothing. No DB: `@/lib/db` is a recording fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const rec = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
  person: null as Record<string, unknown> | null,
}))

vi.mock("@/lib/db", () => {
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: async () => (rec.person ? [rec.person] : []) }) }) }),
    update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => void rec.updates.push(v) }) }),
    insert: () => ({ values: async (v: Record<string, unknown>) => void rec.inserts.push(v) }),
  }
  return { db: { transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }
})

import { kuwaitContext, kuwaitContextLabel } from "@/lib/podcast-universe/kuwait-context"
import { reviewNationality } from "@/lib/podcast-universe/identity-actions"

const ROOT = path.resolve(__dirname, "../..")

describe("Kuwait Context — derived levels (addendum)", () => {
  it("none / weak / strong", () => {
    expect(kuwaitContext([]).level).toBe("none")
    expect(kuwaitContext([{ channelName: "محفوف" }]).level).toBe("weak")
    expect(kuwaitContext([{ channelName: "محفوف" }, { channelName: "محفوف" }]).level).toBe("strong")
    const two = kuwaitContext([{ channelName: "محفوف" }, { channelName: "بدون ورق" }])
    expect(two).toMatchObject({ level: "strong", kwCoreAppearanceCount: 2, kwCoreUniqueChannelCount: 2 })
    expect(two.reasons.length).toBeGreaterThan(0)
  })
  it("carries no nationality field and its label never says «محتمل كويتي»", () => {
    const c = kuwaitContext([{ channelName: "a" }, { channelName: "a" }]) as unknown as Record<string, unknown>
    expect(Object.keys(c).some((k) => k.startsWith("nationality"))).toBe(false)
    expect(kuwaitContextLabel("strong", false)).toBe("سياق كويتي قوي — الجنسية غير متحققة")
    expect(kuwaitContextLabel("strong", true)).toBeNull()
    for (const l of ["weak", "strong"] as const) expect(kuwaitContextLabel(l, false)).not.toMatch(/محتمل|likely/i)
  })
  it("no code that WRITES nationality imports the context module, and the module writes nothing", () => {
    const src = readFileSync(path.join(ROOT, "lib/podcast-universe/kuwait-context.ts"), "utf8")
    expect(src).not.toMatch(/\b(update|insert|UPDATE|INSERT)\b\s*[(`]/)
    const dir = path.join(ROOT, "lib/podcast-universe")
    const files = [...readdirSync(dir).map((f) => path.join(dir, f)), ...readdirSync(path.join(dir, "extraction")).map((f) => path.join(dir, "extraction", f))]
    for (const f of files.filter((f) => f.endsWith(".ts"))) {
      const s = readFileSync(f, "utf8")
      // A WRITER of podcast_people (where nationality lives).
      if (/update\(podcastPeople\)|insert\(podcastPeople\)|UPDATE podcast_people/.test(s) && !f.endsWith("kuwait-context.ts")) {
        expect(s, `${path.basename(f)} writes nationality and must not import kuwait-context`).not.toMatch(/(from|import)\s*\(?\s*["'][^"']*kuwait-context["']/)
      }
    }
  })
})

describe("«مراجعة الجنسية» decisions are audited", () => {
  beforeEach(() => {
    rec.updates.length = 0
    rec.inserts.length = 0
    rec.person = {
      id: "p1",
      merged_into_person_id: null,
      nationality_code: null,
      nationality_status: "unknown",
      nationality_basis: "none",
      nationality_verification_method: null,
    }
  })
  it("كويتي → KW VERIFIED, basis manual, method manual_editorial, + audit row", async () => {
    const r = await reviewNationality("p1", "kuwaiti", "سيرة رسمية", "admin-1")
    expect(r.ok).toBe(true)
    expect(rec.updates[0]).toMatchObject({
      nationality_code: "KW",
      nationality_status: "verified",
      nationality_basis: "manual",
      nationality_verification_method: "manual_editorial",
    })
    expect(rec.inserts).toHaveLength(1)
    expect(rec.inserts[0]).toMatchObject({ person_id: "p1", action: "nationality_review_kuwaiti", actor_id: "admin-1", note: "سيرة رسمية" })
  })
  it("غير كويتي → unknown with a manual basis (leaves the queue), audited", async () => {
    await reviewNationality("p1", "not_kuwaiti", "", "admin-1")
    expect(rec.updates[0]).toMatchObject({ nationality_status: "unknown", nationality_basis: "manual", nationality_code: null })
    expect(rec.inserts[0]).toMatchObject({ action: "nationality_review_not_kuwaiti" })
  })
  it("غير متأكد → NOTHING changes on the person, only the audit row", async () => {
    await reviewNationality("p1", "unsure", "", "admin-1")
    expect(rec.updates).toHaveLength(0)
    expect(rec.inserts).toHaveLength(1)
    expect(rec.inserts[0]).toMatchObject({ action: "nationality_review_unsure" })
  })
})

describe("CHECK: verified ⇒ a verification method (migration 0040)", () => {
  it("the migration and the schema both carry the constraint", () => {
    const mig = readFileSync(path.join(ROOT, "drizzle/migrations/0040_podcast_universe_nat_method.sql"), "utf8")
    expect(mig).toContain(`CHECK (nationality_status <> 'verified' OR nationality_verification_method IS NOT NULL)`)
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS "nationality_verification_method"/)
    const schema = readFileSync(path.join(ROOT, "lib/db/schema/podcast-universe.ts"), "utf8")
    expect(schema).toContain("chk_podcast_people_verified_has_method")
  })
})
