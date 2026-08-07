import crypto from "crypto"

/**
 * Authenticated encryption for the one long-lived credential this app stores
 * in its own database: the YouTube channel owner's OAuth refresh token.
 *
 * ── WHY ENCRYPT SOMETHING THAT IS ALREADY BEHIND A DB PASSWORD ────────────
 * Because the database is not the only place its rows end up. A `pg_dump`
 * sits on a laptop, a backup gets copied to Desktop, a support query is
 * pasted into a chat. Every one of those has happened to some project, and
 * this one has already had to rewrite its git history once over a leaked key.
 * Encryption at rest means a leaked dump leaks ciphertext, and the key that
 * opens it lives somewhere the dump does not — the environment.
 *
 * ── GCM, NOT CBC ──────────────────────────────────────────────────────────
 * AES-256-GCM authenticates as well as encrypts: a tampered ciphertext fails
 * to open instead of decrypting to garbage that then gets sent to Google as
 * if it were a token. The auth tag is stored alongside and verified on every
 * read. A fresh 12-byte IV per encryption, from `randomBytes` — GCM's one
 * unforgivable misuse is repeating an IV under the same key, so it is never
 * derived, never counted, never reused.
 *
 * ── THE FORMAT IS VERSIONED ───────────────────────────────────────────────
 * `v1:<iv>:<tag>:<ciphertext>`, base64url. The version prefix is what lets a
 * future key rotation say "this is v1, decrypt with the old key" instead of
 * presenting a rotation as a corrupt-data error at 2am.
 */

const VERSION = "v1"
const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const KEY_BYTES = 32

/**
 * The key, from `YOUTUBE_OAUTH_ENC_KEY` — 32 bytes as base64 or hex.
 *
 * Read on EVERY call rather than cached at module load: the env is populated
 * differently in the dev server, the worker and tests, and a module-level
 * const would freeze whichever value happened to exist at import time. It is
 * also why a missing key throws HERE, at the point of use, with a message
 * that says what to generate — instead of at boot in a stack trace that does
 * not mention YouTube.
 */
function key(): Buffer {
  const raw = process.env.YOUTUBE_OAUTH_ENC_KEY
  if (!raw) {
    throw new Error(
      "YOUTUBE_OAUTH_ENC_KEY is not set — the YouTube Analytics grant cannot be " +
        "stored or read without it. Generate one with: " +
        "openssl rand -base64 32"
    )
  }

  // Accept either encoding so a key pasted from `openssl rand -hex 32` works
  // as well as one from `-base64 32`. Length is what is checked, not the
  // shape of the string: a 32-char passphrase is 32 BYTES of very little
  // entropy and would be silently accepted by a naive length check on the
  // decoded buffer, so hex is only taken when it actually looks like hex.
  const buf = /^[0-9a-f]{64}$/i.test(raw.trim())
    ? Buffer.from(raw.trim(), "hex")
    : Buffer.from(raw, "base64")

  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `YOUTUBE_OAUTH_ENC_KEY must decode to ${KEY_BYTES} bytes, got ${buf.length}. ` +
        "Generate one with: openssl rand -base64 32"
    )
  }
  return buf
}

/** Encrypt a token for storage. Returns the versioned, self-describing string. */
export function encryptToken(plaintext: string): string {
  if (!plaintext) throw new Error("refusing to encrypt an empty token")

  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":")
}

/**
 * Decrypt a stored token.
 *
 * Throws on a wrong key, a tampered value, or an unknown version — all of
 * which mean "do not use this", and none of which should be answerable with a
 * fallback. A caller that swallows this would send a broken token to Google
 * and read the resulting 400 as "YouTube is down".
 */
export function decryptToken(stored: string): string {
  const parts = stored.split(":")
  if (parts.length !== 4) {
    throw new Error("stored token is malformed (expected 4 parts)")
  }

  const [version, ivB64, tagB64, dataB64] = parts
  if (version !== VERSION) {
    throw new Error(`stored token has unknown version "${version}" — key rotation?`)
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivB64, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"))

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

/**
 * Whether a key is configured and usable — for the admin screen and for boot
 * checks, so "you never set the key" is a sentence on screen rather than a
 * 500 the first time someone presses «اربط».
 */
export function encryptionKeyStatus(): { ok: boolean; reason?: string } {
  try {
    key()
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
