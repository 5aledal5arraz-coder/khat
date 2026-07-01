import { env } from "@/lib/env"
import { XMLParser } from "fast-xml-parser"
import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema"
import { eq, and, gte, lte } from "drizzle-orm"
import { updateRssSyncStatus } from "@/lib/queries/audio-platforms"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RssItem {
  guid: string
  title: string
  pubDate: string
  enclosureUrl: string | null
  enclosureType: string | null
  duration: number | null
}

export interface SyncResult {
  syncedAt: string
  totalItems: number
  matched: number
  skipped: number
  errors: string[]
  status: "success" | "error"
  message?: string
}

// ---------------------------------------------------------------------------
// Duration parser — handles "HH:MM:SS", "MM:SS", or raw seconds
// ---------------------------------------------------------------------------

function parseDuration(raw: string | number | undefined | null): number | null {
  if (raw == null) return null
  if (typeof raw === "number") return raw

  const str = String(raw).trim()
  if (!str) return null

  const parts = str.split(":").map(Number)
  if (parts.some(isNaN)) return null

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

// ---------------------------------------------------------------------------
// Title normalization for fuzzy matching
// ---------------------------------------------------------------------------

function normalizeTitle(title: string): string {
  return title
    // Strip Arabic diacritics (tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    // Remove common separators and punctuation
    .replace(/[#\-|–—:.,،؟?!؛;'"()[\]{}«»]/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

// ---------------------------------------------------------------------------
// RSS feed parser
// ---------------------------------------------------------------------------

function extractItems(parsed: Record<string, unknown>): RssItem[] {
  const channel = (parsed as Record<string, Record<string, unknown>>)?.rss?.channel as Record<string, unknown> | undefined
  if (!channel) return []

  const rawValue = channel.item
  if (!rawValue) return []
  const rawItems = Array.isArray(rawValue) ? rawValue : [rawValue]

  return rawItems.map((item: Record<string, unknown>) => {
    // guid: prefer <guid> text, fallback to link
    let guid = ""
    if (typeof item.guid === "string") {
      guid = item.guid
    } else if (item.guid && typeof item.guid === "object" && (item.guid as Record<string, unknown>)["#text"]) {
      guid = (item.guid as Record<string, string>)["#text"]
    } else if (typeof item.link === "string") {
      guid = item.link
    }

    // enclosure
    const enclosure = (item.enclosure || {}) as Record<string, unknown>
    const enclosureUrl = (enclosure["@_url"] as string) || null
    const enclosureType = (enclosure["@_type"] as string) || null

    // itunes:duration
    const duration = parseDuration(item["itunes:duration"] as string | number | undefined | null)

    return {
      guid,
      title: String(item.title || "").trim(),
      pubDate: String(item.pubDate || ""),
      enclosureUrl,
      enclosureType,
      duration,
    } as RssItem
  })
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

async function findByRssGuid(guid: string) {
  if (!db || !guid) return null
  const rows = await db
    .select()
    .from(episodes)
    .where(eq(episodes.rss_guid, guid))
    .limit(1)
  return rows[0] || null
}

async function findByTitleAndDate(title: string, pubDate: string) {
  if (!db || !title) return null

  const date = new Date(pubDate)
  if (isNaN(date.getTime())) return null

  const start = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000)
  const end = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000)

  const candidates = await db
    .select()
    .from(episodes)
    .where(
      and(
        gte(episodes.release_date, start.toISOString().split("T")[0]),
        lte(episodes.release_date, end.toISOString().split("T")[0]),
      ),
    )

  if (candidates.length === 0) return null

  const normalizedRss = normalizeTitle(title)

  // Try exact normalized match first
  const exact = candidates.find(
    (ep) => normalizeTitle(ep.title) === normalizedRss,
  )
  if (exact) return exact

  // Try contains match (RSS title contains DB title or vice versa)
  const partial = candidates.find((ep) => {
    const normalizedDb = normalizeTitle(ep.title)
    return normalizedDb.includes(normalizedRss) || normalizedRss.includes(normalizedDb)
  })
  return partial || null
}

async function matchAndUpdate(item: RssItem): Promise<boolean> {
  if (!db) return false

  // Primary: match by rss_guid
  let episode = await findByRssGuid(item.guid)

  // Secondary: match by normalized title + date window
  if (!episode && item.title) {
    episode = await findByTitleAndDate(item.title, item.pubDate)
  }

  if (!episode) return false

  // Build update — only audio fields
  const updates: Record<string, unknown> = {}

  if (!episode.rss_guid && item.guid) {
    updates.rss_guid = item.guid
  }

  // Never overwrite non-null audio_url with null
  if (item.enclosureUrl) {
    updates.audio_url = item.enclosureUrl
    updates.audio_type = item.enclosureType || "audio/mpeg"
  }

  if (item.duration != null) {
    updates.audio_duration = item.duration
  }

  if (item.pubDate) {
    const parsed = new Date(item.pubDate)
    if (!isNaN(parsed.getTime())) {
      updates.rss_published_at = parsed
    }
  }

  if (Object.keys(updates).length === 0) return false

  await db.update(episodes).set(updates).where(eq(episodes.id, episode.id))
  return true
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncRssFeed(): Promise<SyncResult> {
  const feedUrl = env.RSS_FEED_URL
  if (!feedUrl) {
    const result: SyncResult = {
      syncedAt: new Date().toISOString(),
      totalItems: 0,
      matched: 0,
      skipped: 0,
      errors: ["RSS_FEED_URL غير محدد في متغيرات البيئة"],
      status: "error",
      message: "RSS_FEED_URL غير محدد",
    }
    await updateRssSyncStatus(result)
    return result
  }

  // Fetch RSS XML
  const response = await fetch(feedUrl, { cache: "no-store" })
  if (!response.ok) {
    const result: SyncResult = {
      syncedAt: new Date().toISOString(),
      totalItems: 0,
      matched: 0,
      skipped: 0,
      errors: [`فشل تحميل RSS: HTTP ${response.status}`],
      status: "error",
      message: `فشل تحميل RSS: HTTP ${response.status}`,
    }
    await updateRssSyncStatus(result)
    return result
  }

  const xml = await response.text()

  // Parse XML
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  })
  const parsed = parser.parse(xml)
  const items = extractItems(parsed)

  let matched = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of items) {
    try {
      const updated = await matchAndUpdate(item)
      if (updated) matched++
      else skipped++
    } catch (err: unknown) {
      errors.push(`"${item.title}": ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const result: SyncResult = {
    syncedAt: new Date().toISOString(),
    totalItems: items.length,
    matched,
    skipped,
    errors,
    status: errors.length > 0 ? "error" : "success",
    message: `تم مزامنة ${matched} حلقة، تخطي ${skipped}${errors.length > 0 ? `، ${errors.length} خطأ` : ""}`,
  }

  await updateRssSyncStatus(result)
  return result
}
