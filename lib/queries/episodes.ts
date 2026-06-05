import { db, USE_DB as DB_AVAILABLE } from "@/lib/db"
import { eq, desc, asc, and, ilike, ne, gte, sql } from "drizzle-orm"
import {
  episodes,
  guests,
  timestamps as timestampsTable,
  quotes as quotesTable,
  resources as resourcesTable,
  hiddenEpisodes,
} from "@/lib/db/schema"
import type {
  Episode,
  Guest,
  Timestamp,
  Quote,
  Resource,
  EpisodeWithRelations,
  GuestWithRelations,
} from "@/types/database"
import { getCachedEpisodes } from "@/lib/cache/episode-cache"
import {
  fetchEpisodeBySlug as ytFetchBySlug,
  fetchMostViewedRecent as ytFetchMostViewed,
} from "@/lib/youtube/queries"
import { getEpisodeOverrides, applyOverrides } from "@/lib/episodes/overrides"
import { searchEpisodes, searchGuests } from "@/lib/search"
import { getPublishedQuotes } from "@/lib/episodes/quotes"
import { getEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { mergeEpisodeLists, mergeEpisode } from "@/lib/episodes/merge"
import { getDeletedEpisodeIds } from "@/lib/episodes/deleted"

// ─── Configuration ───────────────────────────────────────────────────────────

const USE_YOUTUBE = !!process.env.YOUTUBE_API_KEY
const IS_DEV = process.env.NODE_ENV === "development"

// ─── Normalization: DB rows → domain types ───────────────────────────────────

function nestJoinedRow(row: {
  episodes: typeof episodes.$inferSelect
  guests: typeof guests.$inferSelect | null
}): Episode {
  const ep = row.episodes
  const g = row.guests
  return {
    ...ep,
    release_date: String(ep.release_date),
    created_at: ep.created_at ? ep.created_at.toISOString() : new Date().toISOString(),
    category_id: ep.category_id || null,
    updated_at: ep.updated_at ? ep.updated_at.toISOString() : undefined,
    guest: g
      ? {
          id: g.id,
          name: g.name,
          slug: g.slug,
          bio: g.bio,
          photo_url: g.photo_url,
          external_links: g.external_links,
          testimonial: g.testimonial,
          created_at: g.created_at ? g.created_at.toISOString() : new Date().toISOString(),
        }
      : null,
  } as Episode
}

function dbGuestToGuest(g: typeof guests.$inferSelect): Guest {
  return {
    id: g.id,
    name: g.name,
    slug: g.slug,
    bio: g.bio,
    photo_url: g.photo_url,
    external_links: g.external_links,
    testimonial: g.testimonial,
    created_at: g.created_at ? g.created_at.toISOString() : new Date().toISOString(),
  }
}

function dbEpisodeToEpisode(e: typeof episodes.$inferSelect): Episode {
  return {
    id: e.id,
    title: e.title,
    slug: e.slug,
    description: e.description || null,
    summary: e.summary || null,
    key_takeaways: e.key_takeaways || null,
    youtube_url: e.youtube_url,
    duration_minutes: e.duration_minutes,
    release_date: String(e.release_date),
    episode_number: e.episode_number || null,
    season: e.season || null,
    mood: e.mood || null,
    thumbnail_url: e.thumbnail_url || null,
    status: e.status || undefined,
    featured: e.featured || undefined,
    view_count: e.view_count || null,
    category_id: e.category_id || null,
    guest_id: e.guest_id || null,
    guest_testimonial: e.guest_testimonial || null,
    guest_video_url: e.guest_video_url || null,
    created_at: e.created_at ? e.created_at.toISOString() : new Date().toISOString(),
    updated_at: e.updated_at ? e.updated_at.toISOString() : undefined,
  } as Episode
}

// ─── Data Sources ────────────────────────────────────────────────────────────

async function getHiddenEpisodeIds(): Promise<Set<string>> {
  if (!DB_AVAILABLE) return new Set()
  try {
    const rows = await db!
      .select({ episode_id: hiddenEpisodes.episode_id })
      .from(hiddenEpisodes)
    return new Set(rows.map((r) => r.episode_id))
  } catch {
    return new Set()
  }
}

async function fetchDbEpisodeList(): Promise<Episode[]> {
  if (!DB_AVAILABLE) return []
  try {
    const rows = await db!
      .select()
      .from(episodes)
      .leftJoin(guests, eq(episodes.guest_id, guests.id))
      .orderBy(desc(episodes.release_date))
    return rows.map(nestJoinedRow)
  } catch (error) {
    console.error("DB episode list fetch failed:", error)
    return []
  }
}

async function fetchDbEpisodeById(id: string): Promise<Partial<Episode> | null> {
  if (!DB_AVAILABLE) return null
  try {
    const rows = await db!
      .select()
      .from(episodes)
      .leftJoin(guests, eq(episodes.guest_id, guests.id))
      .where(eq(episodes.id, id))
    if (!rows[0]) return null
    return nestJoinedRow(rows[0])
  } catch {
    return null
  }
}

/** Fetch episode from DB by slug with full relations (timestamps, quotes, resources). */
async function fetchDbEpisodeDetail(slug: string): Promise<EpisodeWithRelations | null> {
  if (!DB_AVAILABLE) return null

  const episodeRows = await db!.select().from(episodes).where(eq(episodes.slug, slug))
  const episodeRow = episodeRows[0]
  if (!episodeRow) return null

  const [guestRows, timestampRows, quoteRows, resourceRows] = await Promise.all([
    episodeRow.guest_id
      ? db!.select().from(guests).where(eq(guests.id, episodeRow.guest_id))
      : Promise.resolve([]),
    db!
      .select()
      .from(timestampsTable)
      .where(eq(timestampsTable.episode_id, episodeRow.id))
      .orderBy(asc(timestampsTable.time_seconds)),
    db!
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.episode_id, episodeRow.id)),
    db!
      .select()
      .from(resourcesTable)
      .where(eq(resourcesTable.episode_id, episodeRow.id)),
  ])

  const ep = dbEpisodeToEpisode(episodeRow)
  const guestRow = guestRows[0] || null

  return {
    ...ep,
    guest_id: episodeRow.guest_id || null,
    guest: guestRow ? dbGuestToGuest(guestRow) : null,
    timestamps: timestampRows.map((t) => ({
      id: t.id,
      episode_id: t.episode_id,
      time_seconds: t.time_seconds,
      title: t.title,
      description: t.description || null,
    })),
    quotes: quoteRows.map((q) => ({
      id: q.id,
      episode_id: q.episode_id,
      guest_id: q.guest_id || null,
      text: q.text,
      theme: q.theme || null,
      created_at: q.created_at ? q.created_at.toISOString() : new Date().toISOString(),
    })),
    resources: resourceRows.map((r) => ({
      id: r.id,
      episode_id: r.episode_id,
      title: r.title,
      url: r.url,
      type: r.type || null,
    })),
  }
}

