/**
 * Server-side image upload validation.
 *
 * Validates uploads using three independent checks:
 * 1. File extension against a strict allowlist
 * 2. Client-supplied MIME type (untrusted, but filtered)
 * 3. Magic bytes from the actual file buffer (authoritative)
 */

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif"])

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
])

/** Magic byte signatures mapped to their canonical extension. */
const MAGIC_SIGNATURES: { bytes: number[]; offset: number; ext: string }[] = [
  // JPEG: FF D8 FF
  { bytes: [0xff, 0xd8, 0xff], offset: 0, ext: "jpg" },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0, ext: "png" },
  // WebP: RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, ext: "webp" },
  // AVIF: ftyp at offset 4, then "avif" or "mif1" or "avis"
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, ext: "avif" },
]

/**
 * Detect the actual image type from the file's raw bytes.
 * Returns the canonical extension ("jpg", "png", "webp", "avif") or null.
 */
function detectImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null

  for (const sig of MAGIC_SIGNATURES) {
    const match = sig.bytes.every(
      (byte, i) => buffer[sig.offset + i] === byte
    )
    if (!match) continue

    // WebP needs a secondary check: bytes 8-11 must be "WEBP"
    if (sig.ext === "webp") {
      const webpTag = buffer.slice(8, 12).toString("ascii")
      if (webpTag !== "WEBP") continue
    }

    // AVIF needs a secondary check: bytes 8-12 should be "avif", "mif1", or "avis"
    if (sig.ext === "avif") {
      const brand = buffer.slice(8, 12).toString("ascii")
      if (!["avif", "mif1", "avis"].includes(brand)) continue
    }

    return sig.ext
  }

  return null
}

export interface ImageValidationResult {
  valid: boolean
  error?: string
  /** The verified extension to use for the saved file (from magic bytes, not user input). */
  ext?: string
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

/**
 * Validates an uploaded image file.
 *
 * @param file - The uploaded File object
 * @param buffer - The file's raw bytes (already read from the File)
 * @returns Validation result with a verified extension on success
 */
export function validateImageUpload(
  file: File,
  buffer: Buffer
): ImageValidationResult {
  // 1. Size check
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "حجم الملف يتجاوز 5 ميجابايت" }
  }

  // 2. Extension allowlist
  const rawExt = file.name.split(".").pop()?.toLowerCase()
  if (!rawExt || !ALLOWED_EXTENSIONS.has(rawExt)) {
    return {
      valid: false,
      error: "امتداد الملف غير مدعوم. استخدم JPG أو PNG أو WebP أو AVIF",
    }
  }

  // 3. MIME type check (untrusted but useful as a fast filter)
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      error: "نوع الملف غير مدعوم. استخدم JPG أو PNG أو WebP أو AVIF",
    }
  }

  // 4. Magic byte verification (authoritative)
  const detectedType = detectImageType(buffer)
  if (!detectedType) {
    return {
      valid: false,
      error: "محتوى الملف لا يطابق صورة صالحة",
    }
  }

  // 5. Cross-check: detected type must be compatible with the claimed extension
  const normalizedExt = rawExt === "jpeg" ? "jpg" : rawExt
  if (normalizedExt !== detectedType) {
    return {
      valid: false,
      error: "امتداد الملف لا يطابق محتوى الصورة الفعلي",
    }
  }

  // Use the verified extension from magic bytes (not user input)
  return { valid: true, ext: detectedType === "jpg" ? "jpg" : detectedType }
}
