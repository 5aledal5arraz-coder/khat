import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { YouTubePackConfig, YouTubePackEntry } from "@/types/ads"

const YOUTUBE_PACK_CONFIG_PATH = path.join(process.cwd(), "config", "youtube-packs.json")

export async function getYoutubePackConfig(): Promise<YouTubePackConfig> {
  try {
    const data = await readFile(YOUTUBE_PACK_CONFIG_PATH, "utf-8")
    return JSON.parse(data) as YouTubePackConfig
  } catch {
    return {}
  }
}

export async function saveYoutubePackConfig(config: YouTubePackConfig): Promise<void> {
  const configDir = path.dirname(YOUTUBE_PACK_CONFIG_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(YOUTUBE_PACK_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}

export async function getYoutubePackEntry(episodeId: string): Promise<YouTubePackEntry | null> {
  const config = await getYoutubePackConfig()
  return config[episodeId] || null
}
