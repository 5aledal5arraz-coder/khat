import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
import type { TopicConfig, TopicsConfig } from "@/types/topics"

const store = createConfigStore<TopicsConfig>("topics.json", { topics: [] })

export async function getAllTopics(): Promise<TopicConfig[]> {
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT id, name, slug, description, color, icon, created_at, updated_at
         FROM topics_config
         ORDER BY name`
      )
      return rows as TopicConfig[]
    } catch (e) {
      console.error("getAllTopics DB exception:", e)
    }
  }
  const config = await store.read()
  return config.topics
}

export async function getTopicById(id: string): Promise<TopicConfig | undefined> {
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT id, name, slug, description, color, icon, created_at, updated_at
         FROM topics_config WHERE id = $1 LIMIT 1`,
        [id]
      )
      if (rows[0]) return rows[0] as TopicConfig
      return undefined
    } catch (e) {
      console.error("getTopicById DB exception:", e)
    }
  }
  const topics = await getAllTopics()
  return topics.find((t) => t.id === id)
}

export async function getTopicBySlug(slug: string): Promise<TopicConfig | undefined> {
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT id, name, slug, description, color, icon, created_at, updated_at
         FROM topics_config WHERE slug = $1 LIMIT 1`,
        [slug]
      )
      if (rows[0]) return rows[0] as TopicConfig
      return undefined
    } catch (e) {
      console.error("getTopicBySlug DB exception:", e)
    }
  }
  const topics = await getAllTopics()
  return topics.find((t) => t.slug === slug)
}

export async function addTopic(topic: Omit<TopicConfig, "id" | "created_at" | "updated_at">): Promise<TopicConfig> {
  const now = new Date().toISOString()
  const newTopic: TopicConfig = {
    ...topic,
    id: `topic-${crypto.randomUUID()}`,
    created_at: now,
    updated_at: now,
  }

  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `INSERT INTO topics_config (id, name, slug, description, color, icon, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [newTopic.id, newTopic.name, newTopic.slug, newTopic.description || null, newTopic.color, newTopic.icon || null, newTopic.created_at, newTopic.updated_at]
      )
      if (rows[0]) return rows[0] as TopicConfig
    } catch (e) {
      console.error("addTopic DB exception:", e)
    }
  }

  const config = await store.read()
  config.topics.push(newTopic)
  await store.write(config)
  return newTopic
}

export async function updateTopic(id: string, updates: Partial<Omit<TopicConfig, "id" | "created_at">>): Promise<TopicConfig | null> {
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
        `UPDATE topics_config SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      )
      if (rows[0]) return rows[0] as TopicConfig
      return null
    } catch (e) {
      console.error("updateTopic DB exception:", e)
    }
  }

  const config = await store.read()
  const index = config.topics.findIndex((t) => t.id === id)
  if (index === -1) return null
  config.topics[index] = {
    ...config.topics[index],
    ...updates,
    updated_at: new Date().toISOString(),
  }
  await store.write(config)
  return config.topics[index]
}

export async function deleteTopic(id: string): Promise<boolean> {
  if (USE_DB) {
    try {
      const { rowCount } = await pool!.query(
        `DELETE FROM topics_config WHERE id = $1`,
        [id]
      )
      return (rowCount ?? 0) > 0
    } catch (e) {
      console.error("deleteTopic DB exception:", e)
    }
  }

  const config = await store.read()
  const index = config.topics.findIndex((t) => t.id === id)
  if (index === -1) return false
  config.topics.splice(index, 1)
  await store.write(config)
  return true
}
