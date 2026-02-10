import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import { createHash, randomBytes, timingSafeEqual } from "crypto"
import bcrypt from "bcryptjs"
import type { MediaKitShareConfig } from "@/types/ads"

const SHARE_CONFIG_PATH = path.join(process.cwd(), "config", "media-kit-share.json")
const BCRYPT_ROUNDS = 12

export async function getShareConfig(): Promise<MediaKitShareConfig | null> {
  try {
    const data = await readFile(SHARE_CONFIG_PATH, "utf-8")
    return JSON.parse(data) as MediaKitShareConfig
  } catch {
    return null
  }
}

export async function saveShareConfig(config: MediaKitShareConfig): Promise<void> {
  const configDir = path.dirname(SHARE_CONFIG_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(SHARE_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
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
