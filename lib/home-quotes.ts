import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { HomeQuote } from "@/types/database"
import type { HomeQuotesConfig } from "@/types/ads"
import { defaultHomeQuotesConfig } from "@/types/ads"

const CONFIG_PATH = path.join(process.cwd(), "config", "home-quotes.json")

export async function getHomeQuotesConfig(): Promise<HomeQuotesConfig> {
  try {
    const data = await readFile(CONFIG_PATH, "utf-8")
    return JSON.parse(data) as HomeQuotesConfig
  } catch {
    return defaultHomeQuotesConfig
  }
}

async function saveConfig(config: HomeQuotesConfig): Promise<void> {
  const configDir = path.dirname(CONFIG_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}

export async function getAllHomeQuotes(): Promise<HomeQuote[]> {
  const config = await getHomeQuotesConfig()
  return config.quotes
}

export async function getPublishedHomeQuotes(): Promise<HomeQuote[]> {
  const config = await getHomeQuotesConfig()
  return config.quotes.filter((q) => q.status === "published")
}

export async function getTodaysQuote(): Promise<HomeQuote | null> {
  const published = await getPublishedHomeQuotes()
  if (published.length === 0) return null

  const today = new Date().toISOString().split("T")[0]

  // Check for scheduled quote matching today
  const scheduled = published.find((q) => q.scheduled_date === today)
  if (scheduled) return scheduled

  // Fallback: deterministic day-of-year rotation
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24))
  const index = dayOfYear % published.length

  return published[index]
}

export async function getHomeQuoteById(id: string): Promise<HomeQuote | null> {
  const config = await getHomeQuotesConfig()
  return config.quotes.find((q) => q.id === id) ?? null
}

export async function addHomeQuote(
  quote: Omit<HomeQuote, "id" | "created_at" | "updated_at">
): Promise<HomeQuote> {
  const config = await getHomeQuotesConfig()
  const now = new Date().toISOString()
  const newQuote: HomeQuote = {
    ...quote,
    id: `hq-${Date.now()}`,
    created_at: now,
    updated_at: now,
  }
  config.quotes.push(newQuote)
  await saveConfig(config)
  return newQuote
}

export async function updateHomeQuote(
  id: string,
  updates: Partial<Omit<HomeQuote, "id" | "created_at">>
): Promise<HomeQuote | null> {
  const config = await getHomeQuotesConfig()
  const index = config.quotes.findIndex((q) => q.id === id)
  if (index === -1) return null

  config.quotes[index] = {
    ...config.quotes[index],
    ...updates,
    updated_at: new Date().toISOString(),
  }
  await saveConfig(config)
  return config.quotes[index]
}

export async function getQuotesByEpisodeId(episodeId: string): Promise<HomeQuote[]> {
  const published = await getPublishedHomeQuotes()
  return published.filter((q) => q.episode_id === episodeId)
}

export async function deleteHomeQuote(id: string): Promise<boolean> {
  const config = await getHomeQuotesConfig()
  const before = config.quotes.length
  config.quotes = config.quotes.filter((q) => q.id !== id)
  if (config.quotes.length === before) return false
  await saveConfig(config)
  return true
}
