import { db } from "@/lib/db"
import { homepageSettings } from "@/lib/db/schema/content"
import { eq } from "drizzle-orm"

export type HomepageMode = "auto" | "manual"
export type HomepageSection = "featured" | "thinkers"

/** Get mode for a homepage section. Defaults to "auto". */
export async function getHomepageMode(section: HomepageSection): Promise<HomepageMode> {
  // A3 — DB-null guard. If the pool is unconfigured (missing
  // DATABASE_URL) the page should render with safe defaults rather
  // than crash. "auto" is the documented default and matches the
  // catch-fallback below for transient errors.
  if (!db) return "auto"
  try {
    const [row] = await db
      .select({ value: homepageSettings.value })
      .from(homepageSettings)
      .where(eq(homepageSettings.key, `${section}_mode`))
      .limit(1)
    return (row?.value === "manual" ? "manual" : "auto") as HomepageMode
  } catch {
    return "auto"
  }
}

/** Set mode for a homepage section */
export async function setHomepageMode(section: HomepageSection, mode: HomepageMode): Promise<void> {
  const key = `${section}_mode`
  await db!
    .insert(homepageSettings)
    .values({ key, value: mode, updated_at: new Date() })
    .onConflictDoUpdate({
      target: homepageSettings.key,
      set: { value: mode, updated_at: new Date() },
    })
}

/** Get all homepage settings as a map */
export async function getAllHomepageSettings(): Promise<Record<string, string>> {
  // A3 — DB-null guard. Empty-map default matches the catch-fallback.
  if (!db) return {}
  try {
    const rows = await db.select().from(homepageSettings)
    const map: Record<string, string> = {}
    for (const row of rows) {
      map[row.key] = row.value
    }
    return map
  } catch {
    return {}
  }
}
