import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import * as schema from "./db/schema"

const { Pool } = pg

const dbUrl = process.env.DATABASE_URL
const isLocalhost = dbUrl?.includes("localhost")

// Strip sslmode from connection string — pg v8.x treats sslmode=require as verify-full
// which rejects self-signed certs. We handle SSL via the pool config instead.
const cleanUrl = dbUrl?.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")

const pool = cleanUrl
  ? new Pool({
      connectionString: cleanUrl,
      ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
    })
  : null

const db = pool ? drizzle(pool, { schema }) : null

export { db, pool }
export const USE_DB = !!pool

// Legacy helpers — actively used by 8 /api/space/* routes (raw SQL joins).
// TODO: Migrate those routes to Drizzle relational queries, then remove PROFILE_COLS and nestProfile.
export const PROFILE_COLS = `p.id AS p_id, p.display_name AS p_display_name, p.avatar_url AS p_avatar_url, p.bio AS p_bio, p.is_admin AS p_is_admin, p.articles_count AS p_articles_count, p.followers_count AS p_followers_count`

export function nestProfile(row: Record<string, unknown>): Record<string, unknown> {
  const { p_id, p_display_name, p_avatar_url, p_bio, p_is_admin, p_articles_count, p_followers_count, ...rest } = row
  return {
    ...rest,
    profiles: p_id
      ? { id: p_id, display_name: p_display_name, avatar_url: p_avatar_url, bio: p_bio, is_admin: p_is_admin, articles_count: p_articles_count, followers_count: p_followers_count }
      : null,
  }
}