async function loadMockEpisodes(): Promise<Episode[]> {
  const { mockEpisodes } = await import("@/lib/mocks/episodes")
  return mockEpisodes
}

async function loadMockGuests(): Promise<Guest[]> {
  const { mockGuests } = await import("@/lib/mocks/episodes")
  return mockGuests
}

// ─── Unified Data Resolution ─────────────────────────────────────────────────

/**
 * Resolve all episodes from the best available source.
 * Priority: YouTube (merged with DB) → DB-only → Mock (dev only) → Error
 */
async function resolveAllEpisodes(): Promise<Episode[]> {
  // Source 1: YouTube + DB merge
  if (USE_YOUTUBE) {
    try {
      const [ytEpisodes, dbEpisodes] = await Promise.all([
        getCachedEpisodes(),
        fetchDbEpisodeList(),
      ])
      return mergeEpisodeLists(ytEpisodes, dbEpisodes)
    } catch (error) {
      console.error("YouTube source failed, falling back to DB:", error)
    }
  }

  // Source 2: DB-only
  if (DB_AVAILABLE) {
    try {
      const dbEpisodes = await fetchDbEpisodeList()
      if (dbEpisodes.length > 0) return dbEpisodes
    } catch (error) {
      console.error("DB source failed:", error)
    }
  }

  // Source 3: Mock (dev only)
  if (IS_DEV) {
    console.warn("[DEV] Using mock episode data — no data source available")
    return loadMockEpisodes()
  }

  throw new Error(
    "No episode data source available. Ensure DATABASE_URL or YOUTUBE_API_KEY is configured."
  )
}

