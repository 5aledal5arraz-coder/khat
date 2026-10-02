/**
 * `config/home-quotes.json` is gone (Khaled, 2026-10-02): 41 homepage quotes,
 * several of them fabricated — words attributed to real guests that appear
 * nowhere in their episodes. Nothing may read it again, or a reseed would
 * quietly put the fabricated quotes back into `home_quotes`.
 */
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const NEEDLE = ["home-quotes", "json"].join(".")

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(name)) out.push(p)
  }
  return out
}

describe("config/home-quotes.json is retired", () => {
  it("the file no longer exists — nor its pre-migration backup copy", () => {
    expect(existsSync(join(ROOT, "config", NEEDLE))).toBe(false)
    expect(existsSync(join(ROOT, "config", "backup-before-db-migration", NEEDLE))).toBe(false)
  })

  it("no script, route or library references it", () => {
    const files = ["scripts", "app", "lib"].flatMap((d) => walk(join(ROOT, d)))
    expect(files.length).toBeGreaterThan(50) // positive control: the scan sees the tree
    const hits = files.filter((f) => readFileSync(f, "utf8").includes(NEEDLE))
    expect(hits.map((f) => f.slice(ROOT.length + 1))).toEqual([])
  })
})
