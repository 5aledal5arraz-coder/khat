import { createConfigStore } from "@/lib/config-store"
import { createHash, randomBytes, timingSafeEqual } from "crypto"
import bcrypt from "bcryptjs"
import type { MediaKitShareConfig } from "@/types/media-kit"

const store = createConfigStore<MediaKitShareConfig | null>("media-kit-share.json", null)
const BCRYPT_ROUNDS = 12

export async function getShareConfig(): Promise<MediaKitShareConfig | null> {
  return store.read()
}

export async function saveShareConfig(config: MediaKitShareConfig): Promise<void> {
  await store.write(config)
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export function generateSlug(): string {
  return "khat-" + randomBytes(4).toString("hex")
}

/**
 * Verify a password against a stored hash.
 *
 * Supports both bcrypt hashes (new) and legacy SHA-256 hex hashes (old).
 * If a legacy hash matches, returns { valid: true, needsRehash: true }
 * so the caller can upgrade the stored hash to bcrypt.
 */
export async function verifyPassword(
  input: string,
  storedHash: string
): Promise<{ valid: boolean; needsRehash?: boolean }> {
  // Bcrypt hashes always start with "$2a$" or "$2b$"
  if (storedHash.startsWith("$2")) {
    const valid = await bcrypt.compare(input, storedHash)
    return { valid }
  }

  // Legacy: SHA-256 hex hash (64 chars). Use timingSafeEqual to prevent timing attacks.
  if (/^[0-9a-f]{64}$/.test(storedHash)) {
    const inputHash = createHash("sha256").update(input).digest("hex")
    const inputBuf = Buffer.from(inputHash, "utf-8")
    const storedBuf = Buffer.from(storedHash, "utf-8")
    const valid = inputBuf.length === storedBuf.length && timingSafeEqual(inputBuf, storedBuf)
    return { valid, needsRehash: valid }
  }

  return { valid: false }
}
