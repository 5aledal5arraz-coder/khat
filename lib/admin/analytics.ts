import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { AnalyticsConfig } from "@/types/ads"

const ANALYTICS_PATH = path.join(process.cwd(), "config", "analytics.json")

const defaultConfig: AnalyticsConfig = {
  youtube: { followers: 0, posts: 0, engagement: "0%", url: "" },
  x: { followers: 0, posts: 0, engagement: "0%", url: "" },
  tiktok: { followers: 0, posts: 0, engagement: "0%", url: "" },
  instagram: { followers: 0, posts: 0, engagement: "0%", url: "" },
}

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  try {
    const data = await readFile(ANALYTICS_PATH, "utf-8")
    return JSON.parse(data) as AnalyticsConfig
  } catch {
    return defaultConfig
  }
}

export async function saveAnalyticsConfig(config: AnalyticsConfig): Promise<void> {
  const configDir = path.dirname(ANALYTICS_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(ANALYTICS_PATH, JSON.stringify(config, null, 2), "utf-8")
}
