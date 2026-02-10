import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { ThemeConfig } from "@/types/ads"
import { defaultThemeConfig } from "@/types/ads"

const THEME_CONFIG_PATH = path.join(process.cwd(), "config", "theme.json")

export async function getThemeConfig(): Promise<ThemeConfig> {
  try {
    const data = await readFile(THEME_CONFIG_PATH, "utf-8")
    return JSON.parse(data) as ThemeConfig
  } catch {
    return defaultThemeConfig
  }
}

export async function saveThemeConfig(config: ThemeConfig): Promise<void> {
  const configDir = path.dirname(THEME_CONFIG_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(THEME_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}
