import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { AdSettings } from "@/types/ads"
import { defaultAdSettings } from "@/types/ads"

const ADS_CONFIG_PATH = path.join(process.cwd(), "config", "ads.json")

export async function getAdSettings(): Promise<AdSettings> {
  try {
    const data = await readFile(ADS_CONFIG_PATH, "utf-8")
    return JSON.parse(data) as AdSettings
  } catch {
    // Return defaults if file doesn't exist
    return defaultAdSettings
  }
}

export async function saveAdSettings(settings: AdSettings): Promise<void> {
  const configDir = path.dirname(ADS_CONFIG_PATH)
  await mkdir(configDir, { recursive: true })

  await writeFile(ADS_CONFIG_PATH, JSON.stringify(settings, null, 2), "utf-8")
}
