import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
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
      const { rows } = await pool!.query(
        `SELECT episode_id, original_title, custom_title, custom_description FROM episode_overrides`
      )
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
      await pool!.query(`DELETE FROM episode_overrides`)
      if (overrides.length > 0) {
        const values: unknown[] = []
        const placeholders: string[] = []
        let i = 1
        for (const o of overrides) {
          placeholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`)
          values.push(o.id, o.originalTitle, o.customTitle, o.customDescription || null)
          i += 4
        }
        await pool!.query(
          `INSERT INTO episode_overrides (episode_id, original_title, custom_title, custom_description)
           VALUES ${placeholders.join(", ")}`,
          values
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
      const { rows } = await pool!.query(
        `SELECT episode_id, original_title, custom_title, custom_description
         FROM episode_overrides WHERE episode_id = $1 LIMIT 1`,
        [episodeId]
      )
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
      await pool!.query(
        `INSERT INTO episode_overrides (episode_id, original_title, custom_title, custom_description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (episode_id) DO UPDATE SET
           original_title = EXCLUDED.original_title,
           custom_title = EXCLUDED.custom_title,
           custom_description = EXCLUDED.custom_description`,
        [override.id, override.originalTitle, override.customTitle, override.customDescription || null]
      )
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
      await pool!.query(
        `DELETE FROM episode_overrides WHERE episode_id = $1`,
        [episodeId]
      )
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
