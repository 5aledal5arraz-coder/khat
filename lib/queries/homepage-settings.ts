import { db } from "@/lib/db"
import { homepageSettings } from "@/lib/db/schema/content"
import { eq } from "drizzle-orm"
import {
  GUEST_STRIP_LIMIT_DEFAULT,
  clampGuestStripLimit,
} from "@/lib/homepage/hall"

export { GUEST_STRIP_LIMIT_DEFAULT, clampGuestStripLimit } from "@/lib/homepage/hall"

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

/**
 * How many faces the guest strip shows.
 *
 * THREE HARDCODED NUMBERS USED TO DECIDE THIS and none of them was reachable:
 * the auto query stopped gathering at 12, the manual editor offered exactly 3
 * slots, and the dedup against the hero and the grid ate whatever was left —
 * which is how a show with 20 guests ended up showing 5.
 *
 * Clamped, not trusted: the value is written by an admin control, but a stray
 * 0 would empty the strip and a stray 500 would issue 500 per-guest queries.
 */
export async function getGuestStripLimit(): Promise<number> {
  const raw = await getHomepageSetting("thinkers_limit")
  if (raw === null) return GUEST_STRIP_LIMIT_DEFAULT
  return clampGuestStripLimit(Number(raw))
}

export async function setGuestStripLimit(n: number): Promise<void> {
  await setHomepageSetting("thinkers_limit", String(clampGuestStripLimit(n)))
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
