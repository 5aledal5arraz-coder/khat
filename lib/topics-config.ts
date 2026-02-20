import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { topicsConfig } from "@/lib/db/schema"
import { eq, asc } from "drizzle-orm"
import type { TopicConfig, TopicsConfig } from "@/types/topics"

const store = createConfigStore<TopicsConfig>("topics.json", { topics: [] })

export async function getAllTopics(): Promise<TopicConfig[]> {
  if (USE_DB) {
    try {
      const rows = await db!.select().from(topicsConfig).orderBy(asc(topicsConfig.name))
      return rows as unknown as TopicConfig[]
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
      const rows = await db!.select().from(topicsConfig).where(eq(topicsConfig.id, id)).limit(1)
      if (rows[0]) return rows[0] as unknown as TopicConfig
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
      const rows = await db!.select().from(topicsConfig).where(eq(topicsConfig.slug, slug)).limit(1)
      if (rows[0]) return rows[0] as unknown as TopicConfig
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
      const rows = await db!.insert(topicsConfig).values({
        id: newTopic.id,
        name: newTopic.name,
        slug: newTopic.slug,
        description: newTopic.description || null,
        color: newTopic.color,
        icon: newTopic.icon || null,
      }).returning()
      if (rows[0]) return rows[0] as unknown as TopicConfig
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
      const rows = await db!.update(topicsConfig)
        .set({ ...updates, updated_at: new Date() } as Record<string, unknown>)
        .where(eq(topicsConfig.id, id))
        .returning()
      if (rows[0]) return rows[0] as unknown as TopicConfig
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
      const result = await db!.delete(topicsConfig).where(eq(topicsConfig.id, id))
      return (result.rowCount ?? 0) > 0
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
