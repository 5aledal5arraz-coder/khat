/**
 * Noura's re-score fixes (2026-10-03):
 *   1. re-extraction REPLACES — non-reproduced appearances are superseded
 *      (status + audit, never deleted) and stop counting;
 *   2. hosts are program-scoped — a program's host stays a guest elsewhere;
 *   4. the Kuwaiti-adjective rule: soft separators after the name, no
 *      institutions, no questions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const rec = vi.hoisted(() => ({
  stale: [] as Array<{ id: string; person_id: string; display_name: string; status: string }>,
  updates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
}))
vi.mock("@/lib/db", () => ({ db: null }))

import { supersedeUnreproduced } from "@/lib/podcast-universe/people"
import { derivePersonEvidence } from "@/lib/podcast-universe/evidence"
import { admissibleNationalityClaim, kuwaitiAdjectiveInGuestClause } from "@/lib/podcast-universe/evidence"
import { hostsForEpisode, isHostOf, programOf } from "@/lib/podcast-universe/hosts"
import { validateExtraction, type SourceEpisode } from "@/lib/podcast-universe/extraction/validate"

const ROOT = path.resolve(__dirname, "../..")

/** A recording executor shaped like the drizzle calls supersedeUnreproduced makes. */
const ex = {
  select: () => ({ from: () => ({ where: async () => rec.stale }) }),
  update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => void rec.updates.push(v) }) }),
  insert: () => ({ values: async (v: Record<string, unknown>) => void rec.inserts.push(v) }),
}

