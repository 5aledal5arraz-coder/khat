import { db } from "@/lib/db"
import { dailyReflections } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import type { DailyReflection } from "@/types/database"




export async function getReflectionsByEpisodeId(episodeId: string): Promise<DailyReflection[]> {
  if (!db) return []

  const rows = await db.select().from(dailyReflections)
    .where(and(eq(dailyReflections.episode_id, episodeId), eq(dailyReflections.status, "published")))
  return rows as unknown as DailyReflection[]
}

