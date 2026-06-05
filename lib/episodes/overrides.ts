import { db } from "@/lib/db"
import { episodeOverrides } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { EpisodeOverride } from "@/types/episodes"

// DB row → app type
function rowToOverride(row: {
  episode_id: string
  original_title: string
  custom_title: string
  custom_description: string | null
}): EpisodeOverride {
  return {
    id: row.episode_id,
    originalTitle: row.original_title,
    customTitle: row.custom_title,
    customDescription: row.custom_description ?? undefined,
  }
}

export async function getEpisodeOverrides(): Promise<EpisodeOverride[]> {
  if (!db) return []

  const rows = await db.select().from(episodeOverrides)
  return rows.map(rowToOverride)
}

export async function saveEpisodeOverrides(overrides: EpisodeOverride[]): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.transaction(async (tx) => {
    await tx.delete(episodeOverrides)
    if (overrides.length > 0) {
      await tx.insert(episodeOverrides).values(
        overrides.map((o) => ({
          episode_id: o.id,
          original_title: o.originalTitle,
          custom_title: o.customTitle,
          custom_description: o.customDescription || null,
        }))
      )
    }
  })
}

export async function getEpisodeOverride(episodeId: string): Promise<EpisodeOverride | null> {
  if (!db) return null

  const rows = await db.select().from(episodeOverrides)
    .where(eq(episodeOverrides.episode_id, episodeId))
    .limit(1)
  if (rows[0]) return rowToOverride(rows[0])
  return null
}

export async function setEpisodeOverride(override: EpisodeOverride): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.insert(episodeOverrides).values({
    episode_id: override.id,
    original_title: override.originalTitle,
    custom_title: override.customTitle,
    custom_description: override.customDescription || null,
  }).onConflictDoUpdate({
    target: episodeOverrides.episode_id,
    set: {
      original_title: override.originalTitle,
      custom_title: override.customTitle,
      custom_description: override.customDescription || null,
    },
  })
}

export async function deleteEpisodeOverride(episodeId: string): Promise<void> {
  if (!db) throw new Error("Database not available")
  await db.delete(episodeOverrides).where(eq(episodeOverrides.episode_id, episodeId))
}

export function applyOverrides<T extends { id: string; title: string; description?: string | null }>(
  episodes: T[],
  overrides: EpisodeOverride[]
): T[] {
  const overrideMap = new Map(overrides.map((o) => [o.id, o]))

  return episodes.map((ep) => {
    const override = overrideMap.get(ep.id)
    if (override) {
      const result = { ...ep }
      if (override.customTitle) {
        result.title = override.customTitle
      }
      if (override.customDescription) {
        (result as Record<string, unknown>).description = override.customDescription
      }
      return result
    }
    return ep
  })
}