describe("1. re-extraction replaces (supersede, audited, never deleted)", () => {
  beforeEach(() => {
    rec.stale = [{ id: "a-old", person_id: "p-old", display_name: "عمران حبيب حيات", status: "extracted" }]
    rec.updates.length = 0
    rec.inserts.length = 0
  })
  it("marks every non-reproduced appearance superseded with one audit row each", async () => {
    const gone = await supersedeUnreproduced(ex as never, "ep-1", ["a-new"], "system:test", "re-extraction")
    expect(gone).toEqual([{ id: "a-old", person_id: "p-old" }])
    expect(rec.updates).toEqual([expect.objectContaining({ verification_status: "superseded" })])
    expect(rec.inserts).toEqual([expect.objectContaining({ person_id: "p-old", action: "appearance_superseded", actor_id: "system:test" })])
  })
  it("a superseded appearance no longer counts for the person's evidence", () => {
    const s = derivePersonEvidence(
      { nationality_code: null, nationality_status: "unknown", nationality_basis: "none", gender_marker: "unknown", gender_status: "unknown", gender_basis: "none" },
      [{ nationality_claim_code: "KW", gender_signal: "male", verification_status: "superseded" }],
      null,
    )
    expect(s.nationality_status).toBe("unknown")
  })
  it("every registry/queue/context query treats superseded as inactive", () => {
    for (const f of ["lib/podcast-universe/queries.ts", "lib/podcast-universe/kuwait-context.ts"]) {
      const src = readFileSync(path.join(ROOT, f), "utf8")
      expect(src, f).not.toMatch(/verification_status <> 'rejected'/)
      expect(src, f).toContain("NOT IN ('rejected', 'superseded')")
    }
    const q = readFileSync(path.join(ROOT, "lib/podcast-universe/queries.ts"), "utf8")
    // orphans (no active appearance) drop out of the registry
    expect(q).toMatch(/EXISTS \(SELECT 1 FROM podcast_guest_appearances oa WHERE oa\.person_id = p\.id AND oa\.verification_status NOT IN \('rejected', 'superseded'\)\)/)
  })
  it("the extraction run supersedes only on a real result, never on a failed one", () => {
    const src = readFileSync(path.join(ROOT, "lib/podcast-universe/extraction/run.ts"), "utf8")
    expect(src).toMatch(/if \(finalStatus !== "failed"\) \{\s*const gone = await supersedeUnreproduced/)
  })
})

describe("2. hosts are program-scoped", () => {
  const programs = [{ program: "بودكاست جادي", hosts: ["محمد آل جابر", "هادي فقيهي"] }]
  it("a program host is excluded on THAT program only", () => {
    expect(hostsForEpisode([], programs, "نهاية العولمة | بودكاست جادي")).toEqual(["محمد آل جابر", "هادي فقيهي"])
    expect(hostsForEpisode([], programs, "متى تتزوج؟ بدأنا ننقرض | بودكاست فنجان")).toEqual([])
  })
  it("so the same person stays a real guest on another program of the channel", () => {
    const fnjan: SourceEpisode = {
      id: "88888888-8888-4888-8888-888888888888",
      title: "متى تتزوج؟ بدأنا ننقرض | بودكاست فنجان",
      description: "ضيف الحلقة محمد آل جابر",
      hostNames: hostsForEpisode([], programs, "متى تتزوج؟ بدأنا ننقرض | بودكاست فنجان"),
    }
    const r = validateExtraction(
      { episodes: [{ episode_id: fnjan.id, content_kind: "guest_interview", guests: [{ display_name: "محمد آل جابر", evidence_text: "ضيف الحلقة محمد آل جابر", confidence: 0.9 }] }] },
      [fnjan],
    )
    expect(r.results.get(fnjan.id)!.guests).toHaveLength(1)
  })
  it("channel-wide hosts still apply everywhere; honorifics don't hide a host", () => {
    expect(hostsForEpisode(["فيصل العقل"], [], "أي حلقة")).toEqual(["فيصل العقل"])
    expect(isHostOf("الدكتور محمد الحاجي", ["محمد الحاجي"])).toBe(true)
    expect(programOf("كيف نتغلب على الشك | بودكاست آدم")).toBe("بودكاست آدم")
    expect(programOf("عنوان بلا برنامج")).toBeNull()
  })
})

describe("4. Kuwaiti adjective: soft separators after the name, no institutions, no questions", () => {
  it.each([
    ["فارس عاشور، ممثل ويوتيوبر كويتي.", "فارس عاشور"],
    ["نجم بودستور، تاجر و رجل أعمال كويتي.", "نجم بودستور"],
    ["خالد المظفر\nفنان كويتي", "خالد المظفر"],
    ["رائد الأعمال الكويتي د. نجم عبدالكريم", "نجم عبدالكريم"],
  ])("accepts «%s»", (ev, name) => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: ev, displayName: name }).ok).toBe(true)
  })
  it.each([
    ["سالم ناصر من بيت التمويل الكويتي", "سالم ناصر"],
    ["الجمعية الاقتصادية الكويتية سالم ناصر", "سالم ناصر"],
    ["سالم ناصر، عضو الجمعية الاقتصادية الكويتية", "سالم ناصر"],
    ["سالم ناصر، مدير بنك كويتي", "سالم ناصر"],
    ["هل سالم ناصر كويتي", "سالم ناصر"],
    ["سالم ناصر كويتي؟", "سالم ناصر"],
    ["كويتي،\nسالم ناصر", "سالم ناصر"],
  ])("rejects «%s»", (ev, name) => {
    expect(kuwaitiAdjectiveInGuestClause(ev, name)).toBe(false)
  })
})

describe("M1 close: question / institution / nickname guards on EVERY acceptance path", () => {
  it.each([
    ["هل عبدالله فيروز كويتي أم مصري؟", "عبدالله فيروز"],
    ["مازن الناهض الرئيس التنفيذي السابق لبيت التمويل الكويتي", "مازن الناهض"],
    ["أحمد الديين\nامين عام الحركة التقدمية الكويتية", "أحمد الديين"],
    ["المركز المالي الكويتي جو حطاب", "جو حطاب"],
    ["بوعبدالله المشهور بـ الهاوي الكويتي", "بوعبدالله"],
    ["لاعب المنتخب الكويتي سالم ناصر", "سالم ناصر"],
    ["سالم ناصر مدير لبنك كويتي", "سالم ناصر"],
    ["سالم ناصر لاعب سابق لنادي كويتي", "سالم ناصر"],
  ])("rejects «%s»", (ev, name) => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: ev, displayName: name }).ok).toBe(false)
  })
  it("a nickname that ENDS before the demonym does not block it (stored claim, must stay valid)", () => {
    expect(
      admissibleNationalityClaim({ code: "KW", evidence: "صالح عبدالله مدوه، المعروف بـ ساهر، هو شاعر كويتي", displayName: "صالح عبدالله مدوه" }).ok,
    ).toBe(true)
  })
})

