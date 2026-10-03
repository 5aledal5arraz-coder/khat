/**
 * Podcast Universe M1 — the pure rules (docs/podcast-universe-plan-v1.md).
 * Duration classes, B7 normalization, B6 deterministic validation, Decision 3
 * nationality/gender negatives, B8 no-name-only-merge, B13 budget gate, B5
 * incremental stop, B4/B12 YouTube error classes and quota reservation order.
 */
import { describe, expect, it, vi } from "vitest"
import { durationClass, parseIsoDuration } from "@/lib/podcast-universe/duration"
import { normalizeNameKey, normalizeText } from "@/lib/podcast-universe/normalize"
import { validateExtraction, type SourceEpisode } from "@/lib/podcast-universe/extraction/validate"
import {
  admissibleGenderEvidence,
  admissibleNationalityClaim,
  derivePersonEvidence,
  hasNationalityMarker,
  isLikelyKuwaitiMale,
  isVerifiedKuwaitiMale,
  type PersonEvidenceState,
} from "@/lib/podcast-universe/evidence"
import { decideIdentityLink, type ExistingPerson } from "@/lib/podcast-universe/identity"
import { checkBudget, estimateBatchCostUsd } from "@/lib/podcast-universe/extraction/budget"
import { shouldStopIncremental } from "@/lib/podcast-universe/crawl"
import { nextQuotaReset, quotaDay, PodcastQuotaExhaustedError } from "@/lib/podcast-universe/quota"
import {
  createYoutubeClient,
  YoutubePermanentError,
  YoutubeTransientError,
} from "@/lib/podcast-universe/youtube"
import { descriptionExcerpt } from "@/lib/podcast-universe/extraction/prompt"
import { containsAsWords } from "@/lib/podcast-universe/normalize"
import { maxOutputTokensFor } from "@/lib/podcast-universe/extraction/budget"
import { guestEmptyState, parseGuestFilters } from "@/lib/podcast-universe/queries"
import { readFileSync } from "node:fs"
import path from "node:path"
import { PU_JOB_TYPES } from "@/lib/podcast-universe/constants"

// ─── Duration classes (Decision 2) ───────────────────────────────────────

describe("duration classes", () => {
  it("classifies at the exact boundaries", () => {
    expect(durationClass(1200)).toBe("core_longform")
    expect(durationClass(1199)).toBe("midform_context")
    expect(durationClass(480)).toBe("midform_context")
    expect(durationClass(479)).toBe("short_clip")
    expect(durationClass(0)).toBe("short_clip")
    expect(durationClass(5400)).toBe("core_longform")
  })
  it("parses YouTube ISO-8601 durations and refuses garbage", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723)
    expect(parseIsoDuration("PT20M")).toBe(1200)
    expect(parseIsoDuration("P1DT1S")).toBe(86401)
    expect(parseIsoDuration("P0D")).toBe(0)
    expect(parseIsoDuration("1:20:00")).toBeNull()
    expect(parseIsoDuration(undefined)).toBeNull()
  })
})

// ─── B7 normalization ────────────────────────────────────────────────────

describe("name normalization (B7)", () => {
  it("strips tashkeel/tatweel, folds alef and ى, keeps ة", () => {
    expect(normalizeText("أحْمـــد إبراهيم آل مُصطفى")).toBe("احمد ابراهيم ال مصطفي")
    expect(normalizeNameKey("فاطمة")).not.toBe(normalizeNameKey("فاطمه"))
  })
  it("strips leading honorifics for comparison only", () => {
    expect(normalizeNameKey("د. فلان الفلاني")).toBe("فلان الفلاني")
    expect(normalizeNameKey("الدكتور فلان الفلاني")).toBe("فلان الفلاني")
    expect(normalizeNameKey("المهندس فلان")).toBe("فلان")
    expect(normalizeNameKey("Dr. John SMITH")).toBe("john smith")
  })
})

// ─── B6 deterministic validation ─────────────────────────────────────────

const EP: SourceEpisode = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "رائد الأعمال الكويتي محمد عبدالله الصالح | قصة إغلاق المشروع",
  description: "في هذه الحلقة نستضيف المهندس سالم ناصر العتيبي.\nتقديم: المقدم خالد",
}

