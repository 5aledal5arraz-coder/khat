/**
 * Studio audio-path resolution — the single source of truth for where uploaded
 * audio lives on disk (data/studio-audio/{id}/audio-{id}{ext}).
 *
 * These lock the ENOENT bug this module was extracted to kill: the uploader
 * stores the file as `audio-{id}{ext}`, so callers must derive ONLY the
 * extension from `audio_filename` and NEVER join the original browser filename.
 * fs is mocked — no disk touched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import path from "path"

vi.mock("fs/promises", () => ({ default: { access: vi.fn() } }))

import fs from "fs/promises"
import {
  AUDIO_DIR,
  buildSessionAudioPath,
  resolveSessionAudioPath,
} from "@/lib/studio/audio-path"

const ID = "33333333-3333-3333-3333-333333333333"
const expected = (ext: string) => path.join(AUDIO_DIR, ID, `audio-${ID}${ext}`)

beforeEach(() => vi.clearAllMocks())

describe("buildSessionAudioPath — derives audio-{id}{ext}", () => {
  it.each([
    ["recording.mp3", ".mp3"],
    ["episode.m4a", ".m4a"],
    ["raw.wav", ".wav"],
    ["clip.webm", ".webm"],
  ])("uses only the extension of %s", (filename, ext) => {
    expect(buildSessionAudioPath(ID, filename)).toBe(expected(ext))
  })

  it("lowercases the extension", () => {
    expect(buildSessionAudioPath(ID, "LOUD.MP3")).toBe(expected(".mp3"))
  })

  it("REGRESSION: ignores the original basename entirely (never joins audio_filename)", () => {
    // The exact ENOENT trigger: the original browser name has spaces/parens and
    // is NOT the on-disk name. The built path must contain none of it.
    const p = buildSessionAudioPath(ID, "My Podcast Episode (final).mp3")
    expect(p).toBe(expected(".mp3"))
    expect(p).not.toContain("My Podcast")
    expect(p).not.toContain("(final)")
  })

  it("does not touch the filesystem (pure)", () => {
    buildSessionAudioPath(ID, "x.mp3")
    expect(fs.access).not.toHaveBeenCalled()
  })
})

describe("resolveSessionAudioPath — build + existence check", () => {
  it("returns the built path when the file exists on disk", async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(undefined)
    const p = await resolveSessionAudioPath(ID, "recording.mp3")
    expect(p).toBe(expected(".mp3"))
    expect(fs.access).toHaveBeenCalledWith(expected(".mp3"))
  })

  it("rejects clearly when the audio file is missing (ENOENT)", async () => {
    const enoent = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" })
    vi.mocked(fs.access).mockRejectedValueOnce(enoent)
    await expect(resolveSessionAudioPath(ID, "recording.mp3")).rejects.toThrow("ENOENT")
  })
})