describe("M1 close: an episode whose only appearances are inactive becomes no_guest (host_only)", () => {
  it("updates the episode status with the note and writes one audit row per person", async () => {
    const { settleGuestlessEpisodes } = await import("@/lib/podcast-universe/people")
    const executed: string[] = []
    const inserts: Array<Record<string, unknown>> = []
    const fake = {
      execute: async (q: { queryChunks?: unknown[] }) => {
        const text = JSON.stringify(q)
        executed.push(text)
        if (text.includes("bool_and")) return { rows: [{ episode_id: "ep-1", all_hosts: true, people: ["p-host"] }] }
        return { rows: [] }
      },
      insert: () => ({ values: async (v: Record<string, unknown>) => void inserts.push(v) }),
    }
    const out = await settleGuestlessEpisodes(fake as never, { episodeIds: ["ep-1"], apply: true, actor: "system:test" })
    expect(out).toEqual([{ episode_id: "ep-1", note: "host_only" }])
    expect(executed.some((t) => t.includes("guest_extraction_status = 'no_guest'"))).toBe(true)
    expect(inserts).toEqual([expect.objectContaining({ person_id: "p-host", action: "episode_marked_no_guest", after_state: { guest_extraction_status: "no_guest", note: "host_only" } })])
  })
  it("hosts-apply settles the episodes it touched", () => {
    const src = readFileSync(path.join(ROOT, "lib/podcast-universe/hosts-admin.ts"), "utf8")
    expect(src).toMatch(/await settleGuestlessEpisodes\(tx, \{ episodeIds, apply: true/)
  })
})

describe("pre-prod: negation and the «د.» glue", () => {
  it.each([
    ["سالم العتيبي ليس كويتي", "سالم العتيبي"],
    ["سالم العتيبي غير كويتي", "سالم العتيبي"],
    ["سالم العتيبي سعودي وليس كويتي", "سالم العتيبي"],
    ["سالم العتيبي مو كويتي", "سالم العتيبي"],
    ["الكويتي؟ لا، سالم العتيبي لا كويتي", "سالم العتيبي"],
    ["Salem Otaibi, non-Kuwaiti entrepreneur", "Salem Otaibi"],
    ["Salem Otaibi is not Kuwaiti", "Salem Otaibi"],
  ])("rejects the negated «%s»", (ev, name) => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: ev, displayName: name }).ok).toBe(false)
  })
  it("negation is also checked on the ADJACENCY path (English order, other countries)", () => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: "a non-Kuwaiti Salem Otaibi", displayName: "Salem Otaibi" }).ok).toBe(false)
    expect(admissibleNationalityClaim({ code: "SA", evidence: "غير السعودي سالم العتيبي", displayName: "سالم العتيبي" }).ok).toBe(false)
    // control: the same shapes without the negator are accepted
    expect(admissibleNationalityClaim({ code: "KW", evidence: "Kuwaiti Salem Otaibi", displayName: "Salem Otaibi" }).ok).toBe(true)
    expect(admissibleNationalityClaim({ code: "SA", evidence: "السعودي سالم العتيبي", displayName: "سالم العتيبي" }).ok).toBe(true)
  })
  it("«د.فهد الدوسري، طبيب كويتي» passes for «فهد الدوسري» (the dot is not glued onto the name)", () => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: "د.فهد الدوسري، طبيب كويتي", displayName: "فهد الدوسري" }).ok).toBe(true)
    expect(kuwaitiAdjectiveInGuestClause("د.فهد الدوسري، طبيب كويتي", "فهد الدوسري")).toBe(true)
  })
  it("negation does not leak across to an unnegated claim", () => {
    expect(admissibleNationalityClaim({ code: "KW", evidence: "سالم العتيبي رائد أعمال كويتي لا يعرف المستحيل", displayName: "سالم العتيبي" }).ok).toBe(true)
  })
})
