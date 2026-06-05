/**
 * Live-mode token helpers.
 *
 * Raw token is handed to the host (32 bytes, base64url). The DB only stores
 * the SHA-256 hash — matching the pattern used by `guest_prep_forms`.
 */

import crypto from "crypto"

export function generateLiveToken(): { token: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url")
  const hash = hashLiveToken(raw)
  return { token: raw, hash }
}

export function hashLiveToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}
