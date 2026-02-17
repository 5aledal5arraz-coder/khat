import { createConfigStore } from "@/lib/config-store"
import type { ThemeConfig } from "@/types/theme"

const defaultThemeConfig: ThemeConfig = { mode: "system" }

const store = createConfigStore<ThemeConfig>("theme.json", defaultThemeConfig)

export async function getThemeConfig(): Promise<ThemeConfig> {
  return store.read()
}

export async function saveThemeConfig(config: ThemeConfig): Promise<void> {
  await store.write(config)
}
