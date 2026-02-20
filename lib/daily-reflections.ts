import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { dailyReflections } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import type { DailyReflection } from "@/types/database"
import type { DailyReflectionsConfig } from "@/types/home-content"

const defaultDailyReflectionsConfig: DailyReflectionsConfig = { reflections: [] }

const store = createConfigStore<DailyReflectionsConfig>("daily-reflections.json", defaultDailyReflectionsConfig)

export async function getReflectionsConfig(): Promise<DailyReflectionsConfig> {
  if (USE_DB) {
    try {
      const rows = await db!.select().from(dailyReflections).orderBy(desc(dailyReflections.date))
      return { reflections: rows as unknown as DailyReflection[] }
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

  if (USE_DB) {
    try {
      // Check for today's reflection
      const todayRows = await db!.select().from(dailyReflections)
        .where(and(eq(dailyReflections.date, today), eq(dailyReflections.status, "published")))
        .limit(1)
      if (todayRows[0]) return todayRows[0] as unknown as DailyReflection

      // Fallback: most recent published
      const recentRows = await db!.select().from(dailyReflections)
        .where(eq(dailyReflections.status, "published"))
        .orderBy(desc(dailyReflections.created_at))
        .limit(1)
      if (recentRows[0]) return recentRows[0] as unknown as DailyReflection
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
  if (USE_DB) {
    try {
      const rows = await db!.select().from(dailyReflections).where(eq(dailyReflections.id, id)).limit(1)
      if (rows[0]) return rows[0] as unknown as DailyReflection
      return null
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

  if (USE_DB) {
    try {
      const rows = await db!.insert(dailyReflections).values({
        id: newReflection.id,
        date: newReflection.date,
        short_quote: newReflection.short_quote,
        reflection: newReflection.reflection,
        thinking_question: newReflection.thinking_question,
        attribution: newReflection.attribution || null,
        episode_id: newReflection.episode_id || null,
        episode_slug: newReflection.episode_slug || null,
        episode_title: newReflection.episode_title || null,
        status: newReflection.status,
      }).returning()
      if (rows[0]) return rows[0] as unknown as DailyReflection
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
  if (USE_DB) {
    try {
      const rows = await db!.update(dailyReflections)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(dailyReflections.id, id))
        .returning()
      if (rows[0]) return rows[0] as unknown as DailyReflection
      return null
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
  if (USE_DB) {
    try {
      const rows = await db!.select().from(dailyReflections)
        .where(and(eq(dailyReflections.episode_id, episodeId), eq(dailyReflections.status, "published")))
      return rows as unknown as DailyReflection[]
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
  if (USE_DB) {
    try {
      const result = await db!.delete(dailyReflections).where(eq(dailyReflections.id, id))
      return (result.rowCount ?? 0) > 0
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