/**
 * Resolve a single episode by slug with full detail.
 * Priority: YouTube (merged with DB) → DB detail → null
 */
async function resolveEpisodeBySlug(slug: string): Promise<EpisodeWithRelations | null> {
  // Source 1: YouTube + DB merge + enrichment
  if (USE_YOUTUBE) {
    try {
      let episode = await ytFetchBySlug(slug)
      if (episode) {
        const dbEp = await fetchDbEpisodeById(episode.id)
        episode = mergeEpisode(episode, dbEp)

        const enrichment = await getEpisodeEnrichment(episode.id)

        const enrichedTimestamps: Timestamp[] = enrichment?.timestamps
          ? enrichment.timestamps.map((t, i) => ({
              id: `enr-ts-${i}`,
              episode_id: episode!.id,
              time_seconds: t.time_seconds,
              title: t.title,
              description: t.description || null,
            }))
          : []

        const enrichedResources: Resource[] = enrichment?.resources
          ? enrichment.resources.map((r, i) => ({
              id: `enr-res-${i}`,
              episode_id: episode!.id,
              title: r.title,
              url: r.url,
              type: r.type || null,
            }))
          : []

        const configQuotes = await getPublishedQuotes(
          episode.id,
          episode.guest?.id || null
        )

        // Attach category
        let category = null
        if (episode.category_id) {
          const { getCategoryById } = await import("@/lib/queries/categories")
          category = await getCategoryById(episode.category_id)
        }

        return {
          ...episode,
          summary: enrichment?.full_summary || episode.description || null,
          key_takeaways: enrichment?.takeaways || null,
          mood: null,
          guest_id: episode.guest?.id || null,
          guest: episode.guest || null,
          category,
          timestamps: enrichedTimestamps,
          quotes: configQuotes,
          resources: enrichedResources,
        }
      }
    } catch (error) {
      console.error("YouTube episode fetch failed, falling back to DB:", error)
    }
  }

  // Source 2: DB with full relations
  if (DB_AVAILABLE) {
    try {
      const episode = await fetchDbEpisodeDetail(slug)
      if (episode) {
        // Attach category
        if (episode.category_id) {
          const { getCategoryById } = await import("@/lib/queries/categories")
          episode.category = await getCategoryById(episode.category_id)
        }
        // Append config-file quotes
        const configQuotes = await getPublishedQuotes(
          episode.id,
          episode.guest_id || null
        )
        if (configQuotes.length > 0) {
          episode.quotes = [...episode.quotes, ...configQuotes]
        }
        return episode
      }
    } catch (error) {
      console.error("DB episode detail fetch failed:", error)
    }
  }

  // Source 3: Mock (dev only)
  if (IS_DEV) {
    const { mockEpisodes, mockTimestamps, mockQuotes, mockResources } = await import(
      "@/lib/mocks/episodes"
    )
    const mockEp = mockEpisodes.find((e) => e.slug === slug)
    if (!mockEp) return null

    const mockEnrichment = await getEpisodeEnrichment(mockEp.id)
    const configQuotes = await getPublishedQuotes(
      mockEp.id,
      mockEp.guest?.id || null
    )

    return {
      ...mockEp,
      summary: mockEnrichment?.full_summary || mockEp.summary || null,
      key_takeaways: mockEnrichment?.takeaways || mockEp.key_takeaways || null,
      mood: mockEp.mood || null,
      guest_id: mockEp.guest_id || null,
      guest: mockEp.guest || null,
      timestamps: mockTimestamps.filter((t) => t.episode_id === mockEp.id),
      quotes: [
        ...mockQuotes.filter((q) => q.episode_id === mockEp.id),
        ...configQuotes,
      ],
      resources: mockResources.filter((r) => r.episode_id === mockEp.id),
    }
  }

  return null
}

/**
 * Resolve all guests from the database.
 *
 * The admin panel is the single source of truth for guests.
 * Guests are NOT derived from YouTube episode metadata.
 */
