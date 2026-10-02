/**
 * yousef (2026-10-02): `resolveRedirect` followed the Gemini grounding
 * wrapper with `fetch(..., { redirect: "follow" })` — every hop after the
 * Google-owned first one went wherever the Location said, with no address
 * check: a blind SSRF into loopback / the cloud metadata service.
 *
 * Now every hop goes through the same machinery as the source-page reader
 * (lib/net/public-url.ts): shape rules on each URL (assertPublicUrl) and the
 * pinned DNS lookup at connect time. Redirect targets are built through
 * `new URL(location, current)`, so «[::ffff:127.0.0.1]» arrives as
 * «[::ffff:7f00:1]» — the spelling that has to be caught.
 */
import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ db: null }))

import { resolveRedirect } from "@/lib/ai/grounded-evidence"
import { pinnedStatusRequest, SOURCE_CHECK_UA } from "@/lib/net/public-url"

const WRAPPER = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc"

/** A fake one-hop request: wrapper → `location`, anything else → `final`. */
function hops(location: string, final = 200) {
  return vi.fn(async (u: URL) =>
    u.hostname === "vertexaisearch.cloud.google.com"
      ? { status: 302, location }
      : { status: final, location: null },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("resolveRedirect — every hop is checked", () => {
  it.each([
    "http://127.0.0.1/admin",
    "http://[::ffff:127.0.0.1]/", // new URL → [::ffff:7f00:1]
    "http://[::ffff:7f00:1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::ffff:a9fe:a9fe]/latest/meta-data/",
    "http://10.0.0.5/",
    "http://localhost/",
    "http://metadata.internal/",
    "http://example.com:8080/", // non-web port
    "file:///etc/passwd",
  ])("a redirect into %s is refused — never requested, never verified", async (target) => {
    const request = hops(target)
    const r = await resolveRedirect(WRAPPER, 4_000, { request })
    expect(r).toEqual({ finalUrl: WRAPPER, verified: false })
    expect(request).toHaveBeenCalledTimes(1) // only the Google wrapper
  })

  it("never uses fetch's redirect-following (the old path)", async () => {
    // The old code: fetch followed the chain and reported the private page as live.
    const fetchSpy = vi.fn(async () =>
      Object.assign(new Response("", { status: 200 }), { url: "http://169.254.169.254/latest/meta-data/" }),
    )
    vi.stubGlobal("fetch", fetchSpy)
    const r = await resolveRedirect(WRAPPER, 4_000, { request: hops("http://169.254.169.254/latest/meta-data/") })
    expect(r.verified).toBe(false)
    expect(r.finalUrl).not.toContain("169.254")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("sight: a public destination still resolves and verifies (relative Location too)", async () => {
    const request = vi.fn(async (u: URL, _method: string) => {
      if (u.hostname === "vertexaisearch.cloud.google.com") return { status: 302, location: "https://alqabas.com/a" }
      if (u.pathname === "/a") return { status: 301, location: "/article/1" }
      return { status: 200, location: null }
    })
    const r = await resolveRedirect(WRAPPER, 4_000, { request })
    expect(r).toEqual({ finalUrl: "https://alqabas.com/article/1", verified: true })
    expect(request).toHaveBeenCalledTimes(3)
    expect(request.mock.calls.every(([, method]) => method === "HEAD")).toBe(true)
  })

  it("HEAD 405 → retried once with GET on that hop (old behaviour kept)", async () => {
    const request = vi.fn(async (u: URL, method: string) => {
      if (u.hostname === "vertexaisearch.cloud.google.com") return { status: 302, location: "https://alqabas.com/a" }
      return method === "HEAD" ? { status: 405, location: null } : { status: 200, location: null }
    })
    const r = await resolveRedirect(WRAPPER, 4_000, { request })
    expect(r).toEqual({ finalUrl: "https://alqabas.com/a", verified: true })
    expect(request.mock.calls.map(([, m]) => m)).toEqual(["HEAD", "HEAD", "GET"])
  })

  it("a dead destination is unverified but keeps its URL; a redirect loop gives up", async () => {
    const dead = await resolveRedirect(WRAPPER, 4_000, { request: hops("https://alqabas.com/gone", 404) })
    expect(dead).toEqual({ finalUrl: "https://alqabas.com/gone", verified: false })
    const loop = vi.fn(async () => ({ status: 302, location: WRAPPER }))
    expect(await resolveRedirect(WRAPPER, 4_000, { request: loop })).toEqual({ finalUrl: WRAPPER, verified: false })
  })

  it("every hop carries a browser-like User-Agent (Wikipedia 403s without one — noura, 2026-10-02)", async () => {
    const request = vi.fn(async (u: URL, _method: string, _signal: AbortSignal, _headers?: Record<string, string>) =>
      u.hostname === "vertexaisearch.cloud.google.com"
        ? { status: 302, location: "https://ar.wikipedia.org/wiki/x" }
        : { status: 200, location: null },
    )
    await resolveRedirect(WRAPPER, 4_000, { request })
    expect(request).toHaveBeenCalledTimes(2)
    for (const [, , , headers] of request.mock.calls) {
      expect(headers?.["User-Agent"]).toBe(SOURCE_CHECK_UA)
      expect(SOURCE_CHECK_UA).toMatch(/^Mozilla\/5\.0/)
    }
  })

  it("direct (non-wrapper) URLs are still parsed, not fetched", async () => {
    const request = vi.fn()
    expect(await resolveRedirect("https://alqabas.com/x", 4_000, { request })).toEqual({
      finalUrl: "https://alqabas.com/x",
      verified: true,
    })
    expect(request).not.toHaveBeenCalled()
  })
})

describe("pinnedStatusRequest — the address is checked at CONNECT time", () => {
  it("a name resolving to loopback is refused; the server never sees a request", async () => {
    let hits = 0
    const server = http.createServer((_req, res) => {
      hits++
      res.end("ok")
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    const { port } = server.address() as AddressInfo
    try {
      await expect(
        pinnedStatusRequest(new URL(`http://localhost:${port}/`), "HEAD", AbortSignal.timeout(3_000)),
      ).rejects.toThrow(/private address/)
      expect(hits).toBe(0)
    } finally {
      server.close()
    }
  })
})
