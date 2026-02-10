import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { EpisodeOverride } from "@/types/ads"

const OVERRIDES_PATH = path.join(process.cwd(), "config", "episode-overrides.json")

export async function getEpisodeOverrides(): Promise<EpisodeOverride[]> {
  try {
    const data = await readFile(OVERRIDES_PATH, "utf-8")
    return JSON.parse(data) as EpisodeOverride[]
  } catch {
    return []
  }
}

export async function saveEpisodeOverrides(overrides: EpisodeOverride[]): Promise<void> {
  const configDir = path.dirname(OVERRIDES_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(OVERRIDES_PATH, JSON.stringify(overrides, null, 2), "utf-8")
}

export async function getEpisodeOverride(episodeId: string): Promise<EpisodeOverride | null> {
  const overrides = await getEpisodeOverrides()
  return overrides.find((o) => o.id === episodeId) || null
}

export async function setEpisodeOverride(override: EpisodeOverride): Promise<void> {
  const overrides = await getEpisodeOverrides()
  const existingIndex = overrides.findIndex((o) => o.id === override.id)

  if (existingIndex >= 0) {
    overrides[existingIndex] = override
  } else {
    overrides.push(override)
  }

  await saveEpisodeOverrides(overrides)
}

export async function deleteEpisodeOverride(episodeId: string): Promise<void> {
  const overrides = await getEpisodeOverrides()
  const filtered = overrides.filter((o) => o.id !== episodeId)
  await saveEpisodeOverrides(filtered)
}

export function applyOverrides<T extends { id: string; title: string; description?: string | null }>(
  episodes: T[],
  overrides: EpisodeOverride[]
): T[] {
  const overrideMap = new Map(overrides.map((o) => [o.id, o]))

  return episodes.map((ep) => {
    const override = overrideMap.get(ep.id)
    if (override) {
      const result = { ...ep }
      if (override.customTitle) {
        result.title = override.customTitle
      }
      if (override.customDescription) {
        (result as Record<string, unknown>).description = override.customDescription
      }
      return result
    }
    return ep
  })
}
