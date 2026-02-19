import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
import type { EpisodeQuotesConfig, EpisodeQuotesEntry } from "@/types/episodes"
import type { Quote } from "@/types/database"

const store = createConfigStore<EpisodeQuotesConfig>("episode-quotes.json", {})

// DB row → app type
function rowToEntry(row: Record<string, unknown>): EpisodeQuotesEntry {
  return {
    episodeId: row.episode_id as string,
    episodeTitle: row.episode_title as string,
    quotes: row.quotes as EpisodeQuotesEntry["quotes"],
    transcript: (row.transcript as string) || null,
    status: row.status as "draft" | "published",
    generatedAt: row.generated_at as string,
    publishedAt: (row.published_at as string) || null,
  }
}

export async function getQuotesConfig(): Promise<EpisodeQuotesConfig> {
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT episode_id, episode_title, quotes, transcript, status, generated_at, published_at
         FROM episode_quotes_config`
      )
      const config: EpisodeQuotesConfig = {}
      for (const row of rows) {
        const entry = rowToEntry(row)
        config[entry.episodeId] = entry
      }
      return config
    } catch (e) {
      console.error("getQuotesConfig DB exception:", e)
    }
  }
  return store.read()
}

export async function saveQuotesConfig(config: EpisodeQuotesConfig): Promise<void> {
  if (USE_DB) {
    try {
      const entries = Object.values(config)
      for (const e of entries) {
        await pool!.query(
          `INSERT INTO episode_quotes_config (episode_id, episode_title, quotes, transcript, status, generated_at, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (episode_id) DO UPDATE SET
             episode_title = EXCLUDED.episode_title,
             quotes = EXCLUDED.quotes,
             transcript = EXCLUDED.transcript,
             status = EXCLUDED.status,
             generated_at = EXCLUDED.generated_at,
             published_at = EXCLUDED.published_at`,
          [e.episodeId, e.episodeTitle, JSON.stringify(e.quotes), e.transcript, e.status, e.generatedAt, e.publishedAt]
        )
      }
      return
    } catch (e) {
      console.error("saveQuotesConfig DB exception:", e)
    }
  }
  await store.write(config)
}

export async function getEpisodeQuotesEntry(episodeId: string): Promise<EpisodeQuotesEntry | null> {
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT episode_id, episode_title, quotes, transcript, status, generated_at, published_at
         FROM episode_quotes_config WHERE episode_id = $1 LIMIT 1`,
        [episodeId]
      )
      if (rows[0]) return rowToEntry(rows[0])
      return null
    } catch (e) {
      console.error("getEpisodeQuotesEntry DB exception:", e)
    }
  }
  const config = await store.read()
  return config[episodeId] || null
}

export async function setEpisodeQuotesEntry(entry: EpisodeQuotesEntry): Promise<void> {
  if (USE_DB) {
    try {
      await pool!.query(
        `INSERT INTO episode_quotes_config (episode_id, episode_title, quotes, transcript, status, generated_at, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (episode_id) DO UPDATE SET
           episode_title = EXCLUDED.episode_title,
           quotes = EXCLUDED.quotes,
           transcript = EXCLUDED.transcript,
           status = EXCLUDED.status,
           generated_at = EXCLUDED.generated_at,
           published_at = EXCLUDED.published_at`,
        [entry.episodeId, entry.episodeTitle, JSON.stringify(entry.quotes), entry.transcript, entry.status, entry.generatedAt, entry.publishedAt]
      )
      return
    } catch (e) {
      console.error("setEpisodeQuotesEntry DB exception:", e)
    }
  }
  const config = await store.read()
  config[entry.episodeId] = entry
  await store.write(config)
}

export async function deleteEpisodeQuotesEntry(episodeId: string): Promise<void> {
  if (USE_DB) {
    try {
      await pool!.query(
        `DELETE FROM episode_quotes_config WHERE episode_id = $1`,
        [episodeId]
      )
      return
    } catch (e) {
      console.error("deleteEpisodeQuotesEntry DB exception:", e)
    }
  }
  const config = await store.read()
  delete config[episodeId]
  await store.write(config)
}

export async function getPublishedQuotes(episodeId: string, guestId: string | null): Promise<Quote[]> {
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT quotes, generated_at FROM episode_quotes_config
         WHERE episode_id = $1 AND status = $2 LIMIT 1`,
        [episodeId, "published"]
      )
      if (rows[0]) {
        const quotes = rows[0].quotes as EpisodeQuotesEntry["quotes"]
        return quotes
          .filter((q) => !q.hidden)
          .map((q) => ({
            id: q.id,
            episode_id: episodeId,
            guest_id: guestId,
            text: q.text,
            theme: q.theme,
            created_at: rows[0].generated_at,
          }))
      }
      return []
    } catch (e) {
      console.error("getPublishedQuotes DB exception:", e)
    }
  }

  const config = await store.read()
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
