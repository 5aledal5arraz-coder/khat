import { createConfigStore } from "@/lib/config-store"
import type { YouTubePackConfig, YouTubePackEntry } from "@/types/youtube-pack"

const store = createConfigStore<YouTubePackConfig>("youtube-packs.json", {})

export async function getYoutubePackConfig(): Promise<YouTubePackConfig> {
  return store.read()
}

export async function saveYoutubePackConfig(config: YouTubePackConfig): Promise<void> {
  await store.write(config)
}

export async function getYoutubePackEntry(episodeId: string): Promise<YouTubePackEntry | null> {
  const config = await getYoutubePackConfig()
  return config[episodeId] || null
}
