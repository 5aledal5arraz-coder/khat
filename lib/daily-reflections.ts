import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { DailyReflection } from "@/types/database"
import type { DailyReflectionsConfig } from "@/types/ads"
import { defaultDailyReflectionsConfig } from "@/types/ads"

const CONFIG_PATH = path.join(process.cwd(), "config", "daily-reflections.json")

export async function getReflectionsConfig(): Promise<DailyReflectionsConfig> {
  try {
    const data = await readFile(CONFIG_PATH, "utf-8")
    return JSON.parse(data) as DailyReflectionsConfig
  } catch {
    return defaultDailyReflectionsConfig
  }
}

async function saveConfig(config: DailyReflectionsConfig): Promise<void> {
  const configDir = path.dirname(CONFIG_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}

export async function getAllReflections(): Promise<DailyReflection[]> {
  const config = await getReflectionsConfig()
  return config.reflections
}

export async function getTodaysReflection(): Promise<DailyReflection | null> {
  const config = await getReflectionsConfig()
  const published = config.reflections.filter((r) => r.status === "published")
  if (published.length === 0) return null

  const today = new Date().toISOString().split("T")[0]

  // Check for reflection matching today's date
  const todayReflection = published.find((r) => r.date === today)
  if (todayReflection) return todayReflection

  // Fallback: most recent published reflection
  const sorted = [...published].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  return sorted[0] ?? null
}

export async function getReflectionById(id: string): Promise<DailyReflection | null> {
  const config = await getReflectionsConfig()
  return config.reflections.find((r) => r.id === id) ?? null
}

export async function addReflection(
  reflection: Omit<DailyReflection, "id" | "created_at" | "updated_at">
): Promise<DailyReflection> {
  const config = await getReflectionsConfig()
  const now = new Date().toISOString()
  const newReflection: DailyReflection = {
    ...reflection,
    id: `dr-${Date.now()}`,
    created_at: now,
    updated_at: now,
  }
  config.reflections.push(newReflection)
  await saveConfig(config)
  return newReflection
}

export async function updateReflection(
  id: string,
  updates: Partial<Omit<DailyReflection, "id" | "created_at">>
): Promise<DailyReflection | null> {
  const config = await getReflectionsConfig()
  const index = config.reflections.findIndex((r) => r.id === id)
  if (index === -1) return null

  config.reflections[index] = {
    ...config.reflections[index],
    ...updates,
    updated_at: new Date().toISOString(),
  }
  await saveConfig(config)
  return config.reflections[index]
}

export async function getReflectionsByEpisodeId(episodeId: string): Promise<DailyReflection[]> {
  const config = await getReflectionsConfig()
  return config.reflections.filter(
    (r) => r.status === "published" && r.episode_id === episodeId
  )
}

export async function deleteReflection(id: string): Promise<boolean> {
  const config = await getReflectionsConfig()
  const before = config.reflections.length
  config.reflections = config.reflections.filter((r) => r.id !== id)
  if (config.reflections.length === before) return false
  await saveConfig(config)
  return true
}
