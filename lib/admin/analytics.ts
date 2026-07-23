import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { platformAnalytics } from "@/lib/db/schema"
import { inArray } from "drizzle-orm"
import type { AnalyticsConfig } from "@/types/media-kit"

const defaultConfig: AnalyticsConfig = {
  youtube: { followers: 0, posts: 0, engagement: "0%", url: "" },
  x: { followers: 0, posts: 0, engagement: "0%", url: "" },
  tiktok: { followers: 0, posts: 0, engagement: "0%", url: "" },
  instagram: { followers: 0, posts: 0, engagement: "0%", url: "" },
}

const PLATFORMS = ["youtube", "x", "tiktok", "instagram"] as const

const store = createConfigStore<AnalyticsConfig>("analytics.json", defaultConfig)

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  if (USE_DB) {
    try {
      // `inArray`, not a raw sql`= ANY(${PLATFORMS})`: Drizzle expands a JS array in a
      // template into one bind param per item, emitting `= ANY(($1,$2,$3,$4))` — a row
      // expression, which Postgres rejects (42809). This read never once succeeded.
      const rows = await db!.select().from(platformAnalytics)
        .where(inArray(platformAnalytics.platform, [...PLATFORMS]))

      if (rows.length > 0) {
        const config = { ...defaultConfig }
        for (const row of rows) {
          const key = row.platform as keyof AnalyticsConfig
          if (key in config) {
            config[key] = {
              followers: row.followers ?? 0,
              posts: row.posts ?? 0,
              engagement: row.engagement ?? "0%",
              url: row.url ?? "",
            }
          }
        }
        return config
      }
    } catch (e) {
      // Say the consequence, not just the error: the old message reported the exception
      // but not that callers were silently served file data instead, so a permanently
      // broken query looked like a working read path.
      console.error(
        "[analytics] getAnalyticsConfig: DB read FAILED — serving config/analytics.json instead. " +
          "Values returned to the media kit may be stale and will NOT reflect saves made in /admin/media-kit.",
        e
      )
    }
  }
  return store.read()
}

export async function saveAnalyticsConfig(config: AnalyticsConfig): Promise<void> {
  if (USE_DB) {
    try {
      for (const platform of PLATFORMS) {
        const stats = config[platform]
        await db!.insert(platformAnalytics).values({
          platform,
          followers: stats.followers,
          posts: stats.posts,
          engagement: stats.engagement,
          url: stats.url,
        }).onConflictDoUpdate({
          target: platformAnalytics.platform,
          set: {
            followers: stats.followers,
            posts: stats.posts,
            engagement: stats.engagement,
            url: stats.url,
          },
        })
      }
      return
    } catch (e) {
      console.error("saveAnalyticsConfig DB exception:", e)
    }
  }
  await store.write(config)
}
