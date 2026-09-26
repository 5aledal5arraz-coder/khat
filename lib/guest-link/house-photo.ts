/**
 * «نسخة الضيف» — the photo of the filming house.
 *
 * NOT under public/. A photo of someone's home next to its full address is
 * private: anything in public/ (or its /api/media escape hatch) is served to
 * anyone who guesses or leaks the filename. These files live in the gitignored
 * data/ tree and are read back ONLY through a route that has already checked a
 * valid link token (guest) or an admin session (preview).
 *
 * Filenames are written by us — random hex + a magic-byte-verified extension —
 * and re-validated on every read, so a stored value can never be a path.
 */

import path from "path"
import crypto from "crypto"
import { mkdir, readFile, writeFile } from "fs/promises"

export const HOUSE_PHOTO_DIR = path.join(process.cwd(), "data", "guest-homes")

const SAFE_NAME = /^[a-f0-9]{16}\.(jpg|png|webp|avif)$/

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
}

export function isSafeHousePhotoName(name: string | null | undefined): name is string {
  return typeof name === "string" && SAFE_NAME.test(name)
}

export async function saveHousePhoto(buffer: Buffer, ext: string): Promise<string> {
  const normalized = ext === "jpeg" ? "jpg" : ext
  if (!CONTENT_TYPES[normalized]) throw new Error("unsupported extension")
  const name = `${crypto.randomBytes(8).toString("hex")}.${normalized}`
  await mkdir(HOUSE_PHOTO_DIR, { recursive: true })
  await writeFile(path.join(HOUSE_PHOTO_DIR, name), buffer)
  return name
}

export async function readHousePhoto(
  name: string | null | undefined,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!isSafeHousePhotoName(name)) return null
  const ext = name.split(".").pop()!
  try {
    const bytes = await readFile(path.join(HOUSE_PHOTO_DIR, name))
    return { bytes, contentType: CONTENT_TYPES[ext] }
  } catch {
    return null
  }
}
