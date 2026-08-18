import { db } from "@/lib/db"
import { homeQuotes } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import type { HomeQuote } from "@/types/database"


export async function getPublishedHomeQuotes(): Promise<HomeQuote[]> {
  if (!db) return []

  const rows = await db.select().from(homeQuotes)
    .where(eq(homeQuotes.status, "published"))
    .orderBy(desc(homeQuotes.created_at))
  return rows as unknown as HomeQuote[]
}


export async function getHomeQuoteById(id: string): Promise<HomeQuote | null> {
  if (!db) return null

  const rows = await db.select().from(homeQuotes).where(eq(homeQuotes.id, id)).limit(1)
  if (rows[0]) return rows[0] as unknown as HomeQuote
  return null
}



export async function getQuotesByEpisodeId(episodeId: string): Promise<HomeQuote[]> {
  if (!db) return []

  const rows = await db.select().from(homeQuotes)
    .where(and(eq(homeQuotes.episode_id, episodeId), eq(homeQuotes.status, "published")))
  return rows as unknown as HomeQuote[]
}

