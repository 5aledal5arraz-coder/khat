import { createConfigStore } from "@/lib/config-store"
import type { ModerationConfig } from "@/types/moderation"

const defaultModerationConfig: ModerationConfig = { aiEnabled: true }

const store = createConfigStore<ModerationConfig>("moderation.json", defaultModerationConfig)

export async function getModerationConfig(): Promise<ModerationConfig> {
  return store.read()
}

export async function saveModerationConfig(config: ModerationConfig): Promise<void> {
  await store.write(config)
}
