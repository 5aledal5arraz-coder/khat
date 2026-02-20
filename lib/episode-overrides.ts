import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { episodeOverrides } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { EpisodeOverride } from "@/types/episodes"

const store = createConfigStore<EpisodeOverride[]>("episode-overrides.json", [])

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
  if (USE_DB) {
    try {
      const rows = await db!.select().from(episodeOverrides)
      return rows.map(rowToOverride)
    } catch (e) {
      console.error("getEpisodeOverrides DB exception:", e)
    }
  }
  return store.read()
}

export async function saveEpisodeOverrides(overrides: EpisodeOverride[]): Promise<void> {
  if (USE_DB) {
    try {
      // Delete all, then insert — simple full replace
      await db!.delete(episodeOverrides)
      if (overrides.length > 0) {
        await db!.insert(episodeOverrides).values(
          overrides.map((o) => ({
            episode_id: o.id,
            original_title: o.originalTitle,
            custom_title: o.customTitle,
            custom_description: o.customDescription || null,
          }))
        )
      }
      return
    } catch (e) {
      console.error("saveEpisodeOverrides DB exception:", e)
    }
  }
  await store.write(overrides)
}

export async function getEpisodeOverride(episodeId: string): Promise<EpisodeOverride | null> {
  if (USE_DB) {
    try {
      const rows = await db!.select().from(episodeOverrides)
        .where(eq(episodeOverrides.episode_id, episodeId))
        .limit(1)
      if (rows[0]) return rowToOverride(rows[0])
      return null
    } catch (e) {
      console.error("getEpisodeOverride DB exception:", e)
    }
  }
  const overrides = await getEpisodeOverrides()
  return overrides.find((o) => o.id === episodeId) || null
}

export async function setEpisodeOverride(override: EpisodeOverride): Promise<void> {
  if (USE_DB) {
    try {
      await db!.insert(episodeOverrides).values({
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
      return
    } catch (e) {
      console.error("setEpisodeOverride DB exception:", e)
    }
  }

  const overrides = await store.read()
  const existingIndex = overrides.findIndex((o) => o.id === override.id)

  if (existingIndex >= 0) {
    overrides[existingIndex] = override
  } else {
    overrides.push(override)
  }

  await store.write(overrides)
}

export async function deleteEpisodeOverride(episodeId: string): Promise<void> {
  if (USE_DB) {
    try {
      await db!.delete(episodeOverrides).where(eq(episodeOverrides.episode_id, episodeId))
      return
    } catch (e) {
      console.error("deleteEpisodeOverride DB exception:", e)
    }
  }

  const overrides = await store.read()
  const filtered = overrides.filter((o) => o.id !== episodeId)
  await store.write(filtered)
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
