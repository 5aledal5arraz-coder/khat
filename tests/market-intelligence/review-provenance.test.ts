/**
 * extractSignalProvenance — review-queries provenance extraction contract.
 *
 * Network-free + DB-free: proves the review layer lifts display-safe web
 * provenance out of the `raw` jsonb only for `web_grounded` signals, and
 * never leaks the untrusted snippet/query blob.
 */

import { describe, expect, it } from "vitest"
import { extractSignalProvenance } from "@/lib/market-intelligence/review-queries"

const webRaw = (over: Record<string, unknown> = {}) => ({
  untrusted: true,
  url: "https://aljazeera.net/article/1",
  domain: "aljazeera.net",
  publisher: "aljazeera.net",
  snippet: "**تحليل** حديث لاهتمام الجمهور.",
  verified: true,
  provenance: { provider: "gemini", model: "gemini-2.5-flash" },
  query: "العلاقات",
  ...over,
})

describe("extractSignalProvenance", () => {
  it("returns null for non-web_grounded sources", () => {
    expect(extractSignalProvenance("youtube", webRaw())).toBeNull()
    expect(extractSignalProvenance("podcast_apple", webRaw())).toBeNull()
  })

  it("extracts url/domain/provider/model for a web_grounded signal", () => {
    const p = extractSignalProvenance("web_grounded", webRaw())
    expect(p).toEqual({
      url: "https://aljazeera.net/article/1",
      domain: "aljazeera.net",
      verified: true,
      provider: "gemini",
      model: "gemini-2.5-flash",
    })
  })

  it("does not surface the untrusted snippet or query", () => {
    const p = extractSignalProvenance("web_grounded", webRaw())
    expect(JSON.stringify(p)).not.toContain("snippet")
    expect(JSON.stringify(p)).not.toContain("العلاقات")
  })

  it("marks a dead link unverified (verified === false)", () => {
    const p = extractSignalProvenance("web_grounded", webRaw({ verified: false }))
    expect(p?.verified).toBe(false)
  })

  it("defaults verified to true when the flag is absent", () => {
    const raw = webRaw()
    delete (raw as Record<string, unknown>).verified
    expect(extractSignalProvenance("web_grounded", raw)?.verified).toBe(true)
  })

  it("tolerates a missing/partial provenance object", () => {
    const raw = webRaw()
    delete (raw as Record<string, unknown>).provenance
    const p = extractSignalProvenance("web_grounded", raw)
    expect(p?.provider).toBeNull()
    expect(p?.model).toBeNull()
    expect(p?.url).toBe("https://aljazeera.net/article/1")
  })

  it("returns null when raw carries no usable url", () => {
    expect(extractSignalProvenance("web_grounded", webRaw({ url: null }))).toBeNull()
    expect(extractSignalProvenance("web_grounded", null)).toBeNull()
    expect(extractSignalProvenance("web_grounded", "not-an-object")).toBeNull()
  })

  it("keeps a null domain when the URL didn't resolve to one", () => {
    const p = extractSignalProvenance("web_grounded", webRaw({ domain: null }))
    expect(p?.domain).toBeNull()
    expect(p?.url).toBe("https://aljazeera.net/article/1")
  })
})
