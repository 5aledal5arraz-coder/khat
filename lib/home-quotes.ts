import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { HomeQuote } from "@/types/database"
import type { HomeQuotesConfig } from "@/types/home-content"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

const defaultHomeQuotesConfig: HomeQuotesConfig = { quotes: [] }

const store = createConfigStore<HomeQuotesConfig>("home-quotes.json", defaultHomeQuotesConfig)

export async function getHomeQuotesConfig(): Promise<HomeQuotesConfig> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("home_quotes")
        .select("*")
        .order("created_at", { ascending: false })

      if (!error && data) return { quotes: data as HomeQuote[] }
      if (error) console.error("getHomeQuotesConfig DB error:", error.message)
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
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("home_quotes")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false })

      if (!error && data) return data as HomeQuote[]
      if (error) console.error("getPublishedHomeQuotes DB error:", error.message)
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
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("home_quotes")
        .select("*")
        .eq("id", id)
        .maybeSingle()

      if (!error && data) return data as HomeQuote
      if (!error && !data) return null
      if (error) console.error("getHomeQuoteById DB error:", error.message)
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

  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("home_quotes")
        .insert(newQuote)
        .select()
        .single()

      if (!error && data) return data as HomeQuote
      if (error) console.error("addHomeQuote DB error:", error.message)
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
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("home_quotes")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()

      if (!error && data) return data as HomeQuote
      if (error) console.error("updateHomeQuote DB error:", error.message)
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
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("home_quotes")
        .select("*")
        .eq("episode_id", episodeId)
        .eq("status", "published")

      if (!error && data) return data as HomeQuote[]
      if (error) console.error("getQuotesByEpisodeId DB error:", error.message)
    } catch (e) {
      console.error("getQuotesByEpisodeId DB exception:", e)
    }
  }
  const published = await getPublishedHomeQuotes()
  return published.filter((q) => q.episode_id === episodeId)
}

export async function deleteHomeQuote(id: string): Promise<boolean> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase
        .from("home_quotes")
        .delete()
        .eq("id", id)

      if (!error) return true
      console.error("deleteHomeQuote DB error:", error.message)
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
