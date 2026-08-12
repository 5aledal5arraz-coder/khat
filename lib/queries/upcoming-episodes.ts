/**
 * `upcoming_episodes` — reads and writes.
 *
 * The table is an ALLOW-list (see the schema comment in
 * `lib/db/schema/upcoming-episodes.ts`): nothing surfaces a row until a reader
 * here is written on purpose. There are exactly three public readers today —
 * `/episodes/[slug]`, `app/sitemap.ts`, and the homepage guest strip — and each
 * one goes through a function that hard-filters `status = 'published'` in SQL,
 * not in memory. A draft can therefore only leak if someone adds a reader that
 * skips this module.
 *
 * Every select projects its columns explicitly. A bare `select()` on a joined
 * guest pulls admin-only contact columns into the awaited pg Result, which
 * React's dev-mode async-debug channel serializes into the flight payload —
 * the same reason `homepage-thinkers.ts` projects.
 */

import { db } from "@/lib/db"
import { upcomingEpisodes } from "@/lib/db/schema/upcoming-episodes"
import { episodes, guests, episodeIntelligenceRecords } from "@/lib/db/schema"
import { and, desc, eq, inArray, ne, notExists, sql } from "drizzle-orm"

export type UpcomingEpisodeStatus = "draft" | "published" | "withdrawn"

/** The three states the CHECK constraint allows. Keep in sync with 0027. */
export const UPCOMING_STATUSES: readonly UpcomingEpisodeStatus[] = [
  "draft",
  "published",
  "withdrawn",
] as const

export interface UpcomingEpisode {
  id: string
  eir_id: string
  slug: string
  guest_id: string | null
  title: string
  summary: string | null
  axes: string[]
  guest_message: string | null
  guest_message_audio_url: string | null
  guest_message_audio_duration: number | null
  /** Bare `YYYY-MM-DD`, or null for «قريباً». Feed it to `formatArabicDate`. */
  expected_date: string | null
  status: UpcomingEpisodeStatus
  published_episode_id: string | null
  needs_attention: boolean
  created_at: Date | null
  updated_at: Date | null
}

/** The guest, projected to the fields a public page may render. */
export interface UpcomingEpisodeGuest {
  id: string
  name: string
  slug: string | null
  bio: string | null
  photo_url: string | null
}

export interface UpcomingEpisodeWithGuest extends UpcomingEpisode {
  guest: UpcomingEpisodeGuest | null
}

