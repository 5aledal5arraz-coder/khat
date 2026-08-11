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

/**
 * Read any homepage setting by key.
 *
 * `homepage_settings` is key/value, which is why the episode-hall filter needed
 * no migration: it is just another row.
 */
export async function getHomepageSetting(key: string): Promise<string | null> {
  if (!db) return null
  try {
    const [row] = await db
      .select({ value: homepageSettings.value })
      .from(homepageSettings)
      .where(eq(homepageSettings.key, key))
      .limit(1)
    return row?.value ?? null
  } catch {
    return null
  }
}

/** Write any homepage setting by key. */
export async function setHomepageSetting(key: string, value: string): Promise<void> {
  await db!
    .insert(homepageSettings)
    .values({ key, value, updated_at: new Date() })
    .onConflictDoUpdate({
      target: homepageSettings.key,
      set: { value, updated_at: new Date() },
    })
}

/**
 * Whether the homepage guest strip is shown at all.
 *
 * Separate from the auto/manual mode: mode answers "which guests", this answers
 * "any guests". Between seasons — or on a day the strip would show four faces
 * and look thin — Khaled can take the whole rail down without clearing the
 * manual list he has built.
 *
 * DEFAULTS TO VISIBLE, and the key is `_hidden` rather than `_visible` for that
 * reason: an absent row, an unreadable database and a typo'd value all have to
 * mean "show it", because the failure mode of the opposite default is a section
 * that silently disappears and gives no clue why.
 */
export async function isGuestStripHidden(): Promise<boolean> {
  return (await getHomepageSetting("thinkers_hidden")) === "true"
}

/** Show or hide the whole guest strip. */
export async function setGuestStripHidden(hidden: boolean): Promise<void> {
  await setHomepageSetting("thinkers_hidden", hidden ? "true" : "false")
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
