import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { EpisodeQuotesConfig, EpisodeQuotesEntry } from "@/types/episodes"
import type { Quote } from "@/types/database"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

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
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("episode_quotes_config")
        .select("episode_id, episode_title, quotes, transcript, status, generated_at, published_at")

      if (!error && data) {
        const config: EpisodeQuotesConfig = {}
        for (const row of data) {
          const entry = rowToEntry(row)
          config[entry.episodeId] = entry
        }
        return config
      }
      if (error) console.error("getQuotesConfig DB error:", error.message)
    } catch (e) {
      console.error("getQuotesConfig DB exception:", e)
    }
  }
  return store.read()
}

export async function saveQuotesConfig(config: EpisodeQuotesConfig): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const rows = Object.values(config).map((e) => ({
        episode_id: e.episodeId,
        episode_title: e.episodeTitle,
        quotes: e.quotes,
        transcript: e.transcript,
        status: e.status,
        generated_at: e.generatedAt,
        published_at: e.publishedAt,
      }))
      if (rows.length > 0) {
        const { error } = await supabase.from("episode_quotes_config").upsert(rows)
        if (!error) return
        console.error("saveQuotesConfig DB error:", error.message)
      } else {
        return
      }
    } catch (e) {
      console.error("saveQuotesConfig DB exception:", e)
    }
  }
  await store.write(config)
}

export async function getEpisodeQuotesEntry(episodeId: string): Promise<EpisodeQuotesEntry | null> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("episode_quotes_config")
        .select("episode_id, episode_title, quotes, transcript, status, generated_at, published_at")
        .eq("episode_id", episodeId)
        .maybeSingle()

      if (!error && data) return rowToEntry(data)
      if (!error && !data) return null
      if (error) console.error("getEpisodeQuotesEntry DB error:", error.message)
    } catch (e) {
      console.error("getEpisodeQuotesEntry DB exception:", e)
    }
  }
  const config = await store.read()
  return config[episodeId] || null
}

export async function setEpisodeQuotesEntry(entry: EpisodeQuotesEntry): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.from("episode_quotes_config").upsert({
        episode_id: entry.episodeId,
        episode_title: entry.episodeTitle,
        quotes: entry.quotes,
        transcript: entry.transcript,
        status: entry.status,
        generated_at: entry.generatedAt,
        published_at: entry.publishedAt,
      })
      if (!error) return
      console.error("setEpisodeQuotesEntry DB error:", error.message)
    } catch (e) {
      console.error("setEpisodeQuotesEntry DB exception:", e)
    }
  }
  const config = await store.read()
  config[entry.episodeId] = entry
  await store.write(config)
}

export async function deleteEpisodeQuotesEntry(episodeId: string): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase
        .from("episode_quotes_config")
        .delete()
        .eq("episode_id", episodeId)
      if (!error) return
      console.error("deleteEpisodeQuotesEntry DB error:", error.message)
    } catch (e) {
      console.error("deleteEpisodeQuotesEntry DB exception:", e)
    }
  }
  const config = await store.read()
  delete config[episodeId]
  await store.write(config)
}

export async function getPublishedQuotes(episodeId: string, guestId: string | null): Promise<Quote[]> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("episode_quotes_config")
        .select("quotes, generated_at")
        .eq("episode_id", episodeId)
        .eq("status", "published")
        .maybeSingle()

      if (!error && data) {
        const quotes = data.quotes as EpisodeQuotesEntry["quotes"]
        return quotes
          .filter((q) => !q.hidden)
          .map((q) => ({
            id: q.id,
            episode_id: episodeId,
            guest_id: guestId,
            text: q.text,
            theme: q.theme,
            created_at: data.generated_at,
          }))
      }
      if (!error && !data) return []
      if (error) console.error("getPublishedQuotes DB error:", error.message)
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
