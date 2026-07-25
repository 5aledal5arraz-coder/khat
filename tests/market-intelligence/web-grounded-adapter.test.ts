/**
 * web_grounded adapter — normalisation contract tests.
 *
 * Covers the network-free surface: how grounded sources map onto the
 * shared `MarketRawSignal` shape, and the skip rules that keep stored
 * signals stable + dedup-able. The shared grounded-evidence service is
 * mocked; its own hardening (cost/budget/redirect resolution) is tested in
 * tests/ai/grounded-evidence.test.ts.
 */

import { describe, expect, it, vi, beforeEach } from "vitest"
import type { GroundedEvidence, GroundedSource } from "@/lib/ai/grounded-evidence"

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

import { collectWebGroundedTopic } from "@/lib/market-intelligence/adapters/web-grounded"

const source = (over: Partial<GroundedSource> = {}): GroundedSource => ({
  title: "نقاش حول العلاقات الحديثة",
  url: "https://aljazeera.net/article/1",
  domain: "aljazeera.net",
  snippet: "تحليل حديث لاهتمام الجمهور بالعلاقات.",
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

beforeEach(() => {
  gather.mockReset()
  configured.mockReset()
  configured.mockReturnValue(true)
})

describe("collectWebGroundedTopic", () => {
  it("returns configured:false without calling Gemini when unconfigured", async () => {
    configured.mockReturnValue(false)
    const r = await collectWebGroundedTopic("العلاقات", "ar")
    expect(r.configured).toBe(false)
    expect(r.signals).toHaveLength(0)
    expect(gather).not.toHaveBeenCalled()
  })

  it("maps a grounded source onto a web_grounded signal", async () => {
    gather.mockResolvedValue(evidence([source()]))
    const r = await collectWebGroundedTopic("العلاقات", "ar")
    expect(r.configured).toBe(true)
    expect(r.signals).toHaveLength(1)
    const sig = r.signals[0]
    expect(sig.source).toBe("web_grounded")
    expect(sig.language).toBe("ar")
    expect(sig.view_signal).toBeNull()
    expect(sig.title).toBe("نقاش حول العلاقات الحديثة")
    expect(sig.description).toBe("تحليل حديث لاهتمام الجمهور بالعلاقات.")
    expect(sig.raw.untrusted).toBe(true)
    expect(sig.raw.provenance).toEqual({ provider: "gemini", model: "gemini-2.5-flash" })
  })

  it("strips markdown from the stored title/description (display invariant)", async () => {
    gather.mockResolvedValue(
      evidence([
        source({
          title: "* **الاتجاه والنقاش:**",
          snippet: "* **الاتجاه والنقاش:** تحليل حديث لاهتمام الجمهور بالعلاقات.",
        }),
      ]),
    )
    const r = await collectWebGroundedTopic("العلاقات", "ar")
    const sig = r.signals[0]
    expect(sig.title).toBe("الاتجاه والنقاش:")
    expect(sig.description).toBe("الاتجاه والنقاش: تحليل حديث لاهتمام الجمهور بالعلاقات.")
    // The raw jsonb keeps the untouched snippet for audit.
    expect(sig.raw.snippet).toContain("**")
  })

  it("drops description when it merely echoes the title (short snippet)", async () => {
    // s.title == s.snippet: the grounded title IS the snippet's first 120 chars.
    gather.mockResolvedValue(
      evidence([source({ title: "**نقاش قصير**", snippet: "**نقاش قصير**" })]),
    )
    const r = await collectWebGroundedTopic("العلاقات", "ar")
    expect(r.signals[0].title).toBe("نقاش قصير")
    expect(r.signals[0].description).toBeNull()
  })

  it("strips query/hash so the same article dedups across runs", async () => {
    gather.mockResolvedValue(
      evidence([source({ url: "https://aljazeera.net/a?utm=x#top" })]),
    )
    const r = await collectWebGroundedTopic("العلاقات", "ar")
    expect(r.signals[0].external_id).toBe("https://aljazeera.net/a")
  })

  it("skips unresolved vertex-redirect wrappers (rotating tokens)", async () => {
    gather.mockResolvedValue(
      evidence([
        source({
          url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
          domain: null,
        }),
      ]),
    )
    const r = await collectWebGroundedTopic("العلاقات", "ar")
    expect(r.signals).toHaveLength(0)
  })

  it("skips sources with no domain and no substance", async () => {
    gather.mockResolvedValue(
      evidence([source({ domain: null, snippet: "", publisher: undefined })]),
    )
    const r = await collectWebGroundedTopic("العلاقات", "ar")
    expect(r.signals).toHaveLength(0)
  })

  it("degrades to no signals (never throws) when grounding errors", async () => {
    gather.mockRejectedValue(new Error("retrieval daily cap reached\nmore detail"))
    const r = await collectWebGroundedTopic("العلاقات", "ar")
    expect(r.configured).toBe(true)
    expect(r.signals).toHaveLength(0)
    expect(r.note).toBe("retrieval daily cap reached")
  })

  it("passes market_topic_signals attribution to the shared service", async () => {
    gather.mockResolvedValue(evidence([source()]))
    await collectWebGroundedTopic("العلاقات", "ar", 5)
    expect(gather).toHaveBeenCalledTimes(1)
    const [, opts] = gather.mock.calls[0]
    expect(opts).toMatchObject({
      maxResults: 5,
      subjectTable: "market_topic_signals",
    })
  })
})