async function resolveAllGuests(): Promise<Guest[]> {
  if (!DB_AVAILABLE) {
    throw new Error("Database not available — guests require a database connection.")
  }
  try {
    const rows = await db!.select().from(guests).orderBy(asc(guests.name))
    return rows.map(dbGuestToGuest)
  } catch (error) {
    console.error("DB guest fetch failed:", error)
    throw new Error("Failed to fetch guests from database.")
  }
}

// ─── List Pipeline ───────────────────────────────────────────────────────────

/**
 * Apply overrides, hidden filter, category, search, and pagination
 * to a raw episode list. This is the single place all list-mode
 * filtering/enrichment happens.
 */
async function applyListPipeline(
  rawEpisodes: Episode[],
  options?: {
    category?: string
    season?: number
    guestSlug?: string
    search?: string
    limit?: number
    offset?: number
    includeHidden?: boolean
  }
): Promise<Episode[]> {
  const [overrides, hiddenIds, deletedIds] = await Promise.all([
    getEpisodeOverrides(),
    options?.includeHidden ? Promise.resolve(new Set<string>()) : getHiddenEpisodeIds(),
    // Tombstoned episodes are ALWAYS excluded, regardless of includeHidden.
    getDeletedEpisodeIds(),
  ])

  let result = applyOverrides(rawEpisodes, overrides)

  // Filter deleted (hard-delete tombstones) — always on
  if (deletedIds.size > 0) {
    const before = result.length
    result = result.filter((ep) => !deletedIds.has(ep.id))
    if (before !== result.length) {
      console.info(
        `[episodes] Filtered ${before - result.length} tombstoned episode(s) from list`,
      )
    }
  }

  // Filter hidden
  if (hiddenIds.size > 0) {
    result = result.filter((ep) => !hiddenIds.has(ep.id))
  }

  // Filter by category
  if (options?.category) {
    result = await filterByCategory(result, options.category)
  }

  // Filter by season
  if (options?.season) {
    result = result.filter((e) => e.season === options.season)
  }

  // Filter by guest slug
  if (options?.guestSlug) {
    result = result.filter((e) => e.guest?.slug === options.guestSlug)
  }

  // Arabic-aware search
  if (options?.search) {
    result = searchEpisodes(result, options.search)
  }

  // Paginate last
  if (options?.limit) {
    const offset = options.offset || 0
    result = result.slice(offset, offset + options.limit)
  }

  return result
}

// ─── Category Filtering ──────────────────────────────────────────────────────

/**
 * Filter episodes by category slug.
 * Uses the DB-backed category_id on each episode + a slug→id lookup.
 */
