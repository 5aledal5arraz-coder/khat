import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { DailyReflection } from "@/types/database"
import type { DailyReflectionsConfig } from "@/types/home-content"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

const defaultDailyReflectionsConfig: DailyReflectionsConfig = { reflections: [] }

const store = createConfigStore<DailyReflectionsConfig>("daily-reflections.json", defaultDailyReflectionsConfig)

export async function getReflectionsConfig(): Promise<DailyReflectionsConfig> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("daily_reflections")
        .select("*")
        .order("date", { ascending: false })

      if (!error && data) return { reflections: data as DailyReflection[] }
      if (error) console.error("getReflectionsConfig DB error:", error.message)
    } catch (e) {
      console.error("getReflectionsConfig DB exception:", e)
    }
  }
  return store.read()
}

export async function getAllReflections(): Promise<DailyReflection[]> {
  const config = await getReflectionsConfig()
  return config.reflections
}

export async function getTodaysReflection(): Promise<DailyReflection | null> {
  const today = new Date().toISOString().split("T")[0]

  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()

      // Check for today's reflection
      const { data: todayData, error: todayErr } = await supabase
        .from("daily_reflections")
        .select("*")
        .eq("date", today)
        .eq("status", "published")
        .maybeSingle()

      if (!todayErr && todayData) return todayData as DailyReflection

      // Fallback: most recent published
      const { data: recentData, error: recentErr } = await supabase
        .from("daily_reflections")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!recentErr && recentData) return recentData as DailyReflection
      return null
    } catch (e) {
      console.error("getTodaysReflection DB exception:", e)
    }
  }

  const config = await store.read()
  const published = config.reflections.filter((r) => r.status === "published")
  if (published.length === 0) return null

  const todayReflection = published.find((r) => r.date === today)
  if (todayReflection) return todayReflection

  // Fallback: most recent published reflection
  const sorted = [...published].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  return sorted[0] ?? null
}

export async function getReflectionById(id: string): Promise<DailyReflection | null> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("daily_reflections")
        .select("*")
        .eq("id", id)
        .maybeSingle()

      if (!error && data) return data as DailyReflection
      if (!error && !data) return null
      if (error) console.error("getReflectionById DB error:", error.message)
    } catch (e) {
      console.error("getReflectionById DB exception:", e)
    }
  }
  const config = await store.read()
  return config.reflections.find((r) => r.id === id) ?? null
}

export async function addReflection(
  reflection: Omit<DailyReflection, "id" | "created_at" | "updated_at">
): Promise<DailyReflection> {
  const now = new Date().toISOString()
  const newReflection: DailyReflection = {
    ...reflection,
    id: `dr-${crypto.randomUUID()}`,
    created_at: now,
    updated_at: now,
  }

  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("daily_reflections")
        .insert(newReflection)
        .select()
        .single()

      if (!error && data) return data as DailyReflection
      if (error) console.error("addReflection DB error:", error.message)
    } catch (e) {
      console.error("addReflection DB exception:", e)
    }
  }

  const config = await store.read()
  config.reflections.push(newReflection)
  await store.write(config)
  return newReflection
}

export async function updateReflection(
  id: string,
  updates: Partial<Omit<DailyReflection, "id" | "created_at">>
): Promise<DailyReflection | null> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("daily_reflections")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()

      if (!error && data) return data as DailyReflection
      if (error) console.error("updateReflection DB error:", error.message)
    } catch (e) {
      console.error("updateReflection DB exception:", e)
    }
  }

  const config = await store.read()
  const index = config.reflections.findIndex((r) => r.id === id)
  if (index === -1) return null

  config.reflections[index] = {
    ...config.reflections[index],
    ...updates,
    updated_at: new Date().toISOString(),
  }
  await store.write(config)
  return config.reflections[index]
}

export async function getReflectionsByEpisodeId(episodeId: string): Promise<DailyReflection[]> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("daily_reflections")
        .select("*")
        .eq("episode_id", episodeId)
        .eq("status", "published")

      if (!error && data) return data as DailyReflection[]
      if (error) console.error("getReflectionsByEpisodeId DB error:", error.message)
    } catch (e) {
      console.error("getReflectionsByEpisodeId DB exception:", e)
    }
  }
  const config = await store.read()
  return config.reflections.filter(
    (r) => r.status === "published" && r.episode_id === episodeId
  )
}

export async function deleteReflection(id: string): Promise<boolean> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase
        .from("daily_reflections")
        .delete()
        .eq("id", id)

      if (!error) return true
      console.error("deleteReflection DB error:", error.message)
    } catch (e) {
      console.error("deleteReflection DB exception:", e)
    }
  }

  const config = await store.read()
  const before = config.reflections.length
  config.reflections = config.reflections.filter((r) => r.id !== id)
  if (config.reflections.length === before) return false
  await store.write(config)
  return true
}
