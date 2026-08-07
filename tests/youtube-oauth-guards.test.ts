/**
 * The two pure guards in the YouTube OAuth flow. Both exist because their
 * failure mode is SILENT SUCCESS, which is this codebase's recurring defect:
 *
 *  - `channelMatchesConfigured` — the wrong Google account grants access,
 *    every step succeeds, and /partner publishes a stranger's demographics to
 *    sponsors as if they were خط's. There is no error to catch.
 *  - `resolveRedirectUri` — `Host` is attacker-controlled, and an OAuth
 *    redirect is the last thing that should follow it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"

import {
  channelMatchesConfigured,
  resolveRedirectUri,
  signState,
  verifyState,
} from "@/lib/youtube/oauth"

const saved: Record<string, string | undefined> = {}
const KEYS = [
  "YOUTUBE_CHANNEL_ID",
  "YOUTUBE_CHANNEL_HANDLE",
  "YOUTUBE_OAUTH_REDIRECT_URI",
  "YOUTUBE_OAUTH_ENC_KEY",
]

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]!
  }
})

describe("channelMatchesConfigured", () => {
  it("accepts the configured handle regardless of case or @", () => {
    process.env.YOUTUBE_CHANNEL_HANDLE = "@KhatPodcast"
    // YouTube returns customUrl lower-cased, which is why this is normalised.
    expect(channelMatchesConfigured({ id: "UC123", handle: "@khatpodcast" }).ok).toBe(true)
    expect(channelMatchesConfigured({ id: "UC123", handle: "khatpodcast" }).ok).toBe(true)
  })

  it("REFUSES a different channel, and names it", () => {
    process.env.YOUTUBE_CHANNEL_HANDLE = "@KhatPodcast"
    const r = channelMatchesConfigured({ id: "UC999", handle: "@someoneelse" })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain("@someoneelse")
  })

  it("refuses when the granting account has no handle at all", () => {
    process.env.YOUTUBE_CHANNEL_HANDLE = "@KhatPodcast"
    expect(channelMatchesConfigured({ id: "UC999", handle: null }).ok).toBe(false)
  })

  it("prefers an explicit channel id over the handle", () => {
    process.env.YOUTUBE_CHANNEL_ID = "UC_the_real_one"
    process.env.YOUTUBE_CHANNEL_HANDLE = "@KhatPodcast"
    // The handle matches, the id does not — the id must win and refuse.
    expect(channelMatchesConfigured({ id: "UC_imposter", handle: "@khatpodcast" }).ok).toBe(false)
    expect(channelMatchesConfigured({ id: "UC_the_real_one", handle: null }).ok).toBe(true)
  })

  /**
   * The most important case. With nothing configured there is no way to tell
   * خط's channel from anyone else's, and a guard that cannot check must not
   * report success — an unverifiable connection is exactly the one that ends
   * up publishing the wrong numbers.
   */
  it("REFUSES when nothing is configured, rather than passing", () => {
    const r = channelMatchesConfigured({ id: "UC123", handle: "@anything" })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/YOUTUBE_CHANNEL/)
  })
})

describe("resolveRedirectUri", () => {
  it("uses the explicit env value when set, whatever the request says", () => {
    process.env.YOUTUBE_OAUTH_REDIRECT_URI = "https://khatpodcast.com/api/admin/youtube/oauth/callback"
    expect(resolveRedirectUri("https://evil.example/api/admin/youtube/oauth/start")).toBe(
      "https://khatpodcast.com/api/admin/youtube/oauth/callback"
    )
  })

  it("derives the callback for the production origin", () => {
    expect(resolveRedirectUri("https://khatpodcast.com/api/admin/youtube/oauth/start")).toBe(
      "https://khatpodcast.com/api/admin/youtube/oauth/callback"
    )
  })

  it("derives it for localhost on any port", () => {
    expect(resolveRedirectUri("http://localhost:3000/api/admin/youtube/oauth/start")).toBe(
      "http://localhost:3000/api/admin/youtube/oauth/callback"
    )
    expect(resolveRedirectUri("http://localhost:61655/x")).toBe(
      "http://localhost:61655/api/admin/youtube/oauth/callback"
    )
  })

  it("THROWS on any other origin — a spoofed Host must not become a redirect", () => {
    expect(() => resolveRedirectUri("https://evil.example/api/admin/youtube/oauth/start")).toThrow()
    // A lookalike that a naive `includes("khatpodcast.com")` would wave through.
    expect(() => resolveRedirectUri("https://khatpodcast.com.evil.example/x")).toThrow()
    // And plain http on the real domain, which would leak the code in clear.
    expect(() => resolveRedirectUri("http://khatpodcast.com/x")).toThrow()
  })
})

/**
 * ── THE SIGNED STATE ──────────────────────────────────────────────────────
 * This exists because the callback CANNOT read the admin session: the
 * `__admin_session` cookie is `sameSite: "strict"`, so the browser withholds
 * it on the cross-site navigation back from accounts.google.com. Measured
 * live on 2026-08-07 — a correct flow 401'd. The state cookie is now the only
 * thing carrying the operator's authorisation, so it has to be unforgeable.
 */
describe("signState / verifyState", () => {
  const KEY = "b2V4YW1wbGVrZXkxMjM0NTY3ODkwYWJjZGVmZ2hpams="

  beforeEach(() => {
    process.env.YOUTUBE_OAUTH_ENC_KEY = KEY
  })

  it("round-trips the nonce and the email", () => {
    const signed = signState("nonce-abc", "khalid@khat.local")
    expect(verifyState(signed)).toEqual({ nonce: "nonce-abc", email: "khalid@khat.local" })
  })

  it("handles an email with characters that would break a bare split", () => {
    const signed = signState("n1", "a.b+c@example.co.uk")
    expect(verifyState(signed)?.email).toBe("a.b+c@example.co.uk")
  })

  it("REJECTS a tampered nonce — the whole point", () => {
    const parts = signState("nonce-abc", "khalid@khat.local").split(".")
    parts[0] = "nonce-xyz"
    expect(verifyState(parts.join("."))).toBeNull()
  })

  it("REJECTS a tampered email", () => {
    const parts = signState("nonce-abc", "viewer@khat.local").split(".")
    parts[1] = Buffer.from("owner@khat.local").toString("base64url")
    expect(verifyState(parts.join("."))).toBeNull()
  })

  it("rejects a cookie signed with a different key", () => {
    const signed = signState("nonce-abc", "khalid@khat.local")
    process.env.YOUTUBE_OAUTH_ENC_KEY = "ZGlmZmVyZW50a2V5MTIzNDU2Nzg5MGFiY2RlZmdoaWo="
    expect(verifyState(signed)).toBeNull()
  })

  it("rejects absent and malformed cookies instead of throwing", () => {
    expect(verifyState(undefined)).toBeNull()
    expect(verifyState("")).toBeNull()
    expect(verifyState("only.two")).toBeNull()
    expect(verifyState("a.b.c.d")).toBeNull()
  })
})
