/**
 * The refresh token is the most sensitive string this app stores in its own
 * database. These tests hold the properties that make storing it defensible —
 * and each one is written so that it FAILS if the protection is removed, not
 * merely passes while it happens to be there.
 *
 * That distinction is the point. A test that only ever encrypts and decrypts
 * with the same key would pass just as happily against a `return plaintext`
 * implementation. So: every test below either mutates the ciphertext, swaps
 * the key, or asserts on something a no-op implementation could not produce.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import crypto from "crypto"

import { encryptToken, decryptToken, encryptionKeyStatus } from "@/lib/youtube/token-crypto"

const KEY_A = crypto.randomBytes(32).toString("base64")
const KEY_B = crypto.randomBytes(32).toString("base64")
const TOKEN = "1//0eXaMpLe-refresh-token_value.with-punctuation"

let saved: string | undefined

beforeEach(() => {
  saved = process.env.YOUTUBE_OAUTH_ENC_KEY
  process.env.YOUTUBE_OAUTH_ENC_KEY = KEY_A
})

afterEach(() => {
  if (saved === undefined) delete process.env.YOUTUBE_OAUTH_ENC_KEY
  else process.env.YOUTUBE_OAUTH_ENC_KEY = saved
})

describe("token crypto — round trip", () => {
  it("returns exactly what went in", () => {
    expect(decryptToken(encryptToken(TOKEN))).toBe(TOKEN)
  })

  it("survives unicode and a long token", () => {
    const odd = "توكن-اختبار-" + "x".repeat(4096) + "-٩٩"
    expect(decryptToken(encryptToken(odd))).toBe(odd)
  })

  it("refuses to encrypt an empty string", () => {
    expect(() => encryptToken("")).toThrow()
  })
})

describe("token crypto — it is actually encrypting", () => {
  /**
   * The test that kills `return plaintext`. Every part of the stored value is
   * checked for the token, not just the whole string, because a lazy
   * implementation that base64s the plaintext into the last field would pass
   * a naive `not.toContain` on the joined string only by accident.
   */
  it("does not leak the plaintext into the stored value", () => {
    const stored = encryptToken(TOKEN)
    expect(stored).not.toContain(TOKEN)
    expect(Buffer.from(stored.split(":")[3], "base64url").toString("utf8")).not.toContain(TOKEN)
  })

  /**
   * A FRESH IV EVERY TIME. Repeating an IV under one key is the single
   * unforgivable misuse of GCM, and it is invisible in a round-trip test —
   * both encryptions decrypt perfectly. It shows up only here, as two
   * identical outputs for identical input.
   */
  it("produces a different ciphertext each time for the same token", () => {
    const a = encryptToken(TOKEN)
    const b = encryptToken(TOKEN)
    expect(a).not.toBe(b)
    expect(a.split(":")[1]).not.toBe(b.split(":")[1]) // the IVs differ
    expect(decryptToken(a)).toBe(TOKEN)
    expect(decryptToken(b)).toBe(TOKEN)
  })
})

describe("token crypto — authentication", () => {
  it("rejects a ciphertext whose payload was altered", () => {
    const parts = encryptToken(TOKEN).split(":")
    const data = Buffer.from(parts[3], "base64url")
    data[0] ^= 0xff // flip one bit of the payload
    parts[3] = data.toString("base64url")
    expect(() => decryptToken(parts.join(":"))).toThrow()
  })

  it("rejects a ciphertext whose auth tag was altered", () => {
    const parts = encryptToken(TOKEN).split(":")
    const tag = Buffer.from(parts[2], "base64url")
    tag[0] ^= 0xff
    parts[2] = tag.toString("base64url")
    expect(() => decryptToken(parts.join(":"))).toThrow()
  })

  it("rejects a ciphertext whose IV was altered", () => {
    const parts = encryptToken(TOKEN).split(":")
    const iv = Buffer.from(parts[1], "base64url")
    iv[0] ^= 0xff
    parts[1] = iv.toString("base64url")
    expect(() => decryptToken(parts.join(":"))).toThrow()
  })

  it("rejects the WRONG KEY rather than returning garbage", () => {
    const stored = encryptToken(TOKEN)
    process.env.YOUTUBE_OAUTH_ENC_KEY = KEY_B
    expect(() => decryptToken(stored)).toThrow()
  })

  it("rejects an unknown version prefix, and says so", () => {
    const parts = encryptToken(TOKEN).split(":")
    parts[0] = "v2"
    expect(() => decryptToken(parts.join(":"))).toThrow(/version/i)
  })

  it("rejects a malformed value instead of indexing into undefined", () => {
    expect(() => decryptToken("nonsense")).toThrow(/malformed/i)
    expect(() => decryptToken("v1:only:three")).toThrow(/malformed/i)
  })
})

describe("token crypto — the key itself", () => {
  it("reads the env on every call, so a late-set key works", () => {
    // The module must NOT cache the key at import time: the dev server, the
    // worker and the test runner each populate the environment differently.
    delete process.env.YOUTUBE_OAUTH_ENC_KEY
    expect(encryptionKeyStatus().ok).toBe(false)
    process.env.YOUTUBE_OAUTH_ENC_KEY = KEY_A
    expect(encryptionKeyStatus().ok).toBe(true)
    expect(decryptToken(encryptToken(TOKEN))).toBe(TOKEN)
  })

  it("names what to run when the key is missing", () => {
    delete process.env.YOUTUBE_OAUTH_ENC_KEY
    const status = encryptionKeyStatus()
    expect(status.ok).toBe(false)
    expect(status.reason).toMatch(/openssl rand/)
  })

  it("accepts a hex key as well as base64", () => {
    process.env.YOUTUBE_OAUTH_ENC_KEY = crypto.randomBytes(32).toString("hex")
    expect(decryptToken(encryptToken(TOKEN))).toBe(TOKEN)
  })

  /**
   * A 32-CHARACTER PASSPHRASE IS NOT A 32-BYTE KEY. Someone will eventually
   * paste a memorable string in here; base64-decoding it yields ~24 bytes and
   * must be refused, not padded and used.
   */
  it("refuses a key of the wrong length", () => {
    process.env.YOUTUBE_OAUTH_ENC_KEY = "a-memorable-passphrase-not-a-key"
    expect(encryptionKeyStatus().ok).toBe(false)
    expect(() => encryptToken(TOKEN)).toThrow(/32 bytes/)
  })
})
