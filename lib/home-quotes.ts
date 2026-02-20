import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { homeQuotes } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import type { HomeQuote } from "@/types/database"
import type { HomeQuotesConfig } from "@/types/home-content"

const defaultHomeQuotesConfig: HomeQuotesConfig = { quotes: [] }

const store = createConfigStore<HomeQuotesConfig>("home-quotes.json", defaultHomeQuotesConfig)

export async function getHomeQuotesConfig(): Promise<HomeQuotesConfig> {
  if (USE_DB) {
    try {
      const rows = await db!.select().from(homeQuotes).orderBy(desc(homeQuotes.created_at))
      return { quotes: rows as unknown as HomeQuote[] }
    } catch (e) {
      console.error("getHomeQuotesConfig DB exception:", e)
    }
  }
  return store.read()
}

export async function getAllHomeQuotes(): Promise<HomeQuote[]> {
  const config = await getHomeQuotesConfig()
  return config.quotes
}

export async function getPublishedHomeQuotes(): Promise<HomeQuote[]> {
  if (USE_DB) {
    try {
      const rows = await db!.select().from(homeQuotes)
        .where(eq(homeQuotes.status, "published"))
        .orderBy(desc(homeQuotes.created_at))
      return rows as unknown as HomeQuote[]
    } catch (e) {
      console.error("getPublishedHomeQuotes DB exception:", e)
    }
  }
  const config = await store.read()
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
  if (USE_DB) {
    try {
      const rows = await db!.select().from(homeQuotes).where(eq(homeQuotes.id, id)).limit(1)
      if (rows[0]) return rows[0] as unknown as HomeQuote
      return null
    } catch (e) {
      console.error("getHomeQuoteById DB exception:", e)
    }
  }
  const config = await store.read()
  return config.quotes.find((q) => q.id === id) ?? null
}

export async function addHomeQuote(
  quote: Omit<HomeQuote, "id" | "created_at" | "updated_at">
): Promise<HomeQuote> {
  const now = new Date().toISOString()
  const newQuote: HomeQuote = {
    ...quote,
    id: `hq-${crypto.randomUUID()}`,
    created_at: now,
    updated_at: now,
  }

  if (USE_DB) {
    try {
      const rows = await db!.insert(homeQuotes).values({
        id: newQuote.id,
        text: newQuote.text,
        attribution: newQuote.attribution,
        episode_id: newQuote.episode_id || null,
        episode_slug: newQuote.episode_slug || null,
        episode_title: newQuote.episode_title || null,
        theme: newQuote.theme || null,
        scheduled_date: newQuote.scheduled_date || null,
        status: newQuote.status,
      }).returning()
      if (rows[0]) return rows[0] as unknown as HomeQuote
    } catch (e) {
      console.error("addHomeQuote DB exception:", e)
    }
  }

  const config = await store.read()
  config.quotes.push(newQuote)
  await store.write(config)
  return newQuote
}

export async function updateHomeQuote(
  id: string,
  updates: Partial<Omit<HomeQuote, "id" | "created_at">>
): Promise<HomeQuote | null> {
  if (USE_DB) {
    try {
      const rows = await db!.update(homeQuotes)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(homeQuotes.id, id))
        .returning()
      if (rows[0]) return rows[0] as unknown as HomeQuote
      return null
    } catch (e) {
      console.error("updateHomeQuote DB exception:", e)
    }
  }

  const config = await store.read()
  const index = config.quotes.findIndex((q) => q.id === id)
  if (index === -1) return null

  config.quotes[index] = {
    ...config.quotes[index],
    ...updates,
    updated_at: new Date().toISOString(),
  }
  await store.write(config)
  return config.quotes[index]
}

export async function getQuotesByEpisodeId(episodeId: string): Promise<HomeQuote[]> {
  if (USE_DB) {
    try {
      const rows = await db!.select().from(homeQuotes)
        .where(and(eq(homeQuotes.episode_id, episodeId), eq(homeQuotes.status, "published")))
      return rows as unknown as HomeQuote[]
    } catch (e) {
      console.error("getQuotesByEpisodeId DB exception:", e)
    }
  }
  const published = await getPublishedHomeQuotes()
  return published.filter((q) => q.episode_id === episodeId)
}

export async function deleteHomeQuote(id: string): Promise<boolean> {
  if (USE_DB) {
    try {
      const result = await db!.delete(homeQuotes).where(eq(homeQuotes.id, id))
      return (result.rowCount ?? 0) > 0
    } catch (e) {
      console.error("deleteHomeQuote DB exception:", e)
    }
  }

  const config = await store.read()
  const before = config.quotes.length
  config.quotes = config.quotes.filter((q) => q.id !== id)
  if (config.quotes.length === before) return false
  await store.write(config)
  return true
}