function out(guests: unknown[], extra: Record<string, unknown> = {}) {
  return { episodes: [{ episode_id: EP.id, content_kind: "guest_interview", guests, topic_hint: "x", ...extra }] }
}

describe("extraction validation (B6)", () => {
  it("accepts a guest whose evidence is an exact substring and contains the name", () => {
    const r = validateExtraction(
      out([
        {
          display_name: "محمد عبدالله الصالح",
          is_primary_guest: true,
          evidence_field: "title",
          evidence_text: "رائد الأعمال الكويتي محمد عبدالله الصالح",
          nationality_claim: { country_code: "KW", evidence_text: "رائد الأعمال الكويتي محمد عبدالله الصالح" },
          gender_signal: "male",
          gender_evidence_text: "رائد الأعمال الكويتي",
          confidence: 0.9,
        },
      ]),
      [EP],
    )
    const g = r.results.get(EP.id)!.guests
    expect(g).toHaveLength(1)
    expect(g[0].nationality_claim_code).toBe("KW")
    expect(g[0].gender_signal).toBe("male")
  })

  it("rejects a guest whose evidence is NOT an exact substring (hallucination)", () => {
    const r = validateExtraction(
      out([{ display_name: "يوسف الكندري", evidence_field: "title", evidence_text: "الضيف يوسف الكندري", confidence: 0.99 }]),
      [EP],
    )
    expect(r.results.get(EP.id)!.guests).toHaveLength(0)
    expect(r.issues.some((i) => i.reason.includes("not an exact substring"))).toBe(true)
  })

  it("rejects paraphrased evidence (one changed letter)", () => {
    const r = validateExtraction(
      out([{ display_name: "محمد عبدالله الصالح", evidence_text: "رائد الاعمال الكويتي محمد عبدالله الصالح", confidence: 1 }]),
      [EP],
    )
    expect(r.results.get(EP.id)!.guests).toHaveLength(0)
  })

  it("rejects a display_name that is not inside its evidence", () => {
    const r = validateExtraction(
      out([{ display_name: "سالم العتيبي الكبير", evidence_field: "description", evidence_text: "نستضيف المهندس سالم ناصر العتيبي", confidence: 1 }]),
      [EP],
    )
    expect(r.results.get(EP.id)!.guests).toHaveLength(0)
  })

  it("drops a non-substring nationality claim but keeps the evidenced guest", () => {
    const r = validateExtraction(
      out([
        {
          display_name: "سالم ناصر العتيبي",
          evidence_field: "description",
          evidence_text: "نستضيف المهندس سالم ناصر العتيبي",
          nationality_claim: { country_code: "KW", evidence_text: "المهندس الكويتي سالم ناصر العتيبي" },
          confidence: 0.8,
        },
      ]),
      [EP],
    )
    const g = r.results.get(EP.id)!.guests[0]
    expect(g.display_name).toBe("سالم ناصر العتيبي")
    expect(g.nationality_claim_code).toBeNull()
  })

  it("rejects unknown episode ids and flags a non-contract payload as a schema failure", () => {
    const r = validateExtraction({ episodes: [{ episode_id: "nope", content_kind: "panel", guests: [] }] }, [EP])
    expect(r.missing).toEqual([EP.id])
    expect(validateExtraction({ foo: 1 }, [EP]).schemaFailure).toBe(true)
    expect(validateExtraction(out([], { content_kind: "interview" }), [EP]).results.size).toBe(0)
  })

  it("an empty, valid guests list is a no_guest result, not a failure", () => {
    const r = validateExtraction(out([], { content_kind: "solo_host" }), [EP])
    expect(r.results.get(EP.id)!.guests).toEqual([])
    expect(r.missing).toEqual([])
  })
})

// ─── Decision 3 — nationality / gender negatives ─────────────────────────

