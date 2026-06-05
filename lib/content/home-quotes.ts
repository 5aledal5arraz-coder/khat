import { db } from "@/lib/db"
import { homeQuotes } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import type { HomeQuote } from "@/types/database"

interface HomeQuotesConfig {
  quotes: HomeQuote[]
}

export async function getHomeQuotesConfig(): Promise<HomeQuotesConfig> {
  if (!db) return { quotes: [] }

  const rows = await db.select().from(homeQuotes).orderBy(desc(homeQuotes.created_at))
  return { quotes: rows as unknown as HomeQuote[] }
}

export async function getAllHomeQuotes(): Promise<HomeQuote[]> {
  const config = await getHomeQuotesConfig()
  return config.quotes
}

export async function getPublishedHomeQuotes(): Promise<HomeQuote[]> {
  if (!db) return []

  const rows = await db.select().from(homeQuotes)
    .where(eq(homeQuotes.status, "published"))
    .orderBy(desc(homeQuotes.created_at))
  return rows as unknown as HomeQuote[]
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
  if (!db) return null

  const rows = await db.select().from(homeQuotes).where(eq(homeQuotes.id, id)).limit(1)
  if (rows[0]) return rows[0] as unknown as HomeQuote
  return null
}

export async function addHomeQuote(
  quote: Omit<HomeQuote, "id" | "created_at" | "updated_at">
): Promise<HomeQuote> {
  if (!db) throw new Error("Database not available")

  const newId = `hq-${crypto.randomUUID()}`
  const rows = await db.insert(homeQuotes).values({
    id: newId,
    text: quote.text,
    attribution: quote.attribution,
    episode_id: quote.episode_id || null,
    episode_slug: quote.episode_slug || null,
    episode_title: quote.episode_title || null,
    theme: quote.theme || null,
    scheduled_date: quote.scheduled_date || null,
    status: quote.status,
  }).returning()

  return rows[0] as unknown as HomeQuote
}

export async function updateHomeQuote(
  id: string,
  updates: Partial<Omit<HomeQuote, "id" | "created_at">>
): Promise<HomeQuote | null> {
  if (!db) throw new Error("Database not available")

  const rows = await db.update(homeQuotes)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(homeQuotes.id, id))
    .returning()
  if (rows[0]) return rows[0] as unknown as HomeQuote
  return null
}

export async function getQuotesByEpisodeId(episodeId: string): Promise<HomeQuote[]> {
  if (!db) return []

  const rows = await db.select().from(homeQuotes)
    .where(and(eq(homeQuotes.episode_id, episodeId), eq(homeQuotes.status, "published")))
  return rows as unknown as HomeQuote[]
}

export async function deleteHomeQuote(id: string): Promise<boolean> {
  if (!db) throw new Error("Database not available")

  const result = await db.delete(homeQuotes).where(eq(homeQuotes.id, id))
  return (result.rowCount ?? 0) > 0
}
