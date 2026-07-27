/**
 * ص-٨ + ص-٩ — the cache guard and the regenerate button are one fix.
 *
 * The guard reads `force` from the request body; every Studio generate
 * button POSTed with no body at all, so `force` was always false and
 * "إعادة التوليد" returned `{ cached: true }` — the same bad output,
 * silently. Fixing only one side is worse than fixing neither: a guard
 * with no working force traps the operator on a bad generation, and a
 * force with no guard bills every idle click.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync, readdirSync } from "fs"
import { join } from "path"

import { postGeneration } from "@/app/admin/studio/contexts/generation-request"

const ROOT = process.cwd()

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")))
})

describe("postGeneration", () => {
  it("always sends a JSON body so the server can read `force`", async () => {
    await postGeneration("/api/admin/studio/s-1/chapters")

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ force: false })
  })

  it("sends force:true only when explicitly asked", async () => {
    await postGeneration("/api/admin/studio/s-1/chapters", { force: true })

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ force: true })
  })
})

describe("studio generation routes", () => {
  /** Routes whose POST runs a billable generator. */
  const GUARDED = [
    "chapters",
    "clips",
    "website-package",
    "analyzer",
    "generate",
    "deep-analysis",
    "growth-package",
    "guest-intelligence",
  ]

  it.each(GUARDED)("%s reads a force flag and short-circuits on cache", (route) => {
    const src = readFileSync(
      join(ROOT, "app/api/admin/studio/[id]", route, "route.ts"),
      "utf8",
    )
    expect(src).toContain("force === true")
    expect(src).toContain("cached: true")
  })
})

describe("studio generate calls", () => {
  it("no context POSTs to a generator without a body", () => {
    const dir = join(ROOT, "app/admin/studio/contexts")
    const offenders: string[] = []
    for (const file of readdirSync(dir)) {
      if (!file.endsWith("-context.tsx")) continue
      const src = readFileSync(join(dir, file), "utf8")
      for (const route of [
        "chapters",
        "clips",
        "website-package",
        "analyzer",
        "generate",
        "deep-analysis",
        "growth-package",
        "guest-intelligence",
      ]) {
        if (src.includes(`/${route}\`, { method: "POST" })`)) {
          offenders.push(`${file} → ${route}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
