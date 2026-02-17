import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { TopicConfig, TopicsConfig } from "@/types/topics"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

const store = createConfigStore<TopicsConfig>("topics.json", { topics: [] })

export async function getAllTopics(): Promise<TopicConfig[]> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("topics_config")
        .select("id, name, slug, description, color, icon, created_at, updated_at")
        .order("name")

      if (!error && data) {
        return data as TopicConfig[]
      }
      if (error) console.error("getAllTopics DB error:", error.message)
    } catch (e) {
      console.error("getAllTopics DB exception:", e)
    }
  }
  const config = await store.read()
  return config.topics
}

export async function getTopicById(id: string): Promise<TopicConfig | undefined> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("topics_config")
        .select("id, name, slug, description, color, icon, created_at, updated_at")
        .eq("id", id)
        .maybeSingle()

      if (!error && data) return data as TopicConfig
      if (error) console.error("getTopicById DB error:", error.message)
    } catch (e) {
      console.error("getTopicById DB exception:", e)
    }
  }
  const topics = await getAllTopics()
  return topics.find((t) => t.id === id)
}

export async function getTopicBySlug(slug: string): Promise<TopicConfig | undefined> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("topics_config")
        .select("id, name, slug, description, color, icon, created_at, updated_at")
        .eq("slug", slug)
        .maybeSingle()

      if (!error && data) return data as TopicConfig
      if (error) console.error("getTopicBySlug DB error:", error.message)
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

  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("topics_config")
        .insert(newTopic)
        .select()
        .single()

      if (!error && data) return data as TopicConfig
      if (error) console.error("addTopic DB error:", error.message)
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
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("topics_config")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()

      if (!error && data) return data as TopicConfig
      if (error) console.error("updateTopic DB error:", error.message)
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
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { error } = await supabase
        .from("topics_config")
        .delete()
        .eq("id", id)

      if (!error) return true
      console.error("deleteTopic DB error:", error.message)
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