describe("nationality evidence (Decision 3)", () => {
  const name = "محمد عبدالله الصالح"
  it("a generic Kuwait mention is never a claim", () => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: "حلقة مسجلة في الكويت مع محمد عبدالله الصالح", displayName: name }).ok).toBe(false)
  })
  it("the channel being Kuwaiti is never a claim («البودكاست الكويتي»)", () => {
    expect(hasNationalityMarker("البودكاست الكويتي يستضيف محمد", "KW")).toBe(false)
    expect(admissibleNationalityClaim({ code: "KW", evidence: "البودكاست الكويتي مع محمد عبدالله الصالح", displayName: name }).ok).toBe(false)
  })
  it("a name alone is never a claim", () => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: "محمد عبدالله الصالح", displayName: name }).ok).toBe(false)
  })
  it("a demonym not attached to this guest's name is not a claim", () => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: "رائد الأعمال الكويتي", displayName: name }).ok).toBe(false)
  })
  it("an explicit attribution is admissible (as PROBABLE input only)", () => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: "رائد الأعمال الكويتي محمد عبدالله الصالح", displayName: name }).ok).toBe(true)
    expect(admissibleNationalityClaim({ code: "KW", evidence: "ضيفنا من الكويت محمد عبدالله الصالح", displayName: name }).ok).toBe(true)
  })

  const blank: PersonEvidenceState = {
    nationality_code: null,
    nationality_status: "unknown",
    nationality_basis: "none",
    gender_marker: "unknown",
    gender_status: "unknown",
    gender_basis: "none",
  }
  it("episode metadata can NEVER produce VERIFIED KW, however many claims agree", () => {
    const apps = Array.from({ length: 5 }, () => ({ nationality_claim_code: "KW", gender_signal: "male" as const, verification_status: "extracted" as const }))
    const s = derivePersonEvidence(blank, apps, null)
    expect(s.nationality_status).toBe("probable")
    expect(s.gender_status).toBe("probable")
    expect(isVerifiedKuwaitiMale(s)).toBe(false)
    expect(isLikelyKuwaitiMale(s)).toBe(true)
  })
  it("no claim → UNKNOWN (correct unknown over incorrect verified)", () => {
    const s = derivePersonEvidence(blank, [{ nationality_claim_code: null, gender_signal: "unknown", verification_status: "extracted" }], null)
    expect(s.nationality_status).toBe("unknown")
    expect(s.nationality_code).toBeNull()
  })
  it("disagreeing claims → CONFLICTED; rejected appearances do not count", () => {
    const s = derivePersonEvidence(
      blank,
      [
        { nationality_claim_code: "KW", gender_signal: "male", verification_status: "extracted" },
        { nationality_claim_code: "SA", gender_signal: "male", verification_status: "extracted" },
        { nationality_claim_code: "EG", gender_signal: "female", verification_status: "rejected" },
      ],
      null,
    )
    expect(s.nationality_status).toBe("conflicted")
    expect(s.gender_status).toBe("probable")
  })
  it("a linked guest_candidates country (possibly LLM-derived) yields at most PROBABLE, never VERIFIED", () => {
    const s = derivePersonEvidence(blank, [], { nationality_code: "KW" })
    expect(s.nationality_status).toBe("probable")
    expect(s.nationality_basis).toBe("khat_candidate")
    expect(isVerifiedKuwaitiMale({ ...s, gender_marker: "male", gender_status: "verified", gender_basis: "manual" })).toBe(false)
    const both = derivePersonEvidence(blank, [{ nationality_claim_code: "KW", gender_signal: "male", verification_status: "extracted" }], { nationality_code: "KW" })
    expect(both.nationality_status).toBe("probable")
    const clash = derivePersonEvidence(blank, [{ nationality_claim_code: "SA", gender_signal: "unknown", verification_status: "extracted" }], { nationality_code: "KW" })
    expect(clash.nationality_status).toBe("conflicted")
  })
  it("a manual decision is never overwritten by re-derivation", () => {
    const manual: PersonEvidenceState = { ...blank, nationality_code: "KW", nationality_status: "verified", nationality_basis: "manual" }
    const s = derivePersonEvidence(manual, [{ nationality_claim_code: "SA", gender_signal: "unknown", verification_status: "extracted" }], null)
    expect(s.nationality_status).toBe("verified")
    expect(s.nationality_code).toBe("KW")
  })
  it("gender evidence that is only the name is rejected", () => {
    expect(admissibleGenderEvidence({ signal: "male", evidence: "محمد عبدالله الصالح", displayName: "محمد عبدالله الصالح" })).toBe(false)
    expect(admissibleGenderEvidence({ signal: "male", evidence: "اللاعب محمد عبدالله الصالح", displayName: "محمد عبدالله الصالح" })).toBe(true)
  })
})

