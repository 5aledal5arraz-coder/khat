import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { EmotionalPath, PathSlug } from "@/types/database"
import type { EmotionalPathsConfig } from "@/types/home-content"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

const defaultEmotionalPathsConfig: EmotionalPathsConfig = {
  paths: [
    {
      id: 'path-1',
      slug: 'understanding-people',
      title: 'فهم الناس',
      subtitle: 'حلقات عن العلاقات والتواصل والتعاطف',
      icon: 'Users',
      color: '#6366f1',
      episode_ids: [],
      quote_ids: [],
      order: 1,
    },
    {
      id: 'path-2',
      slug: 'motivation-work',
      title: 'الدافع والعمل',
      subtitle: 'حلقات عن الطموح والإنجاز والمهنة',
      icon: 'Rocket',
      color: '#f59e0b',
      episode_ids: [],
      quote_ids: [],
      order: 2,
    },
    {
      id: 'path-3',
      slug: 'faith-meaning',
      title: 'الإيمان والمعنى',
      subtitle: 'حلقات عن الروحانيات والهدف والقيم',
      icon: 'Heart',
      color: '#10b981',
      episode_ids: [],
      quote_ids: [],
      order: 3,
    },
    {
      id: 'path-4',
      slug: 'self-awareness',
      title: 'وعي الذات',
      subtitle: 'حلقات عن النمو الشخصي والتأمل الذاتي',
      icon: 'Eye',
      color: '#8b5cf6',
      episode_ids: [],
      quote_ids: [],
      order: 4,
    },
  ],
}

const store = createConfigStore<EmotionalPathsConfig>("emotional-paths.json", defaultEmotionalPathsConfig)

// DB row → app type
function rowToPath(row: Record<string, unknown>): EmotionalPath {
  return {
    id: row.id as string,
    slug: row.slug as PathSlug,
    title: row.title as string,
    subtitle: row.subtitle as string,
    icon: row.icon as string,
    color: row.color as string,
    episode_ids: (row.episode_ids as string[]) || [],
    quote_ids: (row.quote_ids as string[]) || [],
    order: row.order as number,
  }
}

export async function getPathsConfig(): Promise<EmotionalPathsConfig> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("emotional_paths")
        .select("*")
        .order("order")

      if (!error && data) return { paths: data.map(rowToPath) }
      if (error) console.error("getPathsConfig DB error:", error.message)
    } catch (e) {
      console.error("getPathsConfig DB exception:", e)
    }
  }
  return store.read()
}

export async function getAllPaths(): Promise<EmotionalPath[]> {
  const config = await getPathsConfig()
  return config.paths.sort((a, b) => a.order - b.order)
}

export async function getPathBySlug(slug: PathSlug): Promise<EmotionalPath | null> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("emotional_paths")
        .select("*")
        .eq("slug", slug)
        .maybeSingle()

      if (!error && data) return rowToPath(data)
      if (!error && !data) return null
      if (error) console.error("getPathBySlug DB error:", error.message)
    } catch (e) {
      console.error("getPathBySlug DB exception:", e)
    }
  }
  const config = await store.read()
  return config.paths.find((p) => p.slug === slug) ?? null
}

export async function updatePath(
  id: string,
  updates: Partial<Omit<EmotionalPath, "id" | "slug">>
): Promise<EmotionalPath | null> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("emotional_paths")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (!error && data) return rowToPath(data)
      if (error) console.error("updatePath DB error:", error.message)
    } catch (e) {
      console.error("updatePath DB exception:", e)
    }
  }

  const config = await store.read()
  const index = config.paths.findIndex((p) => p.id === id)
  if (index === -1) return null

  config.paths[index] = { ...config.paths[index], ...updates }
  await store.write(config)
  return config.paths[index]
}

