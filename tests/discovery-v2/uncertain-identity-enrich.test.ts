/**
 * An UNCERTAIN Wikidata match is a possible namesake — nothing of it may
 * steer the run (yousef 🟡1, 2026-09-28):
 *   - enrich() gets the proposal, not the stranger's labels/handles, so no
 *     X / Instagram / YouTube lookup of the namesake's accounts;
 *   - its QID neither excludes (cross-run memory) nor dedupes the person.
 * A CONFIDENT match still does all three (sight).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { WikiFacts } from "@/lib/discovery-v2/types"

const h = vi.hoisted(() => ({
  enrichArgs: [] as Array<{ name: string; wiki: WikiFacts }>,
  xArgs: [] as WikiFacts[],
  igArgs: [] as WikiFacts[],
}))

vi.mock("@/lib/ai-router", () => ({
  runAiTask: vi.fn(async (req: { taskKind: string }) =>
    req.taskKind === "discovery"
      ? {
          status: "succeeded",
          runId: "p",
          parsed: {
            people: [
              { name: "شخص غير مؤكد تجريبي", country: "الكويت", story_type: "expert" },
              { name: "شخص مؤكد مستبعد تجريبي", country: "الكويت", story_type: "expert" },
              { name: "شخص مؤكد تجريبي", country: "الكويت", story_type: "expert" },
            ],
          },
        }
      : { status: "succeeded", runId: "c", parsed: { story_type: "none", evidence: [] } },
  ),
}))
vi.mock("@/lib/ai/grounded-evidence", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/ai/grounded-evidence")>()),
  isGroundedEvidenceConfigured: () => false,
}))
vi.mock("@/lib/discovery-v2/sources/wikidata", () => ({
  resolvePerson: vi.fn(async (name: string): Promise<WikiFacts> => {
    if (name === "شخص غير مؤكد تجريبي")
      return { resolved: true, identity_uncertain: true, qid: "Q-stranger", label_ar: "غريب بنفس الاسم", social: { x: "https://x.com/stranger" } }
    if (name === "شخص مؤكد مستبعد تجريبي") return { resolved: true, identity_uncertain: false, qid: "Q-known", label_ar: name }
    return { resolved: true, identity_uncertain: false, qid: "Q-ok", label_ar: name, social: { x: "https://x.com/ok" } }
  }),
}))
vi.mock("@/lib/discovery-v2/memory", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/discovery-v2/memory")>()),
  loadDiscoveryMemory: vi.fn(async () => ({
    excludeNames: [],
    // Both QIDs are "already acted on" — only the CONFIDENT one may exclude.
    excludeQids: new Set(["Q-stranger", "Q-known"]),
    excludeNameKeys: new Set<string>(),
    recentlySurfacedNames: [],
  })),
}))
vi.mock("@/lib/discovery-v2/sources/enrich-sources", () => ({
  openAlex: vi.fn(async () => null),
  googleBooks: vi.fn(async () => null),
  gdeltNews: vi.fn(async () => null),
  youtubePerson: vi.fn(async () => null),
  podcastAppearances: vi.fn(async () => null),
}))
vi.mock("@/lib/discovery-v2/sources/x", () => ({
  xPresence: vi.fn(async (w: WikiFacts) => {
    h.xArgs.push(w)
    return null
  }),
}))
vi.mock("@/lib/discovery-v2/sources/instagram", () => ({
  instagramPresence: vi.fn(async (w: WikiFacts) => {
    h.igArgs.push(w)
    return null
  }),
}))

import { runV2Discovery } from "@/lib/discovery-v2/pipeline"
import { enrich } from "@/lib/discovery-v2/enrich"

beforeEach(() => {
  h.enrichArgs = []
  h.xArgs = []
  h.igArgs = []
})

describe("uncertain Wikidata identity", () => {
  it("enrich() never looks up an uncertain entry's handles", async () => {
    await enrich("شخص", { resolved: true, identity_uncertain: true, social: { x: "https://x.com/stranger" }, label_ar: "غريب" })
    expect(h.xArgs[0]).toEqual({ resolved: false })
    expect(h.igArgs[0]).toEqual({ resolved: false })
    // sight: a confident entry IS passed through
    await enrich("شخص", { resolved: true, identity_uncertain: false, social: { x: "https://x.com/ok" } })
    expect(h.xArgs[1].social?.x).toBe("https://x.com/ok")
  })

  it("the run: the uncertain QID excludes no one and enriches as the proposal; a confident known QID is excluded", async () => {
    const r = await runV2Discovery({ topic: "المال", runId: "run-1" })
    const names = r.candidates.map((c) => c.name)
    expect(names).toContain("شخص غير مؤكد تجريبي") // not excluded by the stranger's QID
    expect(names).not.toContain("شخص مؤكد مستبعد تجريبي") // sight: a CONFIDENT known QID still excludes
    expect(names).toContain("شخص مؤكد تجريبي")
    // The uncertain person was enriched as himself: no stranger handle reached X.
    expect(h.xArgs.some((w) => w.social?.x === "https://x.com/stranger")).toBe(false)
    expect(h.xArgs.some((w) => w.social?.x === "https://x.com/ok")).toBe(true)
  })
})
