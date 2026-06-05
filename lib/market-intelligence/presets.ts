/**
 * Phase X Step 1 — query preset loader.
 *
 * Presets live in config/market-presets.json. They are intentionally
 * generic (no Kuwait bias) so the system can build a market view that
 * doesn't predict our editorial taste.
 *
 * Override per call via `runPresetCollection(...)`'s 1st arg.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import type { MarketSource } from "./adapters"

export interface MarketPreset {
  /** Stable label, e.g. "relationships-ar". Used in logs + jobs. */
  label: string
  query: string
  language: string
  /** Optional source restriction; defaults to all sources. */
  sources?: MarketSource[]
}

interface PresetsFile {
  version: number
  presets: MarketPreset[]
}

let cached: PresetsFile | null = null

export async function getPresets(): Promise<MarketPreset[]> {
  if (cached) return cached.presets
  const file = path.resolve(process.cwd(), "config/market-presets.json")
  const body = await fs.readFile(file, "utf8")
  const parsed = JSON.parse(body) as PresetsFile
  cached = parsed
  return parsed.presets ?? []
}

export function clearPresetCache(): void {
  cached = null
}
