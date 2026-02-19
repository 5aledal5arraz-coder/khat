import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
import type { HomeQuote } from "@/types/database"
import type { HomeQuotesConfig } from "@/types/home-content"

const defaultHomeQuotesConfig: HomeQuotesConfig = { quotes: [] }

const store = createConfigStore<HomeQuotesConfig>("home-quotes.json", defaultHomeQuotesConfig)

export async function getHomeQuotesConfig(): Promise<HomeQuotesConfig> {
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT * FROM home_quotes ORDER BY created_at DESC`
      )
      return { quotes: rows as HomeQuote[] }
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
      const { rows } = await pool!.query(
        `SELECT * FROM home_quotes WHERE status = $1 ORDER BY created_at DESC`,
        ["published"]
      )
      return rows as HomeQuote[]
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
      const { rows } = await pool!.query(
        `SELECT * FROM home_quotes WHERE id = $1 LIMIT 1`,
        [id]
      )
      if (rows[0]) return rows[0] as HomeQuote
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
      const { rows } = await pool!.query(
        `INSERT INTO home_quotes (id, text, attribution, episode_id, episode_slug, episode_title, theme, scheduled_date, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          newQuote.id, newQuote.text, newQuote.attribution,
          newQuote.episode_id || null, newQuote.episode_slug || null, newQuote.episode_title || null,
          newQuote.theme || null, newQuote.scheduled_date || null, newQuote.status,
          newQuote.created_at, newQuote.updated_at,
        ]
      )
      if (rows[0]) return rows[0] as HomeQuote
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
      const fields: string[] = []
      const values: unknown[] = []
      let paramIndex = 1

      for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = $${paramIndex}`)
        values.push(value)
        paramIndex++
      }
      fields.push(`updated_at = $${paramIndex}`)
      values.push(new Date().toISOString())
      paramIndex++
      values.push(id)

      const { rows } = await pool!.query(
        `UPDATE home_quotes SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      )
      if (rows[0]) return rows[0] as HomeQuote
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
      const { rows } = await pool!.query(
        `SELECT * FROM home_quotes WHERE episode_id = $1 AND status = $2`,
        [episodeId, "published"]
      )
      return rows as HomeQuote[]
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
      const { rowCount } = await pool!.query(
        `DELETE FROM home_quotes WHERE id = $1`,
        [id]
      )
      return (rowCount ?? 0) > 0
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
