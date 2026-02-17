import { getFeatureFlags } from "@/lib/site-settings"
import type { FeatureFlags } from "@/types/site-settings"

let cachedFlags: FeatureFlags | null = null
let cacheTime = 0
const CACHE_TTL = 30_000 // 30 seconds in-memory

export async function getSiteConfig(): Promise<FeatureFlags> {
  const now = Date.now()
  if (cachedFlags && now - cacheTime < CACHE_TTL) {
    return cachedFlags
  }
  cachedFlags = await getFeatureFlags()
  cacheTime = now
  return cachedFlags
}

export async function isEnabled(key: keyof FeatureFlags): Promise<boolean> {
  const flags = await getSiteConfig()
  return flags[key]
}
