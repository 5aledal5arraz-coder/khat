/**
 * 2026-10-03 prod incident fixes (pure / mocked; DB-level cases live in db.test.ts):
 *   1. extraction runs on its own PINNED task kind — KHAT_AI_MODEL_STRUCTURAL
 *      and Settings overrides cannot move it;
 *   2. the budget books ACTUAL billable cost; a 429 / no-credits call costs 0;
 *   4. honorifics stripped for the comparison key only; same-episode alias collapse.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            // A Settings override that tries to move BOTH kinds to mini.
            { value: { structural: { model: "gpt-5.4-mini" }, podcast_guest_extract: { model: "gpt-5.4-mini" } } },
          ],
        }),
      }),
    }),
  },
}))
vi.mock("@/lib/ai-router/model-catalog", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai-router/model-catalog")>()),
  getModelCatalog: async () => ({ ids: new Set(["gpt-5.6-luna", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4o-mini"]) }),
}))

import { invalidateModelOverridesCache, resolveModelChoice, CONFIGURABLE_TASK_KINDS } from "@/lib/ai-router/model-selection"
import { DEFAULT_MODELS, FALLBACK_CHAINS, PODCAST_GUEST_EXTRACT_MODEL } from "@/lib/ai-router/registry"
import { billableCostUsd } from "@/lib/podcast-universe/extraction/budget"
import { normalizeNameKey } from "@/lib/podcast-universe/normalize"
import { collapseSameEpisodeAliases } from "@/lib/podcast-universe/extraction/same-episode"
import type { ValidGuest } from "@/lib/podcast-universe/extraction/validate"

const ROOT = path.resolve(__dirname, "../..")
afterEach(() => {
  delete process.env.KHAT_AI_MODEL_STRUCTURAL
  delete process.env.KHAT_AI_MODEL_PODCAST_GUEST_EXTRACT
  invalidateModelOverridesCache()
})

describe("1. podcast_guest_extract is pinned to luna", () => {
  it("env and Settings move `structural` to mini — but never podcast_guest_extract", async () => {
    process.env.KHAT_AI_MODEL_STRUCTURAL = "gpt-5.4-mini"
    process.env.KHAT_AI_MODEL_PODCAST_GUEST_EXTRACT = "gpt-5.4-mini"
    invalidateModelOverridesCache()
    expect((await resolveModelChoice("structural")).modelName).toBe("gpt-5.4-mini")
    expect((await resolveModelChoice("podcast_guest_extract")).modelName).toBe("gpt-5.6-luna")
  })
  it("one-model chain, luna default, not offered in Settings", () => {
    expect(PODCAST_GUEST_EXTRACT_MODEL).toBe("gpt-5.6-luna")
    expect(DEFAULT_MODELS.podcast_guest_extract.modelName).toBe("gpt-5.6-luna")
    expect(FALLBACK_CHAINS.podcast_guest_extract).toEqual(["gpt-5.6-luna"])
    expect(CONFIGURABLE_TASK_KINDS).not.toContain("podcast_guest_extract")
  })
  it("the extraction call uses the pinned kind AND passes the pinned model", () => {
    const src = readFileSync(path.join(ROOT, "lib/podcast-universe/extraction/run.ts"), "utf8")
    expect(src).toMatch(/taskKind: "podcast_guest_extract",\s*preferredModel: PODCAST_GUEST_EXTRACT_MODEL,/)
    expect(src).not.toMatch(/taskKind: "structural"/)
  })
})

describe("2. the budget books actual billable cost", () => {
  const pricing = { inputCostPer1M: 0.2, outputCostPer1M: 1.2 }
  const base = { status: "succeeded", costUsd: null, tokensIn: null, tokensOut: null, errorClass: null }
  it("a 429 / no-credits / auth failure with no usage costs 0 — never the reservation", () => {
    for (const errorClass of ["rate_limited", "quota_exceeded", "auth_failed"]) {
      expect(billableCostUsd({ ...base, status: "failed", errorClass }, pricing, 0.05), errorClass).toBe(0)
    }
  })
  it("a recorded provider cost is booked exactly", () => {
    expect(billableCostUsd({ ...base, costUsd: 0.0123 }, pricing, 0.05)).toBe(0.0123)
  })
  it("token counts without a cost are priced", () => {
    expect(billableCostUsd({ ...base, tokensIn: 1_000_000, tokensOut: 0 }, pricing, 0.05)).toBeCloseTo(0.2, 9)
  })
  it("unknown usage (timeout / 5xx / success without figures) books the reservation — never silently 0", () => {
    expect(billableCostUsd({ ...base, status: "timed_out", errorClass: "timeout" }, pricing, 0.05)).toBe(0.05)
    expect(billableCostUsd({ ...base, status: "failed", errorClass: "server_error" }, pricing, 0.05)).toBe(0.05)
    expect(billableCostUsd(base, pricing, 0.05)).toBe(0.05)
  })
})

describe("4. honorifics (comparison key only) and the same-episode alias", () => {
  it("strips the new titles, keeps given names that look like titles", () => {
    expect(normalizeNameKey("الكوتش دينا عبد المقصود")).toBe("دينا عبد المقصود")
    expect(normalizeNameKey("الأميرة ريما بنت بندر")).toBe("ريما بنت بندر")
    expect(normalizeNameKey("البروفيسور سالم ناصر")).toBe("سالم ناصر")
    expect(normalizeNameKey("سعادة السفير")).toBe("السفير")
    expect(normalizeNameKey("الدكتورة مها الغنيم")).toBe("مها الغنيم")
    expect(normalizeNameKey("Mrs. Jane Doe")).toBe("jane doe")
    expect(normalizeNameKey("معالي العسعوسي")).toBe("معالي العسعوسي")
    expect(normalizeNameKey("أمير خان")).toBe("امير خان")
  })

  const g = (display_name: string, over: Partial<ValidGuest> = {}): ValidGuest => ({
    display_name,
    role_text: null,
    is_primary_guest: false,
    evidence_field: "title",
    evidence_text: display_name,
    nationality_claim_code: null,
    nationality_claim_text: null,
    gender_signal: "unknown",
    gender_evidence_text: null,
    confidence: 0.9,
    ...over,
  })

  it("«دينا» + «الكوتش دينا عبد المقصود» in one episode → one guest + an alias", () => {
    const out = collapseSameEpisodeAliases([g("دينا", { is_primary_guest: true }), g("الكوتش دينا عبد المقصود", { role_text: "مدربة" })])
    expect(out.guests.map((x) => x.display_name)).toEqual(["الكوتش دينا عبد المقصود"])
    expect(out.guests[0].is_primary_guest).toBe(true)
    expect(out.aliases).toEqual([{ alias: "دينا", of: "الكوتش دينا عبد المقصود", rule: "same_episode_alias" }])
  })
  it("a competing person who also contains the short name → keep both", () => {
    const out = collapseSameEpisodeAliases([g("دينا"), g("دينا عبد المقصود"), g("دينا الشمري")])
    expect(out.guests).toHaveLength(3)
    expect(out.aliases).toEqual([])
  })
  it("different role, gender or nationality → keep both", () => {
    expect(collapseSameEpisodeAliases([g("سالم", { role_text: "طبيب" }), g("سالم ناصر", { role_text: "مهندس" })]).guests).toHaveLength(2)
    expect(collapseSameEpisodeAliases([g("نور", { gender_signal: "female" }), g("نور سالم", { gender_signal: "male" })]).guests).toHaveLength(2)
    expect(collapseSameEpisodeAliases([g("سالم", { nationality_claim_code: "SA" }), g("سالم ناصر", { nationality_claim_code: "KW" })]).guests).toHaveLength(2)
  })
  it("words out of order or not a subset → keep both", () => {
    expect(collapseSameEpisodeAliases([g("ناصر سالم"), g("سالم ناصر العتيبي")]).guests).toHaveLength(2)
    expect(collapseSameEpisodeAliases([g("خالد"), g("سالم ناصر")]).guests).toHaveLength(2)
  })
  it("the extraction run applies it per episode and audits the alias", () => {
    const src = readFileSync(path.join(ROOT, "lib/podcast-universe/extraction/run.ts"), "utf8")
    expect(src).toMatch(/const collapsed = collapseSameEpisodeAliases\(res\.guests\)/)
    expect(src).toMatch(/for \(const g of collapsed\.guests\)/)
    expect(src).toMatch(/await recordSameEpisodeAlias\(tx, personId, al\.alias, al\.of, episodeId, EXTRACT_ACTOR\)/)
    const people = readFileSync(path.join(ROOT, "lib/podcast-universe/people.ts"), "utf8")
    expect(people).toMatch(/action: "same_episode_alias"/)
  })
})