// ─── B8 — never merge on name alone ──────────────────────────────────────

describe("identity merge rules (B8)", () => {
  const CH = "chan-1"
  const person = (over: Partial<ExistingPerson> = {}): ExistingPerson => ({
    id: "p1",
    nameKey: "محمد عبدالله الصالح",
    nationalityCode: null,
    genderMarker: "unknown",
    appearances: [{ channelId: CH, role: "رائد أعمال", nationalityCode: null, gender: "male" }],
    ...over,
  })
  const guest = { nameKey: "محمد عبدالله الصالح", channelId: CH, role: "رائد أعمال", nationalityCode: null, gender: "male" as const }

  it("no namesake → new person, no review", () => {
    expect(decideIdentityLink(guest, [])).toEqual({ action: "create", review: false })
  })
  it("same name on a DIFFERENT channel → new person + review (no name-only merge)", () => {
    const d = decideIdentityLink({ ...guest, channelId: "chan-2" }, [person()])
    expect(d.action).toBe("create")
    expect(d.action === "create" && d.review).toBe(true)
  })
  it("same name, same channel, different role → review", () => {
    const d = decideIdentityLink({ ...guest, role: "طبيب" }, [person()])
    expect(d.action).toBe("create")
  })
  it("same name with no role at all → review", () => {
    expect(decideIdentityLink({ ...guest, role: null }, [person()]).action).toBe("create")
  })
  it("two-token names never auto-link", () => {
    const d = decideIdentityLink({ ...guest, nameKey: "محمد الصالح" }, [person({ nameKey: "محمد الصالح" })])
    expect(d.action).toBe("create")
  })
  it("conflicting nationality geography → review", () => {
    const d = decideIdentityLink({ ...guest, nationalityCode: "SA" }, [person({ nationalityCode: "KW" })])
    expect(d.action).toBe("create")
  })
  it("several existing namesakes → never pick one", () => {
    expect(decideIdentityLink(guest, [person(), person({ id: "p2" })]).action).toBe("create")
  })
  it("Case C: same channel + identical role + 3-token name + no conflict → link", () => {
    expect(decideIdentityLink(guest, [person()])).toEqual({ action: "link", personId: "p1", rule: "case_c_same_channel_role" })
  })
})

// ─── B13 budget ──────────────────────────────────────────────────────────

describe("per-run AI budget (B13)", () => {
  it("refuses when spent + estimate exceeds the cap", () => {
    expect(checkBudget(2.99, 0.02, 3).allowed).toBe(false)
    expect(checkBudget(2.9, 0.1, 3).allowed).toBe(true)
    expect(checkBudget(0, 0.01, 0).allowed).toBe(false)
  })
  it("a 40-episode luna batch is estimated in cents, not dollars", () => {
    const est = estimateBatchCostUsd(60_000, 40, { inputCostPer1M: 0.2, outputCostPer1M: 1.2 })
    expect(est).toBeGreaterThan(0.01)
    expect(est).toBeLessThan(0.1)
  })
})

// ─── B5 incremental stop ─────────────────────────────────────────────────

describe("incremental stop condition (B5)", () => {
  const boundary = new Date("2026-09-01T00:00:00Z")
  const old = new Date("2026-08-01T00:00:00Z")
  const known = new Set(["a", "b"])
  it("never stops before the overlap minimum (2 pages)", () => {
    expect(shouldStopIncremental({ pagesRead: 1, pageIds: ["a", "b"], knownBefore: known, pagePublishedAt: [old, old], boundary })).toBe(false)
  })
  it("stops once a page is all-known AND older than the boundary", () => {
    expect(shouldStopIncremental({ pagesRead: 2, pageIds: ["a", "b"], knownBefore: known, pagePublishedAt: [old, old], boundary })).toBe(true)
  })
  it("does not stop when one id is new", () => {
    expect(shouldStopIncremental({ pagesRead: 3, pageIds: ["a", "z"], knownBefore: known, pagePublishedAt: [old, old], boundary })).toBe(false)
  })
  it("does not stop when an item is newer than the boundary", () => {
    expect(
      shouldStopIncremental({ pagesRead: 3, pageIds: ["a", "b"], knownBefore: known, pagePublishedAt: [old, new Date("2026-09-15T00:00:00Z")], boundary }),
    ).toBe(false)
  })
})

