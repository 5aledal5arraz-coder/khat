import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
import type { DailyReflection } from "@/types/database"
import type { DailyReflectionsConfig } from "@/types/home-content"

const defaultDailyReflectionsConfig: DailyReflectionsConfig = { reflections: [] }

const store = createConfigStore<DailyReflectionsConfig>("daily-reflections.json", defaultDailyReflectionsConfig)

export async function getReflectionsConfig(): Promise<DailyReflectionsConfig> {
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT * FROM daily_reflections ORDER BY date DESC`
      )
      return { reflections: rows as DailyReflection[] }
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
      const { rows: todayRows } = await pool!.query(
        `SELECT * FROM daily_reflections WHERE date = $1 AND status = $2 LIMIT 1`,
        [today, "published"]
      )
      if (todayRows[0]) return todayRows[0] as DailyReflection

      // Fallback: most recent published
      const { rows: recentRows } = await pool!.query(
        `SELECT * FROM daily_reflections WHERE status = $1 ORDER BY created_at DESC LIMIT 1`,
        ["published"]
      )
      if (recentRows[0]) return recentRows[0] as DailyReflection
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
      const { rows } = await pool!.query(
        `SELECT * FROM daily_reflections WHERE id = $1 LIMIT 1`,
        [id]
      )
      if (rows[0]) return rows[0] as DailyReflection
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
      const { rows } = await pool!.query(
        `INSERT INTO daily_reflections (id, date, short_quote, reflection, thinking_question, attribution, episode_id, episode_slug, episode_title, quote_id, quote_text, path_slug, path_title, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          newReflection.id, newReflection.date, newReflection.short_quote,
          newReflection.reflection, newReflection.thinking_question,
          newReflection.attribution || null,
          newReflection.episode_id || null, newReflection.episode_slug || null, newReflection.episode_title || null,
          newReflection.quote_id || null, newReflection.quote_text || null,
          newReflection.path_slug || null, newReflection.path_title || null,
          newReflection.status,
          newReflection.created_at, newReflection.updated_at,
        ]
      )
      if (rows[0]) return rows[0] as DailyReflection
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
      const fields: string[] = []
      const values: unknown[] = []
      let paramIndex = 1

      for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = $${paramIndex}`)
        values.push(value)
        paramIndex++
      }
      fields.push(`updated_at = $${paramIndex}`)
      values.push(new Date().toISOString())
      paramIndex++
      values.push(id)

      const { rows } = await pool!.query(
        `UPDATE daily_reflections SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      )
      if (rows[0]) return rows[0] as DailyReflection
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
      const { rows } = await pool!.query(
        `SELECT * FROM daily_reflections WHERE episode_id = $1 AND status = $2`,
        [episodeId, "published"]
      )
      return rows as DailyReflection[]
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
      const { rowCount } = await pool!.query(
        `DELETE FROM daily_reflections WHERE id = $1`,
        [id]
      )
      return (rowCount ?? 0) > 0
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
