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

/**
 * Every studio route whose POST spends money on a generator.
 *
 * A hand-written list is exactly how the first version of this test
 * passed green while `guest-ai`, `audio-intro` and `edit-suggestions`
 * were broken: they simply were not on the list. The set is now
 * DERIVED from the filesystem, so a new billable route cannot be added
 * without either carrying a guard or failing this test.
 */
const ROUTES_DIR = join(ROOT, "app/api/admin/studio/[id]")

function billableRoutes(): { route: string; src: string }[] {
  const out: { route: string; src: string }[] = []
  for (const entry of readdirSync(ROUTES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let src: string
    try {
      src = readFileSync(join(ROUTES_DIR, entry.name, "route.ts"), "utf8")
    } catch {
      continue // nested groups (transcript/*) have no route file of their own
    }
    if (!/export async function POST/.test(src)) continue
    // Generators are imported from @/lib/ai, or reached through a
    // lib/studio runner that wraps them. Transcription routes are out of
    // scope on purpose: their spend guard is the transcript record
    // itself, not a `force` flag.
    const callsGenerator =
      /from "@\/lib\/ai"/.test(src) || /runGrowthPackageForSession/.test(src)
    if (callsGenerator) out.push({ route: entry.name, src })
  }
  return out
}

describe("studio generation routes", () => {
  const routes = billableRoutes()

  it("actually finds the billable routes", () => {
    // Without this, a broken sweep would make every case below vacuous.
    expect(routes.length).toBeGreaterThanOrEqual(9)
  })

  it.each(routes.map((r) => r.route))(
    "%s reads a force flag and short-circuits on cache",
    (route) => {
      const src = routes.find((r) => r.route === route)!.src
      expect(src).toContain("force === true")
      expect(src).toContain("cached: true")
    },
  )
})

describe("studio generate calls", () => {
  it("no context POSTs to any studio route without a body", () => {
    const dir = join(ROOT, "app/admin/studio/contexts")
    // Catch ANY bodyless POST to a studio endpoint, whatever it is
    // named. The previous version matched a fixed set of route names and
    // was therefore blind to the three that were broken.
    const bodyless =
      /fetch\(\s*`\/api\/admin\/studio\/\$\{sessionId\}\/([^`]+)`\s*,\s*\{\s*method:\s*"POST"\s*\}\s*\)/g
    const offenders: string[] = []
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".tsx")) continue
      const src = readFileSync(join(dir, file), "utf8")
      for (const m of src.matchAll(bodyless)) {
        offenders.push(`${file} \u2192 ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