// ─── B4 / B12 YouTube client ─────────────────────────────────────────────

function res(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("YouTube client (B4, B12)", () => {
  const noSleep = async () => {}
  it("reserves quota BEFORE every request, retries included", async () => {
    const order: string[] = []
    const reserve = vi.fn(async () => {
      order.push("reserve")
    })
    const fetchImpl = vi.fn(async () => {
      order.push("fetch")
      return order.filter((o) => o === "fetch").length === 1 ? res(503, {}) : res(200, { items: [{ id: "UCx" }] })
    }) as unknown as typeof fetch
    const yt = createYoutubeClient({ apiKey: "k", reserve, fetchImpl, sleep: noSleep })
    expect((await yt.channelById("UCx"))?.id).toBe("UCx")
    expect(order).toEqual(["reserve", "fetch", "reserve", "fetch"])
  })
  it("Google quotaExceeded → PodcastQuotaExhaustedError (a pause), never retried", async () => {
    const fetchImpl = vi.fn(async () => res(403, { error: { errors: [{ reason: "quotaExceeded" }] } })) as unknown as typeof fetch
    const yt = createYoutubeClient({ apiKey: "k", reserve: async () => {}, fetchImpl, sleep: noSleep })
    await expect(yt.playlistPage("UUx", null)).rejects.toBeInstanceOf(PodcastQuotaExhaustedError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it("the app-side cap stops the call before any request is sent", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const yt = createYoutubeClient({
      apiKey: "k",
      reserve: async () => {
        throw new PodcastQuotaExhaustedError("read", new Date())
      },
      fetchImpl,
      sleep: noSleep,
    })
    await expect(yt.videosByIds(["a"])).rejects.toBeInstanceOf(PodcastQuotaExhaustedError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it("429 is retried, then surfaces as transient", async () => {
    const fetchImpl = vi.fn(async () => res(429, {})) as unknown as typeof fetch
    const yt = createYoutubeClient({ apiKey: "k", reserve: async () => {}, fetchImpl, sleep: noSleep, maxInCallRetries: 2 })
    await expect(yt.playlistPage("UUx", null)).rejects.toBeInstanceOf(YoutubeTransientError)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
  it("403 forbidden / 404 are permanent, not retried", async () => {
    const fetchImpl = vi.fn(async () => res(404, { error: { errors: [{ reason: "playlistNotFound" }] } })) as unknown as typeof fetch
    const yt = createYoutubeClient({ apiKey: "k", reserve: async () => {}, fetchImpl, sleep: noSleep })
    await expect(yt.playlistPage("UUx", null)).rejects.toBeInstanceOf(YoutubePermanentError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it("never puts the API key in the URL", async () => {
    const fetchImpl = vi.fn(async () => res(200, { items: [] })) as unknown as typeof fetch
    const yt = createYoutubeClient({ apiKey: "SECRET-KEY", reserve: async () => {}, fetchImpl, sleep: noSleep })
    await yt.channelByHandle("@x")
    const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(url).not.toContain("SECRET-KEY")
    expect(url).toContain("forHandle=x")
  })
})

describe("quota day (Pacific)", () => {
  it("resets at the next Pacific midnight", () => {
    const now = new Date("2026-10-03T12:00:00Z") // 05:00 PDT
    expect(quotaDay(now)).toBe("2026-10-03")
    const reset = nextQuotaReset(now, 0)
    expect(quotaDay(reset)).toBe("2026-10-04")
    expect(reset.toISOString()).toBe("2026-10-04T07:00:00.000Z")
  })
})

describe("description excerpt", () => {
  it("caps at 1,200 chars but keeps a later guest-introducing line verbatim", () => {
    const filler = Array.from({ length: 40 }, (_, i) => `سطر رقم ${i} `.repeat(4)).join("\n")
    const desc = `${filler}\nضيف الحلقة: سالم ناصر العتيبي`
    const ex = descriptionExcerpt(desc)
    expect(ex).toContain("ضيف الحلقة: سالم ناصر العتيبي")
    expect(desc.includes("ضيف الحلقة: سالم ناصر العتيبي")).toBe(true)
  })
})

describe("worker wiring", () => {
  it("every Podcast Universe job type has a HANDLER_TIMEOUT_MS entry", () => {
    const src = readFileSync(path.resolve(__dirname, "../../lib/jobs/worker.ts"), "utf8")
    for (const t of PU_JOB_TYPES) expect(src).toContain(`"${t}":`)
  })
})


// ─── Review fixes (noura / yousef / rashid, 2026-10-03) ──────────────────

describe("word-boundary matching (noura #4)", () => {
  it("«علي» is not inside «تعليم»; «سالم» is not inside «السالمي»", () => {
    expect(containsAsWords("حلقة عن تعليم الأطفال", "علي")).toBe(false)
    expect(containsAsWords("مع خالد السالمي", "سالم")).toBe(false)
    expect(containsAsWords("مع علي، رائد أعمال", "علي")).toBe(true)
    expect(containsAsWords("ضيفنا (علي)", "(علي)")).toBe(true)
  })
  const ep: SourceEpisode = { id: "22222222-2222-4222-8222-222222222222", title: "حلقة عن تعليم الأطفال مع المعلمة", description: null }
  it("a display_name that only occurs inside another word is rejected", () => {
    const r = validateExtraction(
      { episodes: [{ episode_id: ep.id, content_kind: "guest_interview", guests: [{ display_name: "علي", evidence_text: "تعليم", confidence: 1 }] }] },
      [ep],
    )
    expect(r.results.get(ep.id)!.guests).toHaveLength(0)
  })
  it("evidence that starts mid-word in the source is not an exact substring", () => {
    const r = validateExtraction(
      { episodes: [{ episode_id: ep.id, content_kind: "guest_interview", guests: [{ display_name: "عليم الأطفال", evidence_text: "عليم الأطفال", confidence: 1 }] }] },
      [ep],
    )
    expect(r.results.get(ep.id)!.guests).toHaveLength(0)
  })
  it("unknown episode_id is rejected with its reason", () => {
    const r = validateExtraction({ episodes: [{ episode_id: "33333333-3333-4333-8333-333333333333", content_kind: "panel", guests: [] }] }, [ep])
    expect(r.issues).toContainEqual(expect.objectContaining({ severity: "episode_rejected", reason: "unknown episode_id" }))
    expect(r.results.size).toBe(0)
  })
})

describe("nationality must be attached to the guest (noura #5)", () => {
  const salem = "سالم ناصر"
  it.each([
    ["host", "المذيع الكويتي خالد يحاور سالم ناصر"],
    ["channel", "قناة الديوانية الكويتية مع سالم ناصر"],
    ["generic", "الشركات الكويتية وسالم ناصر"],
    ["generic 2", "عن الشركات الكويتية مع سالم ناصر"],
    ["podcast", "البودكاست الكويتي سالم ناصر"],
  ])("rejects a %s demonym", (_k, ev) => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: ev, displayName: salem }).ok).toBe(false)
  })
  it.each([
    ["role before name", "رائد الأعمال الكويتي سالم ناصر"],
    ["demonym before name", "الكويتي سالم ناصر"],
    ["demonym after name", "سالم ناصر الكويتي"],
    ["origin phrase", "ضيفنا من الكويت سالم ناصر"],
  ])("accepts %s", (_k, ev) => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: ev, displayName: salem }).ok).toBe(true)
  })
  it("accepts English order: Kuwaiti entrepreneur X", () => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: "Kuwaiti entrepreneur Salem Nasser", displayName: "Salem Nasser" }).ok).toBe(true)
    expect(admissibleNationalityClaim({ code: "KW", evidence: "Kuwaiti host Khaled talks to Salem Nasser", displayName: "Salem Nasser" }).ok).toBe(false)
  })
})

