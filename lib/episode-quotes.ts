import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { EpisodeQuotesConfig, EpisodeQuotesEntry } from "@/types/ads"
import type { Quote } from "@/types/database"

const QUOTES_CONFIG_PATH = path.join(process.cwd(), "config", "episode-quotes.json")

export async function getQuotesConfig(): Promise<EpisodeQuotesConfig> {
  try {
    const data = await readFile(QUOTES_CONFIG_PATH, "utf-8")
    return JSON.parse(data) as EpisodeQuotesConfig
  } catch {
    return {}
  }
}

export async function saveQuotesConfig(config: EpisodeQuotesConfig): Promise<void> {
  const configDir = path.dirname(QUOTES_CONFIG_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(QUOTES_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}

export async function getEpisodeQuotesEntry(episodeId: string): Promise<EpisodeQuotesEntry | null> {
  const config = await getQuotesConfig()
  return config[episodeId] || null
}

export async function setEpisodeQuotesEntry(entry: EpisodeQuotesEntry): Promise<void> {
  const config = await getQuotesConfig()
  config[entry.episodeId] = entry
  await saveQuotesConfig(config)
}

export async function deleteEpisodeQuotesEntry(episodeId: string): Promise<void> {
  const config = await getQuotesConfig()
  delete config[episodeId]
  await saveQuotesConfig(config)
}

export async function getPublishedQuotes(episodeId: string, guestId: string | null): Promise<Quote[]> {
  const config = await getQuotesConfig()
  const entry = config[episodeId]
  if (!entry || entry.status !== "published") return []

  return entry.quotes
    .filter((q) => !q.hidden)
    .map((q) => ({
      id: q.id,
      episode_id: episodeId,
      guest_id: guestId,
      text: q.text,
      theme: q.theme,
      created_at: entry.generatedAt,
    }))
}
