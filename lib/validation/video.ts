/**
 * Server-side video upload validation.
 *
 * Two-phase validation:
 * 1. validateVideoMeta() — checks filename, MIME, size (no bytes needed)
 * 2. detectVideoType()   — checks magic bytes (only first 12 bytes needed)
 */

const ALLOWED_EXTENSIONS = new Set(["mp4", "webm", "mov"])

const ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
])

const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200 MB

export interface VideoValidationResult {
  valid: boolean
  error?: string
  ext?: string
}

/**
 * Phase 1: Validate file metadata before reading any bytes.
 */
export function validateVideoMeta(
  fileName: string,
  mimeType: string,
  fileSize: number
): VideoValidationResult {
  if (fileSize > MAX_FILE_SIZE) {
    return { valid: false, error: "حجم الملف يتجاوز 200 ميجابايت" }
  }

  const rawExt = fileName.split(".").pop()?.toLowerCase()
  if (!rawExt || !ALLOWED_EXTENSIONS.has(rawExt)) {
    return {
      valid: false,
      error: "امتداد الملف غير مدعوم. استخدم MP4 أو WebM أو MOV",
    }
  }

  // Allow empty MIME (some browsers don't report it)
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: `نوع الملف غير مدعوم (${mimeType}). استخدم MP4 أو WebM أو MOV`,
    }
  }

  return { valid: true }
}

/**
 * Phase 2: Detect the actual video type from the file's first 12 bytes.
 * Returns the canonical extension ("mp4", "webm", "mov") or null.
 */
export function detectVideoType(header: Buffer): string | null {
  if (header.length < 12) return null

  // WebM: EBML header 1A 45 DF A3 at offset 0
  if (
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3
  ) {
    return "webm"
  }

  // ftyp-based formats (MP4 / MOV): bytes 4-7 = "ftyp"
  if (
    header[4] === 0x66 &&
    header[5] === 0x74 &&
    header[6] === 0x79 &&
    header[7] === 0x70
  ) {
    const brand = header.slice(8, 12).toString("ascii")
    if (brand === "qt  " || brand === "MSNV") return "mov"
    return "mp4"
  }

  return null
}

/**
 * Combined validation (used by server actions that have a File object).
 */
export function validateVideoUpload(
  file: File,
  header: Buffer
): VideoValidationResult {
  const meta = validateVideoMeta(file.name, file.type, file.size)
  if (!meta.valid) return meta

  const detectedType = detectVideoType(header)
  if (!detectedType) {
    return { valid: false, error: "محتوى الملف لا يطابق فيديو صالح" }
  }

  const rawExt = file.name.split(".").pop()?.toLowerCase()
  const compatible =
    rawExt === detectedType ||
    (rawExt === "mov" && detectedType === "mp4") ||
    (rawExt === "mp4" && detectedType === "mov")

  if (!compatible) {
    return {
      valid: false,
      error: `امتداد الملف (${rawExt}) لا يطابق محتوى الفيديو الفعلي (${detectedType})`,
    }
  }

  return { valid: true, ext: detectedType }
}