async function filterByCategory(
  episodeList: Episode[],
  categorySlug: string,
): Promise<Episode[]> {
  const { getCategoryBySlug } = await import("@/lib/queries/categories")
  const category = await getCategoryBySlug(categorySlug)
  if (!category) return []
  return episodeList.filter((e) => e.category_id === category.id)
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getEpisodes(options?: {
  guestSlug?: string
  season?: number
  search?: string
  category?: string
  limit?: number
  offset?: number
  includeHidden?: boolean
}): Promise<Episode[]> {
  const rawEpisodes = await resolveAllEpisodes()
  return applyListPipeline(rawEpisodes, options)
}

export async function getEpisodeBySlug(
  slug: string
): Promise<EpisodeWithRelations | null> {
  const [hiddenIds, deletedIds] = await Promise.all([
    getHiddenEpisodeIds(),
    getDeletedEpisodeIds(),
  ])
  const episode = await resolveEpisodeBySlug(slug)
  if (!episode) return null

  // Block tombstoned episodes — always
  if (deletedIds.has(episode.id)) {
    console.info(`[episodes] Blocked slug "${slug}" — tombstoned (id: ${episode.id})`)
    return null
  }

  // Block hidden episodes
  if (hiddenIds.has(episode.id)) return null

  // Apply overrides
  const overrides = await getEpisodeOverrides()
  const [overridden] = applyOverrides([episode], overrides)

  return { ...episode, ...overridden }
}

export async function getLatestEpisode(): Promise<Episode | null> {
  const rawEpisodes = await resolveAllEpisodes()
  const enriched = await applyListPipeline(rawEpisodes)
  return enriched[0] || null
}

export async function getMostViewedRecent(
  days: number = 30
): Promise<Episode | null> {
  // Try YouTube's optimized endpoint first
  if (USE_YOUTUBE) {
    try {
      const [hiddenIds, deletedIds] = await Promise.all([
        getHiddenEpisodeIds(),
        getDeletedEpisodeIds(),
      ])
      const episode = await ytFetchMostViewed(days)
      if (episode && !hiddenIds.has(episode.id) && !deletedIds.has(episode.id)) {
        return episode
      }
    } catch (error) {
      console.error("YouTube most-viewed fetch failed:", error)
    }
  }

  // Fallback: resolve all, filter by date, sort by views
  const rawEpisodes = await resolveAllEpisodes()
  const enriched = await applyListPipeline(rawEpisodes)

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const recent = enriched.filter(
    (ep) => new Date(ep.release_date) >= cutoffDate
  )

  const sorted = (recent.length > 0 ? recent : enriched).sort(
    (a, b) => (b.view_count || 0) - (a.view_count || 0)
  )

  return sorted[0] || null
}

export async function getGuests(options?: {
  search?: string
}): Promise<Guest[]> {
  let guestList = await resolveAllGuests()

  if (options?.search) {
    guestList = searchGuests(guestList, options.search)
  }

  return guestList
}

export async function getGuestBySlug(
  slug: string
): Promise<GuestWithRelations | null> {
  // Admin panel (DB) is the single source of truth for guests.
  if (!DB_AVAILABLE) {
    console.error("Database not available — guests require a database connection.")
    return null
  }

  try {
    const guestRows = await db!
      .select()
      .from(guests)
      .where(eq(guests.slug, slug))
    const guestRow = guestRows[0]
    if (!guestRow) return null

    // Fetch episodes linked to this guest via DB relationship (guest_id)
    // and quotes authored by this guest.
    const [episodeRows, quoteRows] = await Promise.all([
      db!
        .select()
        .from(episodes)
        .where(eq(episodes.guest_id, guestRow.id))
        .orderBy(desc(episodes.release_date)),
      db!
        .select()
        .from(quotesTable)
        .where(eq(quotesTable.guest_id, guestRow.id)),
    ])

    return {
      ...dbGuestToGuest(guestRow),
      episodes: episodeRows.map((e) => dbEpisodeToEpisode(e)) as Episode[],
      quotes: quoteRows.map((q) => ({
        id: q.id,
        episode_id: q.episode_id,
        guest_id: q.guest_id || null,
        text: q.text,
        theme: q.theme || null,
        created_at: q.created_at
          ? q.created_at.toISOString()
          : new Date().toISOString(),
      })) as Quote[],
    } as GuestWithRelations
  } catch (error) {
    console.error("DB guest fetch failed:", error)
    return null
  }
}

export async function getAdjacentEpisodes(
  currentSlug: string
): Promise<{ prev: Episode | null; next: Episode | null }> {
  const allEpisodes = await getEpisodes({})

  const currentIndex = allEpisodes.findIndex((e) => e.slug === currentSlug)
  if (currentIndex === -1) return { prev: null, next: null }

  // "next" = newer episode (index - 1), "prev" = older episode (index + 1)
  const next = currentIndex > 0 ? allEpisodes[currentIndex - 1] : null
  const prev =
    currentIndex < allEpisodes.length - 1
      ? allEpisodes[currentIndex + 1]
      : null

  return { prev, next }
}

export async function getRelatedEpisodes(
  episodeId: string,
  limit: number = 3
): Promise<Episode[]> {
  const allEpisodes = await resolveAllEpisodes()
  const enriched = await applyListPipeline(allEpisodes)

  return enriched.filter((e) => e.id !== episodeId).slice(0, limit)
}

export async function getEpisodeCounts(): Promise<Record<string, number>> {
  const allEpisodes = await resolveAllEpisodes()
  const enriched = await applyListPipeline(allEpisodes)

  const counts: Record<string, number> = { all: enriched.length }

  // Count per category_id
  for (const ep of enriched) {
    if (ep.category_id) {
      counts[ep.category_id] = (counts[ep.category_id] || 0) + 1
    }
  }

  return counts
}
