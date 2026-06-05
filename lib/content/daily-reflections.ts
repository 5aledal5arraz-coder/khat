import { db } from "@/lib/db"
import { dailyReflections } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import type { DailyReflection } from "@/types/database"

interface DailyReflectionsConfig {
  reflections: DailyReflection[]
}

export async function getReflectionsConfig(): Promise<DailyReflectionsConfig> {
  if (!db) return { reflections: [] }

  const rows = await db.select().from(dailyReflections).orderBy(desc(dailyReflections.date))
  return { reflections: rows as unknown as DailyReflection[] }
}

export async function getAllReflections(): Promise<DailyReflection[]> {
  const config = await getReflectionsConfig()
  return config.reflections
}

export async function getTodaysReflection(): Promise<DailyReflection | null> {
  if (!db) return null

  const today = new Date().toISOString().split("T")[0]

  // Check for today's reflection
  const todayRows = await db.select().from(dailyReflections)
    .where(and(eq(dailyReflections.date, today), eq(dailyReflections.status, "published")))
    .limit(1)
  if (todayRows[0]) return todayRows[0] as unknown as DailyReflection

  // Fallback: most recent published
  const recentRows = await db.select().from(dailyReflections)
    .where(eq(dailyReflections.status, "published"))
    .orderBy(desc(dailyReflections.created_at))
    .limit(1)
  if (recentRows[0]) return recentRows[0] as unknown as DailyReflection
  return null
}

export async function getReflectionById(id: string): Promise<DailyReflection | null> {
  if (!db) return null

  const rows = await db.select().from(dailyReflections).where(eq(dailyReflections.id, id)).limit(1)
  if (rows[0]) return rows[0] as unknown as DailyReflection
  return null
}

export async function addReflection(
  reflection: Omit<DailyReflection, "id" | "created_at" | "updated_at">
): Promise<DailyReflection> {
  if (!db) throw new Error("Database not available")

  const newId = `dr-${crypto.randomUUID()}`
  const rows = await db.insert(dailyReflections).values({
    id: newId,
    date: reflection.date,
    short_quote: reflection.short_quote,
    reflection: reflection.reflection,
    thinking_question: reflection.thinking_question,
    attribution: reflection.attribution || null,
    episode_id: reflection.episode_id || null,
    episode_slug: reflection.episode_slug || null,
    episode_title: reflection.episode_title || null,
    status: reflection.status,
  }).returning()

  return rows[0] as unknown as DailyReflection
}

export async function updateReflection(
  id: string,
  updates: Partial<Omit<DailyReflection, "id" | "created_at">>
): Promise<DailyReflection | null> {
  if (!db) throw new Error("Database not available")

  const rows = await db.update(dailyReflections)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(dailyReflections.id, id))
    .returning()
  if (rows[0]) return rows[0] as unknown as DailyReflection
  return null
}

export async function getReflectionsByEpisodeId(episodeId: string): Promise<DailyReflection[]> {
  if (!db) return []

  const rows = await db.select().from(dailyReflections)
    .where(and(eq(dailyReflections.episode_id, episodeId), eq(dailyReflections.status, "published")))
  return rows as unknown as DailyReflection[]
}

export async function deleteReflection(id: string): Promise<boolean> {
  if (!db) throw new Error("Database not available")

  const result = await db.delete(dailyReflections).where(eq(dailyReflections.id, id))
  return (result.rowCount ?? 0) > 0
}
