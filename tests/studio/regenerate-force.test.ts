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
 * Every studio route whose POST spends real money.
 *
 * Two blind spots have already shipped here, and each was found only
 * because someone attacked the TEST rather than the code:
 *
 *   1. a hand-written list of route names — it passed green while
 *      `guest-ai`, `audio-intro` and `edit-suggestions` were broken,
 *      because they simply were not on it; and
 *   2. a top-level-only directory scan that defined "billable" as
 *      "imports @/lib/ai" — so the sweep never descended into
 *      `transcript/` and never saw Whisper, which imports @/lib/whisper.
 *      Noura deleted the guard on the single most expensive route in the
 *      Studio and this file still reported 16/16 green.
 *
 * So: walk RECURSIVELY, and define billable by "reaches a paid provider",
 * not by one import path. Anything intentionally exempt must be named in
 * `EXEMPT` with a reason — an exemption that has to be written down is a
 * decision; a directory the walker never entered is an accident.
 */
const ROUTES_DIR = join(ROOT, "app/api/admin/studio/[id]")

/**
 * Routes that reach a paid provider but must NOT carry a `force` cache
 * guard. Each entry is a deliberate, justified exception.
 */
const EXEMPT: Record<string, string> = {
  // Its entire purpose is to regenerate one section on demand; a cache
  // guard would make it a no-op. It also requires an explicit `section`
  // in the body, so a bodyless click cannot trigger it.
  "transcript/regenerate": "explicit per-section regeneration endpoint",
  // Enqueue-only: they create a job row and the worker does the paid
  // work, so the spend guard is job de-duplication, not a request flag.
  "episode-map": "enqueues a job; guarded by job dedup",
  "episode-review": "enqueues a job; guarded by job dedup",
}

/** Every route.ts under the studio route tree, at any depth. */
function walkRoutes(dir: string, prefix = ""): { route: string; src: string }[] {
  const out: { route: string; src: string }[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    const child = join(dir, entry.name)
    try {
      out.push({ route: name, src: readFileSync(join(child, "route.ts"), "utf8") })
    } catch {
      // no route file at this level — keep descending
    }
    out.push(...walkRoutes(child, name))
  }
  return out
}

/**
 * Does this handler reach something that bills us?
 *
 * Matching `from "@/lib/ai"` — with the closing quote — was blind to both
 * of these, and the suite stayed green at 20/20 while they were removed:
 *   import { generateStudioChapters } from "@/lib/ai/studio"   // deep path
 *   const mod = await import("@/lib/ai")                       // dynamic
 * So match the module PATH wherever it appears, in any import form.
 */
function isBillable(src: string): boolean {
  return (
    /@\/lib\/ai(?:\/|["'])/.test(src) || // the ~38 generators, root or deep
    /@\/lib\/whisper(?:\/|["'])/.test(src) || // transcription
    /@\/lib\/ai-router(?:\/|["'])/.test(src) || // a direct router call
    /transcribeAudioFile/.test(src) ||
    /runAiTask/.test(src) ||
    /runGrowthPackageForSession/.test(src) // lib/studio runner over generators
  )
}

function billableRoutes(): { route: string; src: string }[] {
  return walkRoutes(ROUTES_DIR)
    .filter((r) => /export async function POST/.test(r.src))
    .filter((r) => isBillable(r.src))
    .filter((r) => !(r.route in EXEMPT))
}

describe("studio generation routes", () => {
  const routes = billableRoutes()

  it("descends into nested route groups", () => {
    // The exact regression: `transcript/whisper` must be in the sweep.
    // Without this the suite can silently stop covering the priciest path.
    expect(routes.map((r) => r.route)).toContain("transcript/whisper")
  })

  it("actually finds the billable routes", () => {
    // Without this, a broken sweep would make every case below vacuous.
    expect(routes.length).toBeGreaterThanOrEqual(12)
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
