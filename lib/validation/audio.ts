const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.webm'] as const
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500 MB

interface AudioValidationResult {
  valid: boolean
  error?: string
  ext?: string
}

/**
 * Validate an audio file by extension, magic bytes, and size.
 */
export function validateAudioFile(
  filename: string,
  size: number,
  headerBytes: Buffer
): AudioValidationResult {
  // Check extension
  const ext = '.' + filename.toLowerCase().split('.').pop()
  if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
    return {
      valid: false,
      error: `صيغة الملف غير مدعومة. الصيغ المدعومة: ${ALLOWED_EXTENSIONS.join(', ')}`,
    }
  }

  // Check size
  if (size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `حجم الملف يتجاوز الحد الأقصى (${MAX_FILE_SIZE / 1024 / 1024} MB)`,
    }
  }

  if (size === 0) {
    return { valid: false, error: 'الملف فارغ' }
  }

  // Check magic bytes
  if (headerBytes.length < 12) {
    return { valid: false, error: 'الملف تالف أو غير صالح' }
  }

  const isValid = checkMagicBytes(ext, headerBytes)
  if (!isValid) {
    return {
      valid: false,
      error: 'محتوى الملف لا يتطابق مع الصيغة المحددة',
    }
  }

  return { valid: true, ext }
}

function checkMagicBytes(ext: string, header: Buffer): boolean {
  switch (ext) {
    case '.mp3':
      // ID3 tag or MPEG sync word (0xFF 0xFB/0xF3/0xF2)
      return (
        (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) || // ID3
        (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) // MPEG sync
      )

    case '.wav':
      // RIFF....WAVE
      return (
        header[0] === 0x52 && header[1] === 0x49 &&
        header[2] === 0x46 && header[3] === 0x46 &&
        header[8] === 0x57 && header[9] === 0x41 &&
        header[10] === 0x56 && header[11] === 0x45
      )

    case '.m4a':
      // ftyp at offset 4
      return (
        header[4] === 0x66 && header[5] === 0x74 &&
        header[6] === 0x79 && header[7] === 0x70
      )

    case '.webm':
      // EBML header (0x1A 0x45 0xDF 0xA3)
      return (
        header[0] === 0x1a && header[1] === 0x45 &&
        header[2] === 0xdf && header[3] === 0xa3
      )

    default:
      return false
  }
}