export async function getPathsForEpisode(episodeId: string): Promise<EmotionalPath[]> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("emotional_paths")
        .select("*")
        .contains("episode_ids", [episodeId])
        .order("order")

      if (!error && data) return data.map(rowToPath)
      if (error) console.error("getPathsForEpisode DB error:", error.message)
    } catch (e) {
      console.error("getPathsForEpisode DB exception:", e)
    }
  }
  const config = await store.read()
  return config.paths
    .filter((p) => p.episode_ids.includes(episodeId))
    .sort((a, b) => a.order - b.order)
}

export async function assignEpisodeToPath(pathId: string, episodeId: string): Promise<boolean> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      // Fetch current, add to array, update
      const { data, error: fetchErr } = await supabase
        .from("emotional_paths")
        .select("episode_ids")
        .eq("id", pathId)
        .single()

      if (fetchErr || !data) return false
      const ids = (data.episode_ids as string[]) || []
      if (ids.includes(episodeId)) return true

      const { error } = await supabase
        .from("emotional_paths")
        .update({ episode_ids: [...ids, episodeId] })
        .eq("id", pathId)

      if (!error) return true
      console.error("assignEpisodeToPath DB error:", error.message)
    } catch (e) {
      console.error("assignEpisodeToPath DB exception:", e)
    }
  }

  const config = await store.read()
  const p = config.paths.find((p) => p.id === pathId)
  if (!p) return false
  if (p.episode_ids.includes(episodeId)) return true

  p.episode_ids.push(episodeId)
  await store.write(config)
  return true
}

export async function removeEpisodeFromPath(pathId: string, episodeId: string): Promise<boolean> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error: fetchErr } = await supabase
        .from("emotional_paths")
        .select("episode_ids")
        .eq("id", pathId)
        .single()

      if (fetchErr || !data) return false
      const ids = ((data.episode_ids as string[]) || []).filter((id) => id !== episodeId)

      const { error } = await supabase
        .from("emotional_paths")
        .update({ episode_ids: ids })
        .eq("id", pathId)

      if (!error) return true
      console.error("removeEpisodeFromPath DB error:", error.message)
    } catch (e) {
      console.error("removeEpisodeFromPath DB exception:", e)
    }
  }

  const config = await store.read()
  const p = config.paths.find((p) => p.id === pathId)
  if (!p) return false

  p.episode_ids = p.episode_ids.filter((id) => id !== episodeId)
  await store.write(config)
  return true
}

export async function assignQuoteToPath(pathId: string, quoteId: string): Promise<boolean> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error: fetchErr } = await supabase
        .from("emotional_paths")
        .select("quote_ids")
        .eq("id", pathId)
        .single()

      if (fetchErr || !data) return false
      const ids = (data.quote_ids as string[]) || []
      if (ids.includes(quoteId)) return true

      const { error } = await supabase
        .from("emotional_paths")
        .update({ quote_ids: [...ids, quoteId] })
        .eq("id", pathId)

      if (!error) return true
      console.error("assignQuoteToPath DB error:", error.message)
    } catch (e) {
      console.error("assignQuoteToPath DB exception:", e)
    }
  }

  const config = await store.read()
  const p = config.paths.find((p) => p.id === pathId)
  if (!p) return false
  if (p.quote_ids.includes(quoteId)) return true

  p.quote_ids.push(quoteId)
  await store.write(config)
  return true
}

export async function removeQuoteFromPath(pathId: string, quoteId: string): Promise<boolean> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error: fetchErr } = await supabase
        .from("emotional_paths")
        .select("quote_ids")
        .eq("id", pathId)
        .single()

      if (fetchErr || !data) return false
      const ids = ((data.quote_ids as string[]) || []).filter((id) => id !== quoteId)

      const { error } = await supabase
        .from("emotional_paths")
        .update({ quote_ids: ids })
        .eq("id", pathId)

      if (!error) return true
      console.error("removeQuoteFromPath DB error:", error.message)
    } catch (e) {
      console.error("removeQuoteFromPath DB exception:", e)
    }
  }

  const config = await store.read()
  const p = config.paths.find((p) => p.id === pathId)
  if (!p) return false

  p.quote_ids = p.quote_ids.filter((id) => id !== quoteId)
  await store.write(config)
  return true
}
