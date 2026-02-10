import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { ModerationConfig } from "@/types/ads"
import { defaultModerationConfig } from "@/types/ads"

const CONFIG_PATH = path.join(process.cwd(), "config", "moderation.json")

export async function getModerationConfig(): Promise<ModerationConfig> {
  try {
    const data = await readFile(CONFIG_PATH, "utf-8")
    return JSON.parse(data) as ModerationConfig
  } catch {
    return defaultModerationConfig
  }
}

export async function saveModerationConfig(config: ModerationConfig): Promise<void> {
  const configDir = path.dirname(CONFIG_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}
