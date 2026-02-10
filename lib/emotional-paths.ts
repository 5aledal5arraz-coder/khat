import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { EmotionalPath, PathSlug } from "@/types/database"
import type { EmotionalPathsConfig } from "@/types/ads"
import { defaultEmotionalPathsConfig } from "@/types/ads"

const CONFIG_PATH = path.join(process.cwd(), "config", "emotional-paths.json")

export async function getPathsConfig(): Promise<EmotionalPathsConfig> {
  try {
    const data = await readFile(CONFIG_PATH, "utf-8")
    return JSON.parse(data) as EmotionalPathsConfig
  } catch {
    return defaultEmotionalPathsConfig
  }
}

async function saveConfig(config: EmotionalPathsConfig): Promise<void> {
  const configDir = path.dirname(CONFIG_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}

export async function getAllPaths(): Promise<EmotionalPath[]> {
  const config = await getPathsConfig()
  return config.paths.sort((a, b) => a.order - b.order)
}

export async function getPathBySlug(slug: PathSlug): Promise<EmotionalPath | null> {
  const config = await getPathsConfig()
  return config.paths.find((p) => p.slug === slug) ?? null
}

export async function updatePath(
  id: string,
  updates: Partial<Omit<EmotionalPath, "id" | "slug">>
): Promise<EmotionalPath | null> {
  const config = await getPathsConfig()
  const index = config.paths.findIndex((p) => p.id === id)
  if (index === -1) return null

  config.paths[index] = { ...config.paths[index], ...updates }
  await saveConfig(config)
  return config.paths[index]
}

export async function getPathsForEpisode(episodeId: string): Promise<EmotionalPath[]> {
  const config = await getPathsConfig()
  return config.paths
    .filter((p) => p.episode_ids.includes(episodeId))
    .sort((a, b) => a.order - b.order)
}

export async function assignEpisodeToPath(pathId: string, episodeId: string): Promise<boolean> {
  const config = await getPathsConfig()
  const p = config.paths.find((p) => p.id === pathId)
  if (!p) return false
  if (p.episode_ids.includes(episodeId)) return true

  p.episode_ids.push(episodeId)
  await saveConfig(config)
  return true
}

export async function removeEpisodeFromPath(pathId: string, episodeId: string): Promise<boolean> {
  const config = await getPathsConfig()
  const p = config.paths.find((p) => p.id === pathId)
  if (!p) return false

  p.episode_ids = p.episode_ids.filter((id) => id !== episodeId)
  await saveConfig(config)
  return true
}

export async function assignQuoteToPath(pathId: string, quoteId: string): Promise<boolean> {
  const config = await getPathsConfig()
  const p = config.paths.find((p) => p.id === pathId)
  if (!p) return false
  if (p.quote_ids.includes(quoteId)) return true

  p.quote_ids.push(quoteId)
  await saveConfig(config)
  return true
}

export async function removeQuoteFromPath(pathId: string, quoteId: string): Promise<boolean> {
  const config = await getPathsConfig()
  const p = config.paths.find((p) => p.id === pathId)
  if (!p) return false

  p.quote_ids = p.quote_ids.filter((id) => id !== quoteId)
  await saveConfig(config)
  return true
}