describe("gender evidence must describe the guest (noura #5/#8)", () => {
  const salem = "سالم ناصر"
  it("«مع» alone is not a masculine marker", () => {
    expect(admissibleGenderEvidence({ signal: "male", evidence: "مع سالم ناصر", displayName: salem })).toBe(false)
    expect(admissibleGenderEvidence({ signal: "male", evidence: "مع", displayName: salem, guestEvidence: "مع سالم ناصر" })).toBe(false)
  })
  it("a gendered word on the HOST is not the guest's", () => {
    expect(
      admissibleGenderEvidence({ signal: "male", evidence: "المذيع", displayName: salem, guestEvidence: "المذيع خالد يحاور سالم ناصر" }),
    ).toBe(false)
  })
  it("a descriptor touching the name counts", () => {
    expect(admissibleGenderEvidence({ signal: "male", evidence: "رائد الأعمال", displayName: salem, guestEvidence: "رائد الأعمال سالم ناصر" })).toBe(true)
  })
  it("validation path: a dropped gender claim leaves the guest with gender unknown", () => {
    const ep: SourceEpisode = { id: "44444444-4444-4444-8444-444444444444", title: "المذيع خالد يحاور سالم ناصر", description: null }
    const r = validateExtraction(
      {
        episodes: [
          {
            episode_id: ep.id,
            content_kind: "guest_interview",
            guests: [
              { display_name: salem, evidence_text: "المذيع خالد يحاور سالم ناصر", gender_signal: "male", gender_evidence_text: "المذيع", confidence: 0.9 },
            ],
          },
        ],
      },
      [ep],
    )
    const g = r.results.get(ep.id)!.guests[0]
    expect(g.gender_signal).toBe("unknown")
    expect(r.issues.some((i) => i.severity === "claim_dropped" && i.reason.includes("gender"))).toBe(true)
  })
})

