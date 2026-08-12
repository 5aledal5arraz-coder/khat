/**
 * The structural half of the soft-404 fix, and the half that survives in CI.
 *
 * `tests/http/not-found-status.test.ts` proves the status codes against a real
 * server; this one states the rule that produced them, so the fix cannot be
 * quietly undone by dropping a `loading.tsx` one directory too high.
 *
 * THE RULE: a `loading.tsx` is a Suspense boundary around EVERYTHING below it.
 * Once that boundary flushes, the response status is committed as 200 and a
 * later `notFound()` can no longer change it — the not-found UI still renders,
 * which is precisely why the defect was invisible for so long. So a public
 * `loading.tsx` may only cover its OWN page: its directory must contain no
 * nested route segment. Scope it with a route group — `app/episodes/(list)/` —
 * which changes no URL.
 *
 * Admin is excluded on purpose: it is behind a login, is never crawled, and
 * `notFound()` there is not an SEO surface.
 */

import { describe, it, expect } from "vitest"
import { readdirSync, existsSync } from "node:fs"
import path from "node:path"

const APP = path.resolve(__dirname, "..", "..", "app")

/** Does this directory, or anything under it, define a routable page? */
function containsPage(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "page.tsx") return true
    if (entry.isDirectory() && containsPage(path.join(dir, entry.name))) return true
  }
  return false
}

/** Every directory under app/ holding a `loading.tsx`, admin excluded. */
function publicLoadingDirs(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const child = path.join(dir, entry.name)
    if (path.relative(APP, child) === "admin") continue
    if (existsSync(path.join(child, "loading.tsx"))) found.push(child)
    publicLoadingDirs(child, found)
  }
  if (dir === APP && existsSync(path.join(APP, "loading.tsx"))) found.push(APP)
  return found
}

describe("a public loading.tsx may not wrap a sibling route", () => {
  it("finds the boundaries it is meant to be checking", () => {
    // Sight check. If the walker ever returns nothing, every assertion below
    // passes for free — a green suite proving absolutely nothing.
    expect(publicLoadingDirs(APP).length).toBeGreaterThan(0)
  })

  it.each(publicLoadingDirs(APP).map((d) => [path.relative(APP, d) || ".", d]))(
    "app/%s — covers its own page only",
    (rel, dir) => {
      const nested = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && containsPage(path.join(dir, e.name)))
        .map((e) => e.name)

      expect(
        nested,
        `app/${rel === "." ? "" : rel + "/"}loading.tsx also suspends ${nested.join(", ")} — ` +
          `any notFound() under those segments will answer HTTP 200. Move the page + ` +
          `loading.tsx into a route group, e.g. app/${rel === "." ? "" : rel + "/"}(list)/.`,
      ).toEqual([])
    },
  )
})
