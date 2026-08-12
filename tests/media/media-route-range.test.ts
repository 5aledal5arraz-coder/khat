import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdir, writeFile, unlink } from "fs/promises"
import path from "path"
import { GET } from "@/app/api/media/[dir]/[file]/route"

/**
 * iOS Safari opens a media element with `Range: bytes=0-1` and treats a 200
 * carrying the whole file as a broken source — it errors and never plays.
 * Chrome and Firefox accept the 200, so a desktop check cannot see this.
 * These tests are the only thing standing between a working player and one
 * that is silent on most of this audience's phones.
 */

const FILENAME = "0123456789abcdef.m4a"
const DIR = path.join(process.cwd(), "public", "testimonials")
const FILE = path.join(DIR, FILENAME)
const BODY = Buffer.from("0123456789ABCDEFGHIJ") // 20 bytes, easy to index

function call(headers: Record<string, string> = {}, file = FILENAME, dir = "testimonials") {
  return GET(new Request(`http://localhost/${dir}/${file}`, { headers }), {
    params: Promise.resolve({ dir, file }),
  })
}

describe("media route — byte ranges", () => {
  beforeAll(async () => {
    await mkdir(DIR, { recursive: true })
    await writeFile(FILE, BODY)
  })

  afterAll(async () => {
    await unlink(FILE).catch(() => {})
  })

  it("serves the whole file with Accept-Ranges when no range is asked for", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(res.headers.get("content-type")).toBe("audio/mp4")
    expect(res.headers.get("content-length")).toBe("20")
  })

  it("answers iOS Safari's opening probe with a 206, not a 200", async () => {
    const res = await call({ range: "bytes=0-1" })
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 0-1/20")
    expect(res.headers.get("content-length")).toBe("2")
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("01")
  })

  it("serves an open-ended range to the end of the file", async () => {
    const res = await call({ range: "bytes=10-" })
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 10-19/20")
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("ABCDEFGHIJ")
  })

  it("reads a suffix range as the LAST n bytes, not the first n", async () => {
    const res = await call({ range: "bytes=-5" })
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 15-19/20")
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("FGHIJ")
  })

  it("clamps an end past the file to the last byte", async () => {
    const res = await call({ range: "bytes=18-999" })
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 18-19/20")
  })

  it.each(["bytes=99-", "bytes=10-4", "bags=0-1", "bytes=-", "nonsense"])(
    "falls back to a full 200 for an unusable range (%s)",
    async (range) => {
      const res = await call({ range })
      expect(res.status).toBe(200)
      expect(res.headers.get("content-length")).toBe("20")
    },
  )

  it("still refuses traversal and unknown directories", async () => {
    expect((await call({}, "../../.env")).status).toBe(404)
    expect((await call({}, FILENAME, "etc")).status).toBe(404)
    expect((await call({}, "notes.txt")).status).toBe(404)
  })
})