describe("Case C needs a distinguishing role (noura #6)", () => {
  const CH = "chan-1"
  const p = (role: string): ExistingPerson => ({
    id: "p1",
    nameKey: "محمد عبدالله الصالح",
    nationalityCode: null,
    genderMarker: "unknown",
    appearances: [{ channelId: CH, role, nationalityCode: null, gender: "unknown" }],
  })
  it.each(["ضيف", "ضيف الحلقة", "الضيف", "guest", "Guest", "the guest"])("never auto-links on the generic role «%s»", (role) => {
    expect(decideIdentityLink({ nameKey: "محمد عبدالله الصالح", channelId: CH, role, nationalityCode: null, gender: "unknown" }, [p(role)]).action).toBe("create")
  })
})

describe("guest registry params (noura #7)", () => {
  it("bad params fall back instead of reaching SQL", () => {
    const f = parseGuestFilters({ page: "abc", min: "-3", from: "2026-13-45", to: "not-a-date", channel: "x' OR 1=1", nat: "evil" })
    expect(f.page).toBe(1)
    expect(f.minAppearances).toBeUndefined()
    expect(f.lastFrom).toBeUndefined()
    expect(f.lastTo).toBeUndefined()
    expect(f.channelId).toBeUndefined()
    expect(f.nationality).toBe("")
    expect(parseGuestFilters({ page: "0" }).page).toBe(1)
    expect(parseGuestFilters({ page: "-3" }).page).toBe(1)
    expect(parseGuestFilters({ page: "1.5" }).page).toBe(1)
    expect(parseGuestFilters({ min: "2" }).minAppearances).toBe(2)
    expect(parseGuestFilters({ page: "3", from: "2026-02-28" })).toMatchObject({ page: 3, lastFrom: "2026-02-28" })
  })
})

describe("explicit max output tokens (rashid #11)", () => {
  it("is sized to the batch and the estimate charges all of it", () => {
    expect(maxOutputTokensFor(40)).toBe(26_000)
    expect(maxOutputTokensFor(20)).toBe(14_000)
    const p = { inputCostPer1M: 0, outputCostPer1M: 1_000_000 }
    expect(estimateBatchCostUsd(0, 40, p)).toBe(26_000)
  })
})

describe("guest registry empty state (noura #3)", () => {
  it("says «no indexed appearance» only when the NAME matches nobody, ignoring filters", () => {
    expect(guestEmptyState({ q: "سالم", total: 0, nameOnlyTotal: 0 })).toBe("no_indexed_appearance")
    // A filter excluded a person the name DOES match → not a "not found" claim.
    expect(guestEmptyState({ q: "سالم", total: 0, nameOnlyTotal: 2 })).toBe("no_results_for_filters")
    expect(guestEmptyState({ q: undefined, total: 0, nameOnlyTotal: null })).toBe("no_results_for_filters")
    expect(guestEmptyState({ q: "سالم", total: 3, nameOnlyTotal: null })).toBe("none")
  })
})

