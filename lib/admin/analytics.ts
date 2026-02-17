import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { AnalyticsConfig, PlatformStats } from "@/types/media-kit"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

const defaultConfig: AnalyticsConfig = {
  youtube: { followers: 0, posts: 0, engagement: "0%", url: "" },
  x: { followers: 0, posts: 0, engagement: "0%", url: "" },
  tiktok: { followers: 0, posts: 0, engagement: "0%", url: "" },
  instagram: { followers: 0, posts: 0, engagement: "0%", url: "" },
}

const PLATFORMS = ["youtube", "x", "tiktok", "instagram"] as const

const store = createConfigStore<AnalyticsConfig>("analytics.json", defaultConfig)

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("platform_analytics")
        .select("platform, followers, posts, engagement, url")
        .in("platform", [...PLATFORMS])

      if (!error && data && data.length > 0) {
        const config = { ...defaultConfig }
        for (const row of data) {
          const key = row.platform as keyof AnalyticsConfig
          if (key in config) {
            config[key] = {
              followers: row.followers,
              posts: row.posts,
              engagement: row.engagement,
              url: row.url,
            }
          }
        }
        return config
      }
      if (error) console.error("getAnalyticsConfig DB error:", error.message)
    } catch (e) {
      console.error("getAnalyticsConfig DB exception:", e)
    }
  }
  return store.read()
}

export async function saveAnalyticsConfig(config: AnalyticsConfig): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const rows = PLATFORMS.map((platform) => ({
        platform,
        followers: config[platform].followers,
        posts: config[platform].posts,
        engagement: config[platform].engagement,
        url: config[platform].url,
      }))
      const { error } = await supabase.from("platform_analytics").upsert(rows)
      if (!error) return
      console.error("saveAnalyticsConfig DB error:", error.message)
    } catch (e) {
      console.error("saveAnalyticsConfig DB exception:", e)
    }
  }
  await store.write(config)
}