/** Admin list row — enough to identify a page without opening it. */
export interface UpcomingEpisodeListItem extends UpcomingEpisode {
  guest_name: string | null
  eir_working_title: string | null
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

const ROW = {
  id: upcomingEpisodes.id,
  eir_id: upcomingEpisodes.eir_id,
  slug: upcomingEpisodes.slug,
  guest_id: upcomingEpisodes.guest_id,
  title: upcomingEpisodes.title,
  summary: upcomingEpisodes.summary,
  axes: upcomingEpisodes.axes,
  guest_message: upcomingEpisodes.guest_message,
  guest_message_audio_url: upcomingEpisodes.guest_message_audio_url,
  guest_message_audio_duration: upcomingEpisodes.guest_message_audio_duration,
  expected_date: upcomingEpisodes.expected_date,
  status: upcomingEpisodes.status,
  published_episode_id: upcomingEpisodes.published_episode_id,
  needs_attention: upcomingEpisodes.needs_attention,
  created_at: upcomingEpisodes.created_at,
  updated_at: upcomingEpisodes.updated_at,
} as const

const GUEST = {
  guest_name: guests.name,
  guest_slug: guests.slug,
  guest_bio: guests.bio,
  guest_photo_url: guests.photo_url,
} as const

/** Normalize the raw driver shape into the exported interface. */
function toUpcoming(row: Record<string, unknown>): UpcomingEpisode {
  return {
    id: row.id as string,
    eir_id: row.eir_id as string,
    slug: row.slug as string,
    guest_id: (row.guest_id as string | null) ?? null,
    title: row.title as string,
    summary: (row.summary as string | null) ?? null,
    // `jsonb` defaults to `[]` but an older row could hold null; never hand a
    // page a non-array here — `.map()` on it is a render crash.
    axes: Array.isArray(row.axes) ? (row.axes as string[]) : [],
    guest_message: (row.guest_message as string | null) ?? null,
    guest_message_audio_url: (row.guest_message_audio_url as string | null) ?? null,
    guest_message_audio_duration: (row.guest_message_audio_duration as number | null) ?? null,
    expected_date: (row.expected_date as string | null) ?? null,
    status: row.status as UpcomingEpisodeStatus,
    published_episode_id: (row.published_episode_id as string | null) ?? null,
    needs_attention: Boolean(row.needs_attention),
    created_at: (row.created_at as Date | null) ?? null,
    updated_at: (row.updated_at as Date | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// Public reads — every one filters on `published` in SQL
// ---------------------------------------------------------------------------

/**
 * The public page for a slug, or null.
 *
 * `status = 'published'` is part of the WHERE clause, not a check on the
 * result: a draft must not even be fetched, so no future edit to the caller
 * can accidentally render one.
 */
export async function getPublishedUpcomingBySlug(
  slug: string,
): Promise<UpcomingEpisodeWithGuest | null> {
  if (!db) return null
  try {
    const rows = await db
      .select({ ...ROW, ...GUEST })
      .from(upcomingEpisodes)
      .leftJoin(guests, eq(guests.id, upcomingEpisodes.guest_id))
      .where(
        and(eq(upcomingEpisodes.slug, slug), eq(upcomingEpisodes.status, "published")),
      )
      .limit(1)

    const row = rows[0]
    if (!row) return null

    return {
      ...toUpcoming(row),
      guest: row.guest_name
        ? {
            id: (row.guest_id as string | null) ?? "",
            name: row.guest_name,
            slug: row.guest_slug ?? null,
            bio: row.guest_bio ?? null,
            photo_url: row.guest_photo_url ?? null,
          }
        : null,
    }
  } catch {
    return null
  }
}

/**
 * THE TWO-STEP RESOLUTION for `/episodes/<slug>`, in one place.
 *
 * PUBLISHED ALWAYS WINS. `episodes` is tried first and `upcoming_episodes` is
 * only consulted when it comes back empty — so from the moment an episode
 * exists at a slug, the placeholder that reserved it stops being reachable and
 * no redirect is ever needed. The two eras share one permanent URL.
 *
 * It lives here, not inline in the route, for one reason: the precedence is
 * the whole design and it is worth being able to test it directly. The episode
 * reader is injected rather than imported so this module stays free of
 * `lib/cache` — the route passes `getCachedEpisodeBySlug`.
 */
export async function resolveEpisodeSlug<E>(
  slug: string,
  getEpisode: (slug: string) => Promise<E | null | undefined>,
): Promise<
  | { kind: "episode"; episode: E }
  | { kind: "upcoming"; upcoming: UpcomingEpisodeWithGuest }
  | null
> {
  const episode = await getEpisode(slug)
  if (episode) return { kind: "episode", episode }

  const upcoming = await getPublishedUpcomingBySlug(slug)
  if (upcoming) return { kind: "upcoming", upcoming }

  return null
}

/**
 * Published slugs for `app/sitemap.ts`.
 *
 * A page whose slug is ALREADY SERVED BY AN EPISODE is skipped, so the sitemap
 * lists each URL exactly once.
 *
 * THE TEST IS THE EPISODE'S EXISTENCE, NOT `published_episode_id`. That column
 * is bookkeeping written by the transition, and the whole reason
 * `needs_attention` exists is that the transition can fail to run — an episode
 * can appear at this slug while the column is still NULL. Filtering on the
 * column would then emit one `<loc>` twice with two different `lastmod`s and
 * two different priorities, which is exactly the kind of claim a crawler
 * punishes. `NOT EXISTS` asks the question the reader actually answers, and it
 * is the SAME rule as `resolveEpisodeSlug`: if an episode holds the slug, the
 * episode is the page. The two can no longer disagree.
 */
export async function listPublishedUpcomingForSitemap(): Promise<
  { slug: string; updated_at: Date | null }[]
> {
  const database = db
  if (!database) return []
  try {
    const rows = await database
      .select({ slug: upcomingEpisodes.slug, updated_at: upcomingEpisodes.updated_at })
      .from(upcomingEpisodes)
      .where(
        and(
          eq(upcomingEpisodes.status, "published"),
          notExists(
            database
              .select({ one: sql`1` })
              .from(episodes)
              .where(eq(episodes.slug, upcomingEpisodes.slug)),
          ),
        ),
      )
    return rows
  } catch {
    return []
  }
}

/**
 * Which of these guests have a live «قريباً» page — `guest_id → slug`.
 *
 * The homepage strip decides on the SERVER whether an upcoming face is a link.
 * Sending the whole roster to the client and letting it guess would either
 * link faces that lead to the not-found page, or withhold links that work.
 */
export async function getPublishedUpcomingSlugsByGuestIds(
  guestIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!db || guestIds.length === 0) return out
  try {
    const rows = await db
      .select({ guest_id: upcomingEpisodes.guest_id, slug: upcomingEpisodes.slug })
      .from(upcomingEpisodes)
      .where(
        and(
          eq(upcomingEpisodes.status, "published"),
          inArray(upcomingEpisodes.guest_id, guestIds),
        ),
      )
    for (const r of rows) {
      if (r.guest_id && !out.has(r.guest_id)) out.set(r.guest_id, r.slug)
    }
    return out
  } catch {
    return out
  }
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

/** Every row, newest first — drafts and withdrawn included. Admin only. */
export async function listUpcomingEpisodesForAdmin(): Promise<UpcomingEpisodeListItem[]> {
  if (!db) return []
  try {
    const rows = await db
      .select({
        ...ROW,
        guest_name: guests.name,
        eir_working_title: episodeIntelligenceRecords.working_title,
      })
      .from(upcomingEpisodes)
      .leftJoin(guests, eq(guests.id, upcomingEpisodes.guest_id))
      .leftJoin(
        episodeIntelligenceRecords,
        eq(episodeIntelligenceRecords.id, upcomingEpisodes.eir_id),
      )
      .orderBy(desc(upcomingEpisodes.created_at))

    return rows.map((row) => ({
      ...toUpcoming(row),
      guest_name: row.guest_name ?? null,
      eir_working_title: row.eir_working_title ?? null,
    }))
  } catch {
    return []
  }
}

export async function getUpcomingEpisodeById(id: string): Promise<UpcomingEpisode | null> {
  if (!db) return null
  try {
    const rows = await db.select(ROW).from(upcomingEpisodes).where(eq(upcomingEpisodes.id, id)).limit(1)
    return rows[0] ? toUpcoming(rows[0]) : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Slug reservation
// ---------------------------------------------------------------------------

export type SlugCheck = { ok: true; slug: string } | { ok: false; error: string }

/**
 * `/episodes/<slug>` is served by TWO tables, and only one UNIQUE index can
 * exist per table — so uniqueness across the pair is this function's job.
 *
 * It refuses rather than de-duplicates. Minting `…-2` behind the operator's
 * back is the wrong outcome for a URL whose entire purpose is to be pasted
 * into a newsletter before the episode exists: he would distribute the slug he
 * typed and the page would live somewhere else.
 *
 * A collision with `episodes` is the more serious of the two and says so
 * separately, because the fix is different — that URL is already taken by a
 * published episode and will never be free.
 */
export async function reserveUpcomingSlug(
  rawSlug: string,
  opts: { excludeId?: string } = {},
): Promise<SlugCheck> {
  const slug = normalizeSlug(rawSlug)
  if (!slug) return { ok: false, error: "الرابط (slug) مطلوب" }
  if (slug.length > 200) return { ok: false, error: "الرابط طويل جداً (الحد ٢٠٠ حرف)" }
  // `/ ? # %` would either split the path or collide with percent-encoding —
  // Arabic slugs are encoded on output, so a raw `%` here double-encodes.
  if (/[/?#%]/.test(slug)) {
    return { ok: false, error: "الرابط ما يقبل الرموز / ? # %" }
  }

  if (!db) return { ok: false, error: "قاعدة البيانات غير متوفرة" }

  const [episodeHit] = await db
    .select({ slug: episodes.slug })
    .from(episodes)
    .where(eq(episodes.slug, slug))
    .limit(1)
  if (episodeHit) {
    return {
      ok: false,
      error: `الرابط «${slug}» مستخدم من حلقة منشورة — اختر رابطاً ثانياً`,
    }
  }

  const conditions = [eq(upcomingEpisodes.slug, slug)]
  if (opts.excludeId) conditions.push(ne(upcomingEpisodes.id, opts.excludeId))
  const [upcomingHit] = await db
    .select({ id: upcomingEpisodes.id })
    .from(upcomingEpisodes)
    .where(and(...conditions))
    .limit(1)
  if (upcomingHit) {
    return {
      ok: false,
      error: `الرابط «${slug}» مستخدم من صفحة حلقة قادمة ثانية`,
    }
  }

  return { ok: true, slug }
}

/** Trim, collapse whitespace to a dash, drop wrapping slashes. No transliteration. */
export function normalizeSlug(raw: string): string {
  return (raw ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, "-")
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface UpcomingEpisodeInput {
  eir_id: string
  slug: string
  guest_id?: string | null
  title: string
  summary?: string | null
  axes?: string[]
  guest_message?: string | null
  guest_message_audio_url?: string | null
  guest_message_audio_duration?: number | null
  expected_date?: string | null
  status?: UpcomingEpisodeStatus
}

export type UpcomingWriteResult =
  | { ok: true; row: UpcomingEpisode }
  | { ok: false; error: string }

/** Shared field cleanup. Empty strings become null so «قريباً» is one branch. */
function sanitize(input: Partial<UpcomingEpisodeInput>) {
  return {
    ...(input.eir_id !== undefined ? { eir_id: input.eir_id } : {}),
    ...(input.guest_id !== undefined ? { guest_id: input.guest_id || null } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.summary !== undefined ? { summary: input.summary?.trim() || null } : {}),
    ...(input.axes !== undefined
      ? { axes: input.axes.map((a) => a.trim()).filter(Boolean) }
      : {}),
    ...(input.guest_message !== undefined
      ? { guest_message: input.guest_message?.trim() || null }
      : {}),
    ...(input.guest_message_audio_url !== undefined
      ? { guest_message_audio_url: input.guest_message_audio_url || null }
      : {}),
    ...(input.guest_message_audio_duration !== undefined
      ? { guest_message_audio_duration: input.guest_message_audio_duration ?? null }
      : {}),
    ...(input.expected_date !== undefined
      ? { expected_date: input.expected_date || null }
      : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  }
}

/**
 * The reservation is INSIDE create/update, not a step the caller must remember.
 * A caller that forgets it would hand the URL's uniqueness to a UNIQUE
 * violation on one table and to nothing at all on the other.
 */
export async function createUpcomingEpisode(
  input: UpcomingEpisodeInput,
): Promise<UpcomingWriteResult> {
  if (!db) return { ok: false, error: "قاعدة البيانات غير متوفرة" }
  if (!input.eir_id) return { ok: false, error: "اختر الحلقة (EIR) أولاً" }
  if (!input.title?.trim()) return { ok: false, error: "العنوان مطلوب" }

  const reserved = await reserveUpcomingSlug(input.slug)
  if (!reserved.ok) return reserved

  try {
    const rows = await db
      .insert(upcomingEpisodes)
      .values({
        ...sanitize(input),
        eir_id: input.eir_id,
        title: input.title.trim(),
        slug: reserved.slug,
        status: input.status ?? "draft",
      })
      .returning(ROW)
    return rows[0]
      ? { ok: true, row: toUpcoming(rows[0]) }
      : { ok: false, error: "تعذّر إنشاء الصفحة" }
  } catch (error) {
    return { ok: false, error: writeError(error) }
  }
}

export async function updateUpcomingEpisode(
  id: string,
  input: Partial<UpcomingEpisodeInput>,
): Promise<UpcomingWriteResult> {
  if (!db) return { ok: false, error: "قاعدة البيانات غير متوفرة" }
  if (!id) return { ok: false, error: "المعرّف مفقود" }
  if (input.title !== undefined && !input.title.trim()) {
    return { ok: false, error: "العنوان مطلوب" }
  }

  let slug: string | undefined
  if (input.slug !== undefined) {
    const reserved = await reserveUpcomingSlug(input.slug, { excludeId: id })
    if (!reserved.ok) return reserved
    slug = reserved.slug
  }

  try {
    const rows = await db
      .update(upcomingEpisodes)
      .set({
        ...sanitize(input),
        ...(slug ? { slug } : {}),
        updated_at: new Date(),
      })
      .where(eq(upcomingEpisodes.id, id))
      .returning(ROW)
    return rows[0]
      ? { ok: true, row: toUpcoming(rows[0]) }
      : { ok: false, error: "الصفحة غير موجودة" }
  } catch (error) {
    return { ok: false, error: writeError(error) }
  }
}

/**
 * Turn a driver error into something the operator can act on. The two we can
 * actually hit are the EIR uniqueness (one page per planned episode) and the
 * FK — both are operator mistakes, not outages, and «حدث خطأ» hides which.
 */
function writeError(error: unknown): string {
  // READ THROUGH `cause`. Drizzle wraps driver failures in a DrizzleQueryError
  // whose own `message` is the SQL TEXT — the constraint name only appears on
  // the pg error underneath it, as `constraint` and in that error's message.
  // Matching `error.message` alone therefore matched nothing and every one of
  // these operator mistakes surfaced as the generic «تعذّر الحفظ». Caught by
  // the EIR-uniqueness test in tests/upcoming-episodes-db.test.ts.
  const text = [
    error instanceof Error ? error.message : String(error),
    ...causeChain(error),
  ].join(" | ")
  if (/upcoming_episodes_eir_id_unique/.test(text)) {
    return "هذي الحلقة (EIR) عندها صفحة قادمة أصلاً"
  }
  if (/upcoming_episodes_eir_id_fk/.test(text)) {
    return "الحلقة (EIR) المختارة غير موجودة"
  }
  if (/upcoming_episodes_status_check/.test(text)) {
    return "حالة غير معروفة"
  }
  if (/upcoming_episodes_slug_unique/.test(text)) {
    return "الرابط مستخدم — حدّث الصفحة وجرّب مرة ثانية"
  }
  console.error("[upcoming-episodes] write failed:", error)
  return "تعذّر الحفظ"
}

/** Every `cause` message plus any pg `constraint` name, down the chain. */
function causeChain(error: unknown): string[] {
  const out: string[] = []
  let current: unknown = error
  // Bounded: a malformed cause cycle must not hang a server action.
  for (let depth = 0; depth < 5 && current; depth++) {
    const c = (current as { constraint?: unknown }).constraint
    if (typeof c === "string") out.push(c)
    current = (current as { cause?: unknown }).cause
    if (current instanceof Error) out.push(current.message)
    else if (typeof current === "string") out.push(current)
  }
  return out
}
