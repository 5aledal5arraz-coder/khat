import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { MediaKitConfig } from "@/types/ads"
import { defaultMediaKitConfig } from "@/types/ads"

const MEDIA_KIT_PATH = path.join(process.cwd(), "config", "media-kit.json")

export async function getMediaKitConfig(): Promise<MediaKitConfig> {
  try {
    const data = await readFile(MEDIA_KIT_PATH, "utf-8")
    return JSON.parse(data) as MediaKitConfig
  } catch {
    return defaultMediaKitConfig
  }
}

export async function saveMediaKitConfig(config: MediaKitConfig): Promise<void> {
  const configDir = path.dirname(MEDIA_KIT_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(MEDIA_KIT_PATH, JSON.stringify(config, null, 2), "utf-8")
}
