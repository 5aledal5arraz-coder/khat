/**
 * Phase X Step 2 — Editorial lens loader.
 *
 * Lenses live in config/lenses.json. They are hand-curated; the loader
 * just reads + validates. Caching is a single in-process Map (no TTL —
 * the file is committed, restart-only).
 */

import { promises as fs } from "node:fs"
import path from "node:path"

export interface EditorialLens {
  key: string
  name_ar: string
  name_en: string
  description: string
  question_kinds: string[]
  avoid: string[]
}

interface LensesFile {
  version: number
  lenses: EditorialLens[]
}

let cached: EditorialLens[] | null = null

/**
 * Loads + validates the lens registry. Throws on shape errors so a bad
 * config doesn't reach the generator.
 */
export async function loadLenses(): Promise<EditorialLens[]> {
  if (cached) return cached
  const file = path.resolve(process.cwd(), "config/lenses.json")
  const body = await fs.readFile(file, "utf8")
  const parsed = JSON.parse(body) as LensesFile
  if (!Array.isArray(parsed.lenses)) {
    throw new Error("lenses.json: missing 'lenses' array")
  }
  for (const l of parsed.lenses) {
    validateLens(l)
  }
  // Reject duplicate keys.
  const keys = new Set<string>()
  for (const l of parsed.lenses) {
    if (keys.has(l.key)) throw new Error(`lenses.json: duplicate key "${l.key}"`)
    keys.add(l.key)
  }
  cached = parsed.lenses
  return cached
}

export function clearLensCache(): void {
  cached = null
}

export async function getLensByKey(key: string): Promise<EditorialLens | null> {
  const all = await loadLenses()
  return all.find((l) => l.key === key) ?? null
}

function validateLens(l: unknown): asserts l is EditorialLens {
  if (!l || typeof l !== "object") {
    throw new Error("lens entry must be an object")
  }
  const o = l as Record<string, unknown>
  for (const f of ["key", "name_ar", "name_en", "description"] as const) {
    if (typeof o[f] !== "string" || (o[f] as string).trim() === "") {
      throw new Error(`lens missing required string field "${f}"`)
    }
  }
  if (!Array.isArray(o.question_kinds) || o.question_kinds.length === 0) {
    throw new Error(`lens "${o.key}" must have non-empty question_kinds[]`)
  }
  if (!Array.isArray(o.avoid)) {
    throw new Error(`lens "${o.key}" must have avoid[] (may be empty)`)
  }
}
