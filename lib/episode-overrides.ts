import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { EpisodeOverride } from "@/types/episodes"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

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
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("episode_overrides")
        .select("episode_id, original_title, custom_title, custom_description")

      if (!error && data) return data.map(rowToOverride)
      if (error) console.error("getEpisodeOverrides DB error:", error.message)
    } catch (e) {
      console.error("getEpisodeOverrides DB exception:", e)
    }
  }
  return store.read()
}

export async function saveEpisodeOverrides(overrides: EpisodeOverride[]): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      // Delete all, then insert — simple full replace
      await supabase.from("episode_overrides").delete().neq("episode_id", "")
      if (overrides.length > 0) {
        const rows = overrides.map((o) => ({
          episode_id: o.id,
          original_title: o.originalTitle,
          custom_title: o.customTitle,
          custom_description: o.customDescription || null,
        }))
        const { error } = await supabase.from("episode_overrides").upsert(rows)
        if (error) console.error("saveEpisodeOverrides DB error:", error.message)
        else return
      } else {
        return
      }
    } catch (e) {
      console.error("saveEpisodeOverrides DB exception:", e)
    }
  }
  await store.write(overrides)
}

export async function getEpisodeOverride(episodeId: string): Promise<EpisodeOverride | null> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("episode_overrides")
        .select("episode_id, original_title, custom_title, custom_description")
        .eq("episode_id", episodeId)
        .maybeSingle()

      if (!error && data) return rowToOverride(data)
      if (!error && !data) return null
      if (error) console.error("getEpisodeOverride DB error:", error.message)
    } catch (e) {
      console.error("getEpisodeOverride DB exception:", e)
    }
  }
  const overrides = await getEpisodeOverrides()
  return overrides.find((o) => o.id === episodeId) || null
}

export async function setEpisodeOverride(override: EpisodeOverride): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.from("episode_overrides").upsert({
        episode_id: override.id,
        original_title: override.originalTitle,
        custom_title: override.customTitle,
        custom_description: override.customDescription || null,
      })
      if (!error) return
      console.error("setEpisodeOverride DB error:", error.message)
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
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase
        .from("episode_overrides")
        .delete()
        .eq("episode_id", episodeId)
      if (!error) return
      console.error("deleteEpisodeOverride DB error:", error.message)
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
