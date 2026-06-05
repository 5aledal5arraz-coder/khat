import { createConfigStore } from "@/lib/config-store"
import type { MediaKitConfig } from "@/types/media-kit"
import { defaultMediaKitConfig } from "@/types/media-kit"

const store = createConfigStore<MediaKitConfig>("media-kit.json", defaultMediaKitConfig)

export async function getMediaKitConfig(): Promise<MediaKitConfig> {
  return store.read()
}

export async function saveMediaKitConfig(config: MediaKitConfig): Promise<void> {
  await store.write(config)
}