// ─── Noura's low notes before the paid run (2026-10-03) ──────────────────

describe("English demonym needs a role noun; an org after the name is not nationality", () => {
  it.each([
    ["Kuwaiti podcast with Salem Ali", "Salem Ali"],
    ["Kuwaiti host with Salem Ali", "Salem Ali"],
    ["Kuwaiti show Salem Ali", "Salem Ali"],
    ["سالم العتيبي الكويتية للبترول", "سالم العتيبي"],
    ["سالم العتيبي الكويتي للاتصالات", "سالم العتيبي"],
  ])("rejects «%s»", (ev, name) => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: ev, displayName: name }).ok).toBe(false)
  })
  it.each([
    ["Kuwaiti entrepreneur Salem Ali", "Salem Ali"],
    ["Kuwaiti artist Salem Ali", "Salem Ali"],
    ["سالم العتيبي الكويتي", "سالم العتيبي"],
  ])("still accepts «%s»", (ev, name) => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: ev, displayName: name }).ok).toBe(true)
  })
})

describe("gender markers: no digits / episode words, and the evidence must agree with the signal", () => {
  const salem = "سالم ناصر"
  it.each(["الحلقة 12 سالم ناصر", "الموسم 3 مع سالم ناصر", "العدد 5 سالم ناصر", "Ep 7 سالم ناصر"])("«%s» is not a gender marker", (ev) => {
    expect(admissibleGenderEvidence({ signal: "male", evidence: ev, displayName: salem })).toBe(false)
  })
  it("feminine «ضيفة» with signal male → the gender claim is rejected", () => {
    expect(admissibleGenderEvidence({ signal: "male", evidence: "ضيفة الحلقة", displayName: "نور سالم", guestEvidence: "ضيفة الحلقة نور سالم" })).toBe(false)
    expect(admissibleGenderEvidence({ signal: "female", evidence: "ضيفة الحلقة", displayName: "نور سالم", guestEvidence: "ضيفة الحلقة نور سالم" })).toBe(true)
    expect(admissibleGenderEvidence({ signal: "female", evidence: "السيد", displayName: salem, guestEvidence: "السيد سالم ناصر" })).toBe(false)
  })
  it("…but the guest survives a rejected gender claim", () => {
    const ep: SourceEpisode = { id: "55555555-5555-4555-8555-555555555555", title: "ضيفة الحلقة نور سالم", description: null }
    const r = validateExtraction(
      { episodes: [{ episode_id: ep.id, content_kind: "guest_interview", guests: [{ display_name: "نور سالم", evidence_text: "ضيفة الحلقة نور سالم", gender_signal: "male", gender_evidence_text: "ضيفة الحلقة", confidence: 0.9 }] }] },
      [ep],
    )
    const g = r.results.get(ep.id)!.guests
    expect(g).toHaveLength(1)
    expect(g[0].gender_signal).toBe("unknown")
  })
})

describe("gender evidence must be an exact substring of the metadata (kills M2d)", () => {
  it("a gender text the metadata never said is dropped, even if it names the guest", () => {
    // Source says only «مع سالم ناصر»; the model invents «اللاعب سالم ناصر».
    // That text names the guest and carries a gendered word, so ONLY the
    // exact-substring check can reject it.
    const ep: SourceEpisode = { id: "66666666-6666-4666-8666-666666666666", title: "حلقة جديدة مع سالم ناصر", description: null }
    const r = validateExtraction(
      { episodes: [{ episode_id: ep.id, content_kind: "guest_interview", guests: [{ display_name: "سالم ناصر", evidence_text: "مع سالم ناصر", gender_signal: "male", gender_evidence_text: "اللاعب سالم ناصر", confidence: 0.9 }] }] },
      [ep],
    )
    const g = r.results.get(ep.id)!.guests[0]
    expect(g.gender_signal).toBe("unknown")
    expect(r.issues.some((i) => i.reason === "gender evidence is not an exact substring")).toBe(true)
  })
})
