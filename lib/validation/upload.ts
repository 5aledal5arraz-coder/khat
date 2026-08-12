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

/* ------------------------------------------------------------------------ *
 * Audio — the guest's voice note
 * ------------------------------------------------------------------------ */

/**
 * Audio arrives from a phone, not a studio, so the accepted set is "whatever
 * the messaging apps and voice recorders actually produce":
 *
 * - `.ogg` / `.opus` — WhatsApp and Telegram voice notes
 * - `.m4a`           — iPhone Voice Memos
 * - `.mp3`           — the universal fallback
 * - `.wav`           — uncompressed recorders
 * - `.webm`          — browser MediaRecorder
 *
 * None of these is what we SERVE. The upload route transcodes every one of
 * them to `.m4a`; this function only decides whether the bytes are audio at
 * all, and what to hand ffmpeg.
 */
const ALLOWED_AUDIO_EXTENSIONS = new Set([
  "ogg",
  "opus",
  "oga",
  "m4a",
  "mp4",
  "mp3",
  "wav",
  "webm",
  "aac",
])

/**
 * Container signatures. Audio containers are not as tidy as image headers —
 * an MP3 may open with an ID3 tag or with a raw frame sync, and `ftyp` at
 * offset 4 covers both `.m4a` and `.mp4` — so this identifies the CONTAINER
 * and deliberately does not try to name the codec. ffprobe settles that.
 */
const AUDIO_SIGNATURES: { bytes: number[]; offset: number; container: string }[] = [
  // Ogg (Vorbis or Opus): "OggS"
  { bytes: [0x4f, 0x67, 0x67, 0x53], offset: 0, container: "ogg" },
  // ISO-BMFF (m4a/mp4/aac-in-mp4): "ftyp" at offset 4
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, container: "m4a" },
  // RIFF/WAVE: "RIFF" then "WAVE" at offset 8
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, container: "wav" },
  // Matroska/WebM: 1A 45 DF A3
  { bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0, container: "webm" },
  // MP3 with an ID3v2 tag: "ID3"
  { bytes: [0x49, 0x44, 0x33], offset: 0, container: "mp3" },
  // MP3 raw frame sync: FF Ex/Fx — the loosest of these, so it is checked last.
  { bytes: [0xff, 0xfb], offset: 0, container: "mp3" },
  { bytes: [0xff, 0xf3], offset: 0, container: "mp3" },
  { bytes: [0xff, 0xf2], offset: 0, container: "mp3" },
  // ADTS AAC
  { bytes: [0xff, 0xf1], offset: 0, container: "aac" },
]

function detectAudioContainer(buffer: Buffer): string | null {
  if (buffer.length < 12) return null

  for (const sig of AUDIO_SIGNATURES) {
    const match = sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte)
    if (!match) continue

    // RIFF is also the WebP header — the format check that already caught a
    // mislabelled image above applies in reverse here.
    if (sig.container === "wav" && buffer.slice(8, 12).toString("ascii") !== "WAVE") {
      continue
    }

    return sig.container
  }

  return null
}

export interface AudioValidationResult {
  valid: boolean
  error?: string
  /** The detected container, for logging and for ffmpeg's input hint. */
  container?: string
}

/**
 * 20 MB. A voice note is seconds to a couple of minutes; at WhatsApp's Opus
 * bitrate that is well under 1 MB, and even an uncompressed WAV of two minutes
 * is ~20 MB. Anything larger is not the thing this field is for.
 */
const MAX_AUDIO_SIZE = 20 * 1024 * 1024

export function validateAudioUpload(
  file: File,
  buffer: Buffer,
): AudioValidationResult {
  if (file.size > MAX_AUDIO_SIZE) {
    return { valid: false, error: "الملف الصوتي كبير — الحد ٢٠ ميغابايت" }
  }

  if (file.size === 0) {
    return { valid: false, error: "الملف الصوتي فارغ" }
  }

  const rawExt = file.name.split(".").pop()?.toLowerCase()
  if (!rawExt || !ALLOWED_AUDIO_EXTENSIONS.has(rawExt)) {
    return {
      valid: false,
      error: "صيغة غير مدعومة. استخدم OGG أو M4A أو MP3 أو WAV",
    }
  }

  // The authoritative check. Unlike the image path there is no
  // extension↔content cross-check: a WhatsApp voice note is routinely named
  // `.opus` while its container is Ogg, and an iPhone memo `.m4a` while the
  // brand is `M4A `/`isom`. Rejecting those mismatches would reject the two
  // most likely real files. Being audio at all is the property that matters,
  // because ffmpeg re-encodes from scratch either way.
  const container = detectAudioContainer(buffer)
  if (!container) {
    return { valid: false, error: "محتوى الملف لا يطابق ملفاً صوتياً صالحاً" }
  }

  return { valid: true, container }
}
