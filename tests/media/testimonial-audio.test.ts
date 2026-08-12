import { describe, it, expect } from "vitest"
import { validateAudioUpload } from "@/lib/validation/upload"

/**
 * The traps these pin down, in order of how expensive each was to reason about:
 *
 * 1. A WhatsApp voice note is Opus in an Ogg container and arrives named
 *    `.opus`. Cross-checking extension against container — which the IMAGE
 *    validator does, correctly — would reject the single most likely file.
 * 2. `RIFF` is the header of both WAV and WebP. Without the secondary `WAVE`
 *    check a WebP image passes as audio.
 * 3. A renamed file must not pass on its name alone.
 */

function fakeFile(name: string, size = 4096, type = ""): File {
  return { name, size, type } as unknown as File
}

function bufferFrom(head: number[], length = 64): Buffer {
  const buf = Buffer.alloc(length)
  head.forEach((b, i) => (buf[i] = b))
  return buf
}

const OGG = bufferFrom([0x4f, 0x67, 0x67, 0x53])
const M4A = bufferFrom([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20])
const MP3_ID3 = bufferFrom([0x49, 0x44, 0x33, 0x04])
const WEBM = bufferFrom([0x1a, 0x45, 0xdf, 0xa3])

function riff(tag: string): Buffer {
  const buf = bufferFrom([0x52, 0x49, 0x46, 0x46])
  buf.write(tag, 8, "ascii")
  return buf
}

describe("validateAudioUpload", () => {
  it("accepts a WhatsApp voice note: Ogg bytes under a .opus name", () => {
    const result = validateAudioUpload(fakeFile("PTT-20260812-WA0003.opus"), OGG)
    expect(result.valid).toBe(true)
    // Reported as its real container so ffmpeg gets an honest hint.
    expect(result.container).toBe("ogg")
  })

  it("accepts an iPhone Voice Memo", () => {
    expect(validateAudioUpload(fakeFile("memo.m4a"), M4A).valid).toBe(true)
  })

  it.each([
    ["mp3", MP3_ID3, "clip.mp3"],
    ["webm", WEBM, "recording.webm"],
    ["wav", riff("WAVE"), "take.wav"],
  ])("accepts %s", (container, buf, name) => {
    const result = validateAudioUpload(fakeFile(name), buf)
    expect(result.valid).toBe(true)
    expect(result.container).toBe(container)
  })

  it("rejects a WebP image renamed to .wav — RIFF alone is not enough", () => {
    const result = validateAudioUpload(fakeFile("sneaky.wav"), riff("WEBP"))
    expect(result.valid).toBe(false)
    expect(result.error).toContain("صالح")
  })

  it("rejects a JPEG renamed to .m4a", () => {
    const jpeg = bufferFrom([0xff, 0xd8, 0xff, 0xe0])
    expect(validateAudioUpload(fakeFile("photo.m4a"), jpeg).valid).toBe(false)
  })

  it("rejects an extension outside the allowlist even with real audio bytes", () => {
    expect(validateAudioUpload(fakeFile("voice.flac"), OGG).valid).toBe(false)
  })

  it("rejects an empty file", () => {
    expect(validateAudioUpload(fakeFile("empty.m4a", 0), M4A).valid).toBe(false)
  })

  it("rejects anything over 20 MB", () => {
    const result = validateAudioUpload(fakeFile("long.wav", 21 * 1024 * 1024), riff("WAVE"))
    expect(result.valid).toBe(false)
    expect(result.error).toContain("٢٠")
  })

  it("rejects a truncated file too short to carry any header", () => {
    expect(validateAudioUpload(fakeFile("tiny.m4a", 4), Buffer.alloc(4)).valid).toBe(false)
  })
})
