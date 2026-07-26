/**
 * discovery-v2 grounded verification — contract tests.
 *
 * Covers the cost-control + fail-safe surface without the network: the opt-in
 * flag, the advanced-only count cap, the deterministic presence/recency
 * signal, and that a grounding failure never breaks discovery. The shared
 * grounded-evidence service is mocked; its own hardening lives in
 * tests/ai/grounded-evidence.test.ts.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import type { GroundedEvidence, GroundedSource } from "@/lib/ai/grounded-evidence"
import { RetrievalSearchNotRunError } from "@/lib/ai/retrieval-guard"
import type { V2Candidate } from "@/lib/discovery-v2/types"

const gather = vi.fn<(q: string, o?: unknown) => Promise<GroundedEvidence>>()
const configured = vi.fn<() => boolean>()

vi.mock("@/lib/ai/grounded-evidence", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ai/grounded-evidence")>()
  return {
    ...actual, // keep the real isVertexRedirect
    isGroundedEvidenceConfigured: () => configured(),
    gatherGroundedEvidence: (q: string, o?: unknown) => gather(q, o),
  }
})

import {
  attachGroundedVerification,
  deriveGroundedSignal,
  discoveryGroundingMaxCandidates,
  isDiscoveryGroundingEnabled,
  verifyCandidateGrounded,
} from "@/lib/discovery-v2/grounded-verify"

const source = (over: Partial<GroundedSource> = {}): GroundedSource => ({
  title: "مقابلة حديثة",
  url: "https://aljazeera.net/x",
  domain: "aljazeera.net",
  snippet: "ظهور في برنامج حواري عام 2026 حول الموضوع.",
  publisher: "aljazeera.net",
  verified: true,
  ...over,
})

const evidence = (sources: GroundedSource[]): GroundedEvidence => ({
  sources,
  provenance: { provider: "gemini", model: "gemini-2.5-flash" },
  queryCount: 2,
  estimatedCostUsd: 0.07,
})

const candidate = (over: Partial<V2Candidate> = {}): V2Candidate => ({
  name: "سلمى العتيبي",
  name_en: "Salma Alotaibi",
  role: "باحثة",
  country: "الكويت",
  why: null,
  wiki: { resolved: true, qid: "Q1" },
  signals: {},
  scores: { notability: 0.7, topic_fit: 0.7, guestability: 0.6, recency: 0.6, filter_match: 1, overall: 0.66 },
  decision: "accepted",
  reasons: [],
  ...over,
})

const input = { topic: "الصحة النفسية", runId: "run-1" }

const ORIGINAL_ENV = { ...process.env }
beforeEach(() => {
  gather.mockReset()
  configured.mockReset()
  configured.mockReturnValue(true)
  process.env.DISCOVERY_WEB_GROUNDED_ENABLED = "true"
  delete process.env.DISCOVERY_GROUNDING_MAX_CANDIDATES
})
afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("config levers", () => {
  it("is opt-in — off unless the flag is exactly 'true'", () => {
    process.env.DISCOVERY_WEB_GROUNDED_ENABLED = "false"
    expect(isDiscoveryGroundingEnabled()).toBe(false)
    delete process.env.DISCOVERY_WEB_GROUNDED_ENABLED
    expect(isDiscoveryGroundingEnabled()).toBe(false)
    process.env.DISCOVERY_WEB_GROUNDED_ENABLED = "true"
    expect(isDiscoveryGroundingEnabled()).toBe(true)
  })

  it("defaults the candidate cap to 6 and clamps bad input", () => {
    expect(discoveryGroundingMaxCandidates()).toBe(6)
    process.env.DISCOVERY_GROUNDING_MAX_CANDIDATES = "3"
    expect(discoveryGroundingMaxCandidates()).toBe(3)
    process.env.DISCOVERY_GROUNDING_MAX_CANDIDATES = "999"
    expect(discoveryGroundingMaxCandidates()).toBe(20)
    process.env.DISCOVERY_GROUNDING_MAX_CANDIDATES = "-5"
    expect(discoveryGroundingMaxCandidates()).toBe(6)
  })
})

describe("deriveGroundedSignal", () => {
  const now = new Date("2026-07-25T00:00:00Z")
  it("confirms presence with ≥2 verified sources", () => {
    const s = deriveGroundedSignal(
      [
        { title: "a", url: "u1", domain: "d1", verified: true },
        { title: "b", url: "u2", domain: "d2", verified: true },
      ],
      ["ظهور 2026", "حديث"],
      now,
    )
    expect(s.presence).toBe("confirmed")
    expect(s.verified_count).toBe(2)
    expect(s.recent_activity).toBe(true)
  })

  it("marks weak presence with a single source and no recent year", () => {
    const s = deriveGroundedSignal(
      [{ title: "a", url: "u1", domain: "d1", verified: false }],
      ["نشاط قديم 2019"],
      now,
    )
    expect(s.presence).toBe("weak")
    expect(s.verified_count).toBe(0)
    expect(s.recent_activity).toBe(false)
  })

  it("reports no presence for zero sources", () => {
    const s = deriveGroundedSignal([], [], now)
    expect(s.presence).toBe("none")
    expect(s.source_count).toBe(0)
  })

  it("counts last year as recent activity", () => {
    const s = deriveGroundedSignal(
      [{ title: "a", url: "u1", domain: "d1", verified: true }],
      ["حدث في 2025"],
      now,
    )
    expect(s.recent_activity).toBe(true)
  })
})

describe("verifyCandidateGrounded", () => {
  it("builds a stamp from usable sources and skips vertex-redirect wrappers", async () => {
    gather.mockResolvedValue(
      evidence([
        source(),
        source({
          url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/z",
          domain: null,
        }),
      ]),
    )
    const g = await verifyCandidateGrounded(candidate(), input)
    expect(g).not.toBeNull()
    expect(g!.sources).toHaveLength(1) // the vertex wrapper was dropped
    expect(g!.provider).toBe("gemini")
    expect(g!.model).toBe("gemini-2.5-flash")
    expect(g!.checked_at).toMatch(/^\d{4}-/)
  })

  it("returns null (never throws) when grounding errors — fail-safe", async () => {
    gather.mockRejectedValue(new Error("retrieval daily cap reached\ndetail"))
    const g = await verifyCandidateGrounded(candidate(), input)
    expect(g).toBeNull()
  })

  // The reason the shared service now THROWS instead of returning an empty
  // list when the search tool never fired. Both cases arrive here as "zero
  // sources", but only one of them is a fact about the candidate.
  it("records «لا حضور» only for a search that actually happened", async () => {
    gather.mockResolvedValue(evidence([]))
    const g = await verifyCandidateGrounded(candidate(), input)
    expect(g).not.toBeNull()
    expect(g!.presence).toBe("none") // a real finding: we looked, nothing there
    expect(g!.source_count).toBe(0)
  })

  it("skips the stamp entirely when the search never ran (no false «لا حضور»)", async () => {
    gather.mockRejectedValue(
      new RetrievalSearchNotRunError("gemini-3.6-flash", 2),
    )
    const g = await verifyCandidateGrounded(candidate(), input)
    // null = "not checked". Anything else would put a verdict on the
    // candidate that no search supports.
    expect(g).toBeNull()
  })

  it("attributes the run to discovery_runs", async () => {
    gather.mockResolvedValue(evidence([source()]))
    await verifyCandidateGrounded(candidate(), input)
    const [, opts] = gather.mock.calls[0]
    expect(opts).toMatchObject({ subjectTable: "discovery_runs", subjectId: "run-1" })
  })
})

describe("attachGroundedVerification — cost control", () => {
  const list = (): V2Candidate[] => [
    candidate({ name: "أ", decision: "accepted" }),
    candidate({ name: "ب", decision: "accepted" }),
    candidate({ name: "ج", decision: "shortlist" }),
    candidate({ name: "د", decision: "rejected" }),
  ]

  it("no-ops (zero grounding calls) when the flag is off", async () => {
    process.env.DISCOVERY_WEB_GROUNDED_ENABLED = "false"
    const out = await attachGroundedVerification(list(), input)
    expect(gather).not.toHaveBeenCalled()
    expect(out.every((c) => c.grounded == null)).toBe(true)
  })

  it("no-ops when Gemini is unconfigured", async () => {
    configured.mockReturnValue(false)
    await attachGroundedVerification(list(), input)
    expect(gather).not.toHaveBeenCalled()
  })

  it("grounds only advanced candidates, never rejected ones", async () => {
    gather.mockResolvedValue(evidence([source()]))
    const out = await attachGroundedVerification(list(), input)
    // 3 advanced (accepted/accepted/shortlist), rejected skipped.
    expect(gather).toHaveBeenCalledTimes(3)
    expect(out.find((c) => c.decision === "rejected")!.grounded).toBeUndefined()
    expect(out.filter((c) => c.grounded != null)).toHaveLength(3)
  })

  it("caps the number of grounded candidates", async () => {
    process.env.DISCOVERY_GROUNDING_MAX_CANDIDATES = "1"
    gather.mockResolvedValue(evidence([source()]))
    const out = await attachGroundedVerification(list(), input)
    expect(gather).toHaveBeenCalledTimes(1)
    expect(out.filter((c) => c.grounded != null)).toHaveLength(1)
  })

  it("cap of 0 disables grounding even with the flag on", async () => {
    process.env.DISCOVERY_GROUNDING_MAX_CANDIDATES = "0"
    const out = await attachGroundedVerification(list(), input)
    expect(gather).not.toHaveBeenCalled()
    expect(out.every((c) => c.grounded == null)).toBe(true)
  })

  it("attaches null (not a throw) when a single grounding fails mid-run", async () => {
    gather.mockRejectedValue(new Error("boom"))
    const out = await attachGroundedVerification(list(), input)
    const advanced = out.filter((c) => c.decision !== "rejected")
    expect(advanced.every((c) => c.grounded === null)).toBe(true)
  })
})
