import { db } from "@/lib/db"
import { episodeQuotesConfig } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import type { ConfigQuote, EpisodeQuotesConfig, EpisodeQuotesEntry } from "@/types/episodes"
import type { Quote } from "@/types/database"

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
  if (!db) return {}

  const rows = await db.select().from(episodeQuotesConfig)
  const config: EpisodeQuotesConfig = {}
  for (const row of rows) {
    const entry = rowToEntry(row as unknown as Record<string, unknown>)
    config[entry.episodeId] = entry
  }
  return config
}

export async function saveQuotesConfig(config: EpisodeQuotesConfig): Promise<void> {
  if (!db) throw new Error("Database not available")

  const entries = Object.values(config)
  for (const e of entries) {
    await db.insert(episodeQuotesConfig).values({
      episode_id: e.episodeId,
      episode_title: e.episodeTitle,
      quotes: e.quotes as unknown[],
      transcript: e.transcript,
      status: e.status,
      generated_at: e.generatedAt,
      published_at: e.publishedAt,
    }).onConflictDoUpdate({
      target: episodeQuotesConfig.episode_id,
      set: {
        episode_title: e.episodeTitle,
        quotes: e.quotes as unknown[],
        transcript: e.transcript,
        status: e.status,
        generated_at: e.generatedAt,
        published_at: e.publishedAt,
      },
    })
  }
}

export async function getEpisodeQuotesEntry(episodeId: string): Promise<EpisodeQuotesEntry | null> {
  if (!db) return null

  const rows = await db.select().from(episodeQuotesConfig)
    .where(eq(episodeQuotesConfig.episode_id, episodeId))
    .limit(1)
  if (rows[0]) return rowToEntry(rows[0] as unknown as Record<string, unknown>)
  return null
}

export async function setEpisodeQuotesEntry(entry: EpisodeQuotesEntry): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.insert(episodeQuotesConfig).values({
    episode_id: entry.episodeId,
    episode_title: entry.episodeTitle,
    quotes: entry.quotes as unknown[],
    transcript: entry.transcript,
    status: entry.status,
    generated_at: entry.generatedAt,
    published_at: entry.publishedAt,
  }).onConflictDoUpdate({
    target: episodeQuotesConfig.episode_id,
    set: {
      episode_title: entry.episodeTitle,
      quotes: entry.quotes as unknown[],
      transcript: entry.transcript,
      status: entry.status,
      generated_at: entry.generatedAt,
      published_at: entry.publishedAt,
    },
  })
}

export async function deleteEpisodeQuotesEntry(episodeId: string): Promise<void> {
  if (!db) throw new Error("Database not available")
  await db.delete(episodeQuotesConfig).where(eq(episodeQuotesConfig.episode_id, episodeId))
}

export async function getPublishedQuotes(episodeId: string, guestId: string | null): Promise<Quote[]> {
  if (!db) return []

  const rows = await db.select().from(episodeQuotesConfig)
    .where(and(eq(episodeQuotesConfig.episode_id, episodeId), eq(episodeQuotesConfig.status, "published")))
    .limit(1)
  if (rows[0]) {
    const entry = rows[0]
    const quotes = entry.quotes as EpisodeQuotesEntry["quotes"]
    return quotes
      .filter((q: ConfigQuote) => !q.hidden)
      .map((q: ConfigQuote) => ({
        id: q.id,
        episode_id: episodeId,
        guest_id: guestId,
        text: q.text,
        theme: q.theme,
        created_at: entry.generated_at as string,
      }))
  }
  return []
}
