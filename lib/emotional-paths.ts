import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { emotionalPaths } from "@/lib/db/schema"
import { eq, asc, sql } from "drizzle-orm"
import type { EmotionalPath, PathSlug } from "@/types/database"
import type { EmotionalPathsConfig } from "@/types/home-content"

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
  if (USE_DB) {
    try {
      const rows = await db!.select().from(emotionalPaths).orderBy(asc(emotionalPaths.order))
      if (rows.length > 0) return { paths: rows.map((r) => rowToPath(r as unknown as Record<string, unknown>)) }
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
  if (USE_DB) {
    try {
      const rows = await db!.select().from(emotionalPaths).where(eq(emotionalPaths.slug, slug)).limit(1)
      if (rows[0]) return rowToPath(rows[0] as unknown as Record<string, unknown>)
      return null
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
  if (USE_DB) {
    try {
      const rows = await db!.update(emotionalPaths)
        .set(updates as Record<string, unknown>)
        .where(eq(emotionalPaths.id, id))
        .returning()
      if (rows[0]) return rowToPath(rows[0] as unknown as Record<string, unknown>)
      return null
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
  if (USE_DB) {
    try {
      const rows = await db!.select().from(emotionalPaths)
        .where(sql`${episodeId} = ANY(${emotionalPaths.episode_ids})`)
        .orderBy(asc(emotionalPaths.order))
      return rows.map((r) => rowToPath(r as unknown as Record<string, unknown>))
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
  if (USE_DB) {
    try {
      const rows = await db!.select({ episode_ids: emotionalPaths.episode_ids }).from(emotionalPaths).where(eq(emotionalPaths.id, pathId))
      if (!rows[0]) return false
      const ids = (rows[0].episode_ids as string[]) || []
      if (ids.includes(episodeId)) return true

      await db!.update(emotionalPaths)
        .set({ episode_ids: [...ids, episodeId] })
        .where(eq(emotionalPaths.id, pathId))
      return true
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
  if (USE_DB) {
    try {
      const rows = await db!.select({ episode_ids: emotionalPaths.episode_ids }).from(emotionalPaths).where(eq(emotionalPaths.id, pathId))
      if (!rows[0]) return false
      const ids = ((rows[0].episode_ids as string[]) || []).filter((id) => id !== episodeId)

      await db!.update(emotionalPaths)
        .set({ episode_ids: ids })
        .where(eq(emotionalPaths.id, pathId))
      return true
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
  if (USE_DB) {
    try {
      const rows = await db!.select({ quote_ids: emotionalPaths.quote_ids }).from(emotionalPaths).where(eq(emotionalPaths.id, pathId))
      if (!rows[0]) return false
      const ids = (rows[0].quote_ids as string[]) || []
      if (ids.includes(quoteId)) return true

      await db!.update(emotionalPaths)
        .set({ quote_ids: [...ids, quoteId] })
        .where(eq(emotionalPaths.id, pathId))
      return true
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
  if (USE_DB) {
    try {
      const rows = await db!.select({ quote_ids: emotionalPaths.quote_ids }).from(emotionalPaths).where(eq(emotionalPaths.id, pathId))
      if (!rows[0]) return false
      const ids = ((rows[0].quote_ids as string[]) || []).filter((id) => id !== quoteId)

      await db!.update(emotionalPaths)
        .set({ quote_ids: ids })
        .where(eq(emotionalPaths.id, pathId))
      return true
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
