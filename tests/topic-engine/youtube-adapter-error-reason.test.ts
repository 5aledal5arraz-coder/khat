/**
 * Topic-engine defect #13 — YouTube returned 403 on every market call on prod
 * (1,708 notes since the first collect on 2026-07-11), and the only thing
 * stored was "YouTube search 403". Google puts the actual cause in the error
 * body (`accessNotConfigured`, `quotaExceeded`, `forbidden` + an
 * API_KEY_*_BLOCKED detail…), and the adapter threw it away — so nobody could
 * tell a disabled API from a referrer restriction from an exhausted quota.
 *
 * The note now carries Google's reason codes. The key itself never appears.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/env", () => ({ env: { YOUTUBE_API_KEY: "AIza-test-key-never-logged" } }))

import { collectYoutubeTopic } from "@/lib/market-intelligence/adapters/youtube"

const realFetch = globalThis.fetch

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("YouTube market adapter — error reason is kept", () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("records Google's reason codes from a 403 body (key restriction)", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(403, {
        error: {
          code: 403,
          message: "Requests to this API youtube method youtube.api.v3.V3DataSearchService.List are blocked.",
          errors: [{ reason: "forbidden", domain: "global" }],
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "API_KEY_SERVICE_BLOCKED",
              domain: "googleapis.com",
            },
          ],
        },
      }),
    ) as unknown as typeof fetch
    const r = await collectYoutubeTopic("علاقات", "ar")
    expect(r.signals).toEqual([])
    expect(r.note).toContain("YouTube search 403")
    expect(r.note).toContain("forbidden")
    expect(r.note).toContain("API_KEY_SERVICE_BLOCKED")
    expect(r.note).not.toContain("AIza-test-key-never-logged")
  })

  it("records accessNotConfigured (API not enabled in the key's project)", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(403, {
        error: {
          code: 403,
          message: "YouTube Data API v3 has not been used in project 123 before or it is disabled.",
          errors: [{ reason: "accessNotConfigured", domain: "usageLimits" }],
        },
      }),
    ) as unknown as typeof fetch
    const r = await collectYoutubeTopic("relationships", "en")
    expect(r.note).toContain("accessNotConfigured")
  })

  it("still degrades to the bare status when the body is not JSON", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("<html>nope</html>", { status: 403 }),
    ) as unknown as typeof fetch
    const r = await collectYoutubeTopic("x", "en")
    expect(r.note).toBe("YouTube search 403")
  })

  it("keeps the reason on the videos.list call too", async () => {
    let call = 0
    globalThis.fetch = vi.fn(async () => {
      call++
      if (call === 1) return jsonResponse(200, { items: [{ id: { videoId: "v1" } }] })
      return jsonResponse(403, {
        error: { code: 403, errors: [{ reason: "quotaExceeded", domain: "youtube.quota" }] },
      })
    }) as unknown as typeof fetch
    const r = await collectYoutubeTopic("x", "en")
    expect(r.note).toBe("YouTube videos 403 (quotaExceeded)")
  })
})
